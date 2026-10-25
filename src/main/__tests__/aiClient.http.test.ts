import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { chatCompletion, AiClientError } from '../aiClient'

/**
 * 真实 HTTP 集成测试：本地启动 OpenAI 兼容模拟服务，
 * 用全局 fetch 走完整网络链路（与 Electron 主进程运行时行为一致）。
 */

const SECRET = 'sk-integration-test-key-000123'

interface ReceivedRequest {
  url: string
  authorization?: string
  body: Record<string, unknown>
}

let server: Server
let baseUrl = ''
const received: ReceivedRequest[] = []
let mode: 'ok' | 'ok-fenced' | '429' | 'bad-json' | '401-key-in-body' | 'reasoning-empty' = 'ok'

function reply(response: ServerResponse<IncomingMessage>, status: number, body: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(body)
}

beforeAll(async () => {
  server = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => {
      received.push({
        url: request.url ?? '',
        authorization: request.headers.authorization,
        body: JSON.parse(raw || '{}')
      })
      switch (mode) {
        case 'ok':
          reply(response, 200, JSON.stringify({ choices: [{ message: { content: '[{"front":"Q","back":"A"}]' } }] }))
          break
        case 'ok-fenced':
          reply(response, 200, JSON.stringify({ choices: [{ message: { content: '```json\n[{"front":"Q","back":"A"}]\n```' } }] }))
          break
        case '429':
          reply(response, 429, JSON.stringify({ error: { message: 'rate limit exceeded' } }))
          break
        case 'bad-json':
          reply(response, 200, '<html>bad gateway page</html>')
          break
        case '401-key-in-body':
          reply(response, 401, JSON.stringify({ error: { message: `invalid api key ${SECRET}` } }))
          break
        case 'reasoning-empty':
          // DeepSeek 思考模型真实场景：预算被推理耗尽，content 为空串
          reply(
            response,
            200,
            JSON.stringify({
              choices: [
                {
                  message: { role: 'assistant', content: '', reasoning_content: 'thinking...' },
                  finish_reason: 'length'
                }
              ],
              usage: { completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 20 } }
            })
          )
          break
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address && typeof address === 'object') {
    baseUrl = `http://127.0.0.1:${address.port}/v1`
  }
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('chatCompletion 真实 HTTP 链路', () => {
  it('成功：请求格式正确（模型/消息/max_tokens），返回内容', async () => {
    mode = 'ok'
    const content = await chatCompletion(
      {
        baseUrl,
        apiKey: SECRET,
        model: 'mock-model',
        messages: [{ role: 'user', content: '生成卡片' }],
        maxTokens: 100
      },
      fetch
    )
    expect(content).toContain('"front"')
    const last = received[received.length - 1]
    expect(last.url).toBe('/v1/chat/completions')
    expect(last.authorization).toBe(`Bearer ${SECRET}`)
    expect(last.body.model).toBe('mock-model')
    expect(last.body.max_tokens).toBe(100)
    expect(last.body.stream).toBe(false)
  })

  it('带代码围栏的输出原样返回，由渲染层解析', async () => {
    mode = 'ok-fenced'
    const content = await chatCompletion(
      { baseUrl, model: 'm', messages: [{ role: 'user', content: 'x' }] },
      fetch
    )
    expect(content).toContain('```')
  })

  it('HTTP 429 → 中文提示且可重试', async () => {
    mode = '429'
    await expect(
      chatCompletion({ baseUrl, model: 'm', messages: [{ role: 'user', content: 'x' }] }, fetch)
    ).rejects.toSatisfy((error: unknown) => {
      const e = error as AiClientError
      expect(e.message).toContain('429')
      expect(e.retryable).toBe(true)
      return true
    })
  })

  it('思考模型空内容（HTTP 200 + reasoning 耗尽预算）→ 精确诊断且不含推理正文', async () => {
    mode = 'reasoning-empty'
    await expect(
      chatCompletion({ baseUrl, model: 'deepseek-flash', messages: [{ role: 'user', content: 'x' }] }, fetch)
    ).rejects.toSatisfy((error: unknown) => {
      const message = (error as AiClientError).message
      expect(message).toContain('思考')
      expect(message).toContain('20')
      expect(message).not.toContain('thinking...')
      return true
    })
  })

  it('HTTP 200 但响应体不是 JSON → invalid-response', async () => {
    mode = 'bad-json'
    await expect(
      chatCompletion({ baseUrl, model: 'm', messages: [{ role: 'user', content: 'x' }] }, fetch)
    ).rejects.toThrow('不是有效 JSON')
  })

  it('401 且错误体回显密钥 → 错误信息已脱敏', async () => {
    mode = '401-key-in-body'
    await expect(
      chatCompletion({ baseUrl, apiKey: SECRET, model: 'm', messages: [{ role: 'user', content: 'x' }] }, fetch)
    ).rejects.toSatisfy((error: unknown) => {
      const message = (error as AiClientError).message
      expect(message).toContain('认证失败')
      expect(message).not.toContain(SECRET)
      expect(message).toContain('***')
      return true
    })
  })
})
