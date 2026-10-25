import { describe, it, expect } from 'vitest'
import { chatCompletion, AiClientError } from '../aiClient'

/**
 * DeepSeek 思考模型空内容场景（真实故障回归，2026-10 实测响应结构）：
 * max_tokens 过小时 reasoning 耗尽预算 → content 为空字符串、finish_reason=length。
 * 另覆盖：纯空输出、结构缺失、reasoning 不被当作正文。
 */

const SECRET = 'sk-test-placeholder-key'

function choiceResponse(
  message: Record<string, unknown> | null,
  finishReason: string,
  usage?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      id: 'x',
      object: 'chat.completion',
      model: 'deepseek-flash',
      choices: [{ index: 0, message, logprobs: null, finish_reason: finishReason }],
      usage: usage ?? {}
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

describe('思考模型空内容（DeepSeek 真实故障场景）', () => {
  it('content 为空串且 reasoning 耗尽预算 → 提示思考模式与 token 全部用于思考（含 reasoning_tokens 数值）', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', apiKey: SECRET, model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () =>
          choiceResponse(
            { role: 'assistant', content: '', reasoning_content: '我们需要回答用户……' },
            'length',
            { completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 20 } }
          )
      )
    ).rejects.toSatisfy((error: unknown) => {
      const e = error as AiClientError
      expect(e.kind).toBe('invalid-response')
      expect(e.message).toContain('思考')
      expect(e.message).toContain('20')
      expect(e.message).toContain('deepseek-chat')
      expect(e.message).not.toContain('我们需要回答用户')
      return true
    })
  })

  it('content 为 null 的思考模型响应 → 同样精确提示，不把 reasoning_content 当正文', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () =>
          choiceResponse(
            { role: 'assistant', content: null, reasoning_content: '思考中……' },
            'length',
            { completion_tokens_details: { reasoning_tokens: 99 } }
          )
      )
    ).rejects.toSatisfy((error: unknown) => {
      const message = (error as AiClientError).message
      expect(message).toContain('思考')
      expect(message).toContain('99')
      expect(message).not.toContain('思考中……')
      return true
    })
  })

  it('无 reasoning、finish_reason=length → 提示被 max_tokens 截断', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () => choiceResponse({ role: 'assistant', content: '' }, 'length')
      )
    ).rejects.toThrow('max_tokens 上限截断')
  })

  it('空内容且 finish_reason=stop → 提示空内容可重试', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () => choiceResponse({ role: 'assistant', content: '  ' }, 'stop')
      )
    ).rejects.toThrow('空内容')
  })

  it('choices 存在但缺少 message → 结构异常并附顶层字段名（仅 key 不含值）', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () =>
          new Response(JSON.stringify({ result: 'ok', items: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
      )
    ).rejects.toThrow('缺少 choices 数组')
  })

  it('choices[0] 无 message 无 text → 结构提示', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () =>
          new Response(JSON.stringify({ choices: [{ index: 0, finish_reason: 'stop' }], usage: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
      )
    ).rejects.toThrow('缺少 message')
  })

  it('有正常 content 时思考模型的 reasoning_content 不影响返回正文', async () => {
    const content = await chatCompletion(
      { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      async () =>
        choiceResponse(
          { role: 'assistant', content: '可用', reasoning_content: '推理过程……' },
          'stop',
          { completion_tokens: 34, completion_tokens_details: { reasoning_tokens: 32 } }
        )
    )
    expect(content).toBe('可用')
  })
})
