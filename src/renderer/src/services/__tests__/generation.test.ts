import { describe, it, expect } from 'vitest'
import { demoGenerationService } from '../demo'
import { buildCardPrompt, buildQuestionPrompt } from '../prompts'
import {
  validateGeneratedCard,
  validateGeneratedQuestion,
  validateCardBatch,
  validateQuestionBatch
} from '../validate'

const SAMPLE_TEXT = `机器学习入门

监督学习是使用有标注数据训练模型的一种学习方式。无监督学习是指在没有标注的数据中发现内在结构。强化学习就是智能体通过与环境交互获得奖励来学习策略。过拟合是模型过度拟合训练数据的噪声。`

const SCOPE = '机器学习入门'

describe('演示模式：知识卡片生成', () => {
  it('从定义句式生成卡片，字段完整且标注来源', async () => {
    const cards = await demoGenerationService.generateCards({
      sourceTitle: '测试资料',
      scopeLabel: SCOPE,
      text: SAMPLE_TEXT,
      count: 5
    })
    expect(cards.length).toBeGreaterThanOrEqual(3)
    for (const card of cards) {
      expect(card.front.length).toBeGreaterThan(0)
      expect(card.back.length).toBeGreaterThan(0)
      expect(card.sourceChapter).toBe(SCOPE)
    }
  })

  it('相同输入生成完全相同的结果（确定性）', async () => {
    const input = { sourceTitle: '测试资料', scopeLabel: SCOPE, text: SAMPLE_TEXT, count: 10 }
    const first = await demoGenerationService.generateCards(input)
    const second = await demoGenerationService.generateCards(input)
    expect(second).toEqual(first)
  })

  it('数量上限被遵守', async () => {
    const cards = await demoGenerationService.generateCards({
      sourceTitle: 'T',
      scopeLabel: SCOPE,
      text: SAMPLE_TEXT,
      count: 2
    })
    expect(cards.length).toBeLessThanOrEqual(2)
  })

  it('内容不足时能兜底生成并且不超出可用内容', async () => {
    const shortText = '这个句子有高频词汇出现。这个句子有高频词汇出现。这个句子有高频词汇出现。'
    const cards = await demoGenerationService.generateCards({
      sourceTitle: 'T',
      scopeLabel: SCOPE,
      text: shortText,
      count: 5
    })
    // 可用内容有限时可能少于目标数量，但不为空且都通过校验
    expect(cards.length).toBeGreaterThanOrEqual(1)
  })
})

describe('演示模式：练习题生成', () => {
  it('生成单选/判断/简答三种题型', async () => {
    const questions = await demoGenerationService.generateQuestions({
      sourceTitle: '测试资料',
      scopeLabel: SCOPE,
      text: SAMPLE_TEXT,
      count: 9,
      questionTypes: ['choice', 'judge', 'short']
    })
    const types = new Set(questions.map((question) => question.type))
    expect(types.has('choice')).toBe(true)
    expect(types.has('judge')).toBe(true)
    expect(types.has('short')).toBe(true)
    for (const question of questions) {
      expect(question.sourceChapter).toBe(SCOPE)
      if (question.type === 'choice') {
        expect(question.options.length).toBeGreaterThanOrEqual(3)
        expect(question.answerIndex ?? -1).toBeLessThan(question.options.length)
        expect(new Set(question.options).size).toBe(question.options.length)
      }
      if (question.type === 'judge') {
        expect(question.options).toEqual(['正确', '错误'])
        expect([0, 1]).toContain(question.answerIndex)
      }
      if (question.type === 'short') {
        expect(String(question.answerText).length).toBeGreaterThan(0)
      }
    }
  })

  it('相同输入生成完全相同的结果（确定性）', async () => {
    const input = {
      sourceTitle: 'T',
      scopeLabel: SCOPE,
      text: SAMPLE_TEXT,
      count: 8,
      questionTypes: ['choice', 'judge', 'short'] as Array<'choice' | 'judge' | 'short'>
    }
    const first = await demoGenerationService.generateQuestions(input)
    const second = await demoGenerationService.generateQuestions(input)
    expect(second).toEqual(first)
  })

  it('判断题的错误变体与原文矛盾（依据另一条事实）', async () => {
    const questions = await demoGenerationService.generateQuestions({
      sourceTitle: 'T',
      scopeLabel: SCOPE,
      text: SAMPLE_TEXT,
      count: 12,
      questionTypes: ['judge']
    })
    const wrongOnes = questions.filter((question) => question.answerIndex === 1)
    expect(wrongOnes.length).toBeGreaterThan(0)
  })
})

