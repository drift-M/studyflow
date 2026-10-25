import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { extractJsonArrayText, parseModelJsonArray } from '../parse'

describe('模型输出解析', () => {
  it('纯 JSON 数组直接通过', () => {
    expect(parseModelJsonArray('[{"front":"a","back":"b"}]')).toHaveLength(1)
  })

  it('```json 代码围栏被剥离', () => {
    const raw = '```json\n[{"front":"a","back":"b"}]\n```'
    expect(parseModelJsonArray(raw)).toHaveLength(1)
  })

  it('无语言标注的围栏被剥离', () => {
    const raw = '```\n[1, 2, 3]\n```'
    expect(parseModelJsonArray(raw)).toHaveLength(3)
  })

  it('前后夹带说明文字时提取中间数组', () => {
    const raw = '好的，以下是生成的卡片：\n[{"front":"a","back":"b"}]\n希望对你有帮助！'
    expect(parseModelJsonArray(raw)).toHaveLength(1)
  })

  it('空输出报中文错误', () => {
    expect(() => parseModelJsonArray('   ')).toThrow('没有返回任何内容')
  })

  it('没有数组时报中文错误', () => {
    expect(() => parseModelJsonArray('抱歉，我无法处理这个请求。')).toThrow('没有找到 JSON 数组')
  })

  it('JSON 语法错误提示可能被截断', () => {
    expect(() => parseModelJsonArray('[{"front":"a", "back": "b"')).toThrow('无法解析')
  })

  it('对象输出且不含数组时报中文错误', () => {
    expect(() => parseModelJsonArray('{"message": "好的"}')).toThrow('没有找到 JSON 数组')
  })

  it('extractJsonArrayText 对深嵌套数组内容配平', () => {
    const raw = '前缀 [[1,[2,3]],4] 后缀'
    expect(extractJsonArrayText(raw)).toBe('[[1,[2,3]],4]')
  })
})

describe('AI 服务（模拟 window.api）', () => {
  interface MockCall {
    callId: string
    prompt: string
  }
  let calls: MockCall[]
  let responses: Array<{ ok: true; content: string } | { ok: false; error: string; retryable?: boolean }>
  let cancelCalls: string[]

  const goodCards = JSON.stringify([
    { front: '什么是监督学习？', back: '使用有标注数据训练模型', explanation: '原文第一句' },
    { front: '什么是过拟合？', back: '模型死记训练集噪声', explanation: '原文第二句' }
  ])

  beforeEach(() => {
    calls = []
    cancelCalls = []
    responses = []
    ;(globalThis as { window: unknown }).window = {
      api: {
        aiGenerate: async (request: MockCall) => {
          calls.push(request)
          const next = responses.length > 1 ? responses.shift() : responses[0]
          return next ?? { ok: true, content: goodCards }
        },
        aiCancelGenerate: async (callId: string) => {
          cancelCalls.push(callId)
          return true
        }
      }
    }
  })

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('成功路径：调用主进程 → 解析 → 校验 → 来源注入为所选范围', async () => {
    responses = [{ ok: true, content: '```json\n' + goodCards + '\n```' }]
    const { aiGenerationService } = await import('../ai')
    const cards = await aiGenerationService.generateCards({
      sourceTitle: '测试',
      scopeLabel: '第 2 页',
      text: '监督学习是使用有标注数据训练模型。',
      count: 5
    })
    expect(cards).toHaveLength(2)
    expect(cards[0].sourceChapter).toBe('第 2 页')
    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toContain('第 2 页')
    // 提示词要求输出 JSON，不包含密钥字段
    expect(calls[0].prompt).not.toMatch(/sk-|apiKey/i)
  })

  it('无效 JSON：不可重试错误直接抛出且信息脱敏（无 sk-）', async () => {
    responses = [{ ok: false, error: '模型输出的 JSON 无法解析（可能被截断）', retryable: false }]
    const { aiGenerationService } = await import('../ai')
    await expect(
      aiGenerationService.generateCards({ sourceTitle: 'T', scopeLabel: 'S', text: 't', count: 5 })
    ).rejects.toThrow('无法解析')
    expect(calls).toHaveLength(1) // 未重试
  })

  it('HTTP 429 可重试：第一次失败后自动重试成功', async () => {
    responses = [
      { ok: false, error: '请求过于频繁或额度不足（HTTP 429）', retryable: true },
      { ok: true, content: goodCards }
    ]
    const { aiGenerationService } = await import('../ai')
    const cards = await aiGenerationService.generateCards({
      sourceTitle: 'T',
      scopeLabel: 'S',
      text: 't',
      count: 5
    })
    expect(cards.length).toBeGreaterThan(0)
    expect(calls).toHaveLength(2) // 重试了一次
  })

  it('重试后仍失败：抛出最后一次错误，不会无限循环', async () => {
    responses = [
      { ok: false, error: '请求过于频繁（HTTP 429）', retryable: true },
      { ok: false, error: '请求过于频繁（HTTP 429）', retryable: true }
    ]
    const { aiGenerationService } = await import('../ai')
    await expect(
      aiGenerationService.generateCards({ sourceTitle: 'T', scopeLabel: 'S', text: 't', count: 5 })
    ).rejects.toThrow('429')
    expect(calls).toHaveLength(2) // 最多 1 次重试
  })

  it('错误信息不含密钥形态字符串', async () => {
    responses = [{ ok: false, error: '认证失败（HTTP 401）：API Key 无效', retryable: false }]
    const { aiGenerationService } = await import('../ai')
    await expect(
      aiGenerationService.generateCards({ sourceTitle: 'T', scopeLabel: 'S', text: 't', count: 5 })
    ).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message
      return !/sk-[A-Za-z0-9]{8,}/.test(message)
    })
  })

  it('模型输出缺少有效卡片时给出中文提示', async () => {
    responses = [{ ok: true, content: '[]' }]
    const { aiGenerationService } = await import('../ai')
    await expect(
      aiGenerationService.generateCards({ sourceTitle: 'T', scopeLabel: 'S', text: 't', count: 5 })
    ).rejects.toThrow('没有生成有效内容')
  })

  it('来源字段由前端注入：忽略模型自报的来源，防止编造页码', async () => {
    const fabricated = JSON.stringify([
      { front: 'Q', back: 'A', sourceChapter: '第 999 页（编造）' }
    ])
    responses = [{ ok: true, content: fabricated }]
    const { aiGenerationService } = await import('../ai')
    const cards = await aiGenerationService.generateCards({
      sourceTitle: 'T',
      scopeLabel: '第 1 页',
      text: 't',
      count: 5
    })
    expect(cards[0].sourceChapter).toBe('第 1 页')
  })
})