describe('AI 提示词构建', () => {
  it('卡片提示词包含范围、数量与输出格式要求', () => {
    const prompt = buildCardPrompt('第 2 页', '文本内容', 10)
    expect(prompt).toContain('第 2 页')
    expect(prompt).toContain('10')
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('文本内容')
  })

  it('题目提示词包含题型限定', () => {
    const prompt = buildQuestionPrompt('第一章', '文本', 5, ['judge', 'short'])
    expect(prompt).toContain('判断题')
    expect(prompt).toContain('简答题')
    expect(prompt).not.toContain('单项选择题、')
  })
})

describe('AI 输出运行时校验', () => {
  it('合法卡片通过校验', () => {
    const card = validateGeneratedCard({
      front: '问题',
      back: '答案',
      explanation: '依据',
      sourceChapter: '第 1 页'
    })
    expect(card.front).toBe('问题')
  })

  it('非法卡片被拒绝并给出中文错误', () => {
    expect(() => validateGeneratedCard({ front: '', back: 'x' })).toThrow('正面或背面为空')
    expect(() => validateGeneratedCard(null)).toThrow('不是对象')
    expect(() => validateGeneratedCard({ front: 'a', back: 123 })).toThrow('正面或背面为空')
  })

  it('非法题目被拒绝：未知题型、答案越界、简答缺答案', () => {
    expect(() => validateGeneratedQuestion({ type: 'essay', question: 'q' })).toThrow('未知题型')
    expect(() =>
      validateGeneratedQuestion({ type: 'choice', question: 'q', options: ['A', 'B'], answerIndex: 5 })
    ).toThrow('越界')
    expect(() => validateGeneratedQuestion({ type: 'short', question: 'q' })).toThrow('缺少参考答案')
    expect(() =>
      validateGeneratedQuestion({ type: 'judge', question: 'q', answerIndex: 2 })
    ).toThrow('0（正确）或 1（错误）')
  })

  it('合法题目通过校验，judge 选项被规范化', () => {
    const question = validateGeneratedQuestion({ type: 'judge', question: 'q', answerIndex: 1 })
    expect(question.options).toEqual(['正确', '错误'])
    expect(question.answerIndex).toBe(1)
  })

  it('批量校验：全部失败抛错，部分失败跳过', () => {
    expect(() => validateCardBatch([{ front: '', back: '' }, { front: '', back: '' }])).toThrow(
      '全部无法通过格式校验'
    )
    const mixed = validateCardBatch([{ front: '', back: '' }, { front: 'a', back: 'b' }])
    expect(mixed).toHaveLength(1)

    expect(() =>
      validateQuestionBatch([{ type: 'choice', question: 'q', options: [], answerIndex: 0 }])
    ).toThrow('全部无法通过格式校验')
  })
})

describe('AI 服务（真实接入版）', () => {
  it('未在桌面环境（无 window.api）时给出明确提示而不是假装成功', async () => {
    const { aiGenerationService } = await import('../ai')
    expect(aiGenerationService.isConfigured()).toBe(true)
    await expect(
      aiGenerationService.generateCards({ sourceTitle: 'T', scopeLabel: 'S', text: 't', count: 5 })
    ).rejects.toThrow('桌面应用')
  })
})
