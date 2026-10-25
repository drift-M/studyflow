import { describe, it, expect } from 'vitest'
import { chatCompletion, maskSecret, chatCompletionsUrl, AiClientError } from '../aiClient'

const SECRET = 'sk-test-1234567890abcdef'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function openAiContent(content: string): unknown {
  return { choices: [{ message: { role: 'assistant', content } }] }
}

describe('maskSecret 脱敏', () => {
  it('抹去 Bearer 头与 sk- 令牌与原样密钥', () => {
    expect(maskSecret(`Bearer ${SECRET}`)).not.toContain(SECRET)
    expect(maskSecret(`auth failed for ${SECRET}`)).not.toContain(SECRET)
    expect(maskSecret('错误 sk-abcdefghijklmnop123456 发生')).not.toContain('sk-abcdefghijklmnop123456')
    expect(maskSecret('普通错误信息保持不变')).toBe('普通错误信息保持不变')
  })
})

describe('chatCompletionsUrl', () => {
  it('拼接 /chat/completions 并去除重复斜杠', () => {
    expect(chatCompletionsUrl('http://localhost:11434/v1')).toBe(
      'http://localhost:11434/v1/chat/completions'
    )
    expect(chatCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions'
    )
  })
})

describe('chatCompletion 成功与失败路径', () => {
  it('成功返回首条消息内容', async () => {
    const content = await chatCompletion(
      { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      async () => jsonResponse(openAiContent('你好，这是回复'))
    )
    expect(content).toBe('你好，这是回复')
  })

  it('携带 Authorization 头（不落入错误信息）', async () => {
    let seenAuth = ''
    await chatCompletion(
      { baseUrl: 'http://x/v1', apiKey: SECRET, model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      async (_url, init) => {
        seenAuth = init.headers.Authorization ?? ''
        return jsonResponse(openAiContent('ok'))
      }
    )
    expect(seenAuth).toBe(`Bearer ${SECRET}`)
  })

  it('HTTP 401 → 认证失败（不重试），且不泄露密钥', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', apiKey: SECRET, model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () =>
          new Response(`{"error":{"message":"invalid key ${SECRET}"}}`, { status: 401 })
      )
    ).rejects.toSatisfy((error: unknown) => {
      const e = error as AiClientError
      expect(e.message).toContain('认证失败')
      expect(e.message).not.toContain(SECRET)
      expect(e.retryable).toBe(false)
      return true
    })
  })

  it('HTTP 429 → 限流提示且标记可重试', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () => new Response('{"error":{"message":"rate limited"}}', { status: 429 })
      )
    ).rejects.toSatisfy((error: unknown) => {
      const e = error as AiClientError
      expect(e.message).toContain('429')
      expect(e.retryable).toBe(true)
      return true
    })
  })

  it('HTTP 404 → 提示地址需以 /v1 结尾', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () => new Response('not found', { status: 404 })
      )
    ).rejects.toThrow('/v1')
  })

  it('网络错误 → 可重试且提示检查服务地址', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:11434')
        }
      )
    ).rejects.toSatisfy((error: unknown) => {
      const e = error as AiClientError
      expect(e.message).toContain('无法连接模型服务')
      expect(e.retryable).toBe(true)
      return true
    })
  })

  it('超时 → kind=timeout 且可重试', async () => {
    await expect(
      chatCompletion(
        {
          baseUrl: 'http://x/v1',
          model: 'm',
          messages: [{ role: 'user', content: 'hi' }],
          timeoutMs: 30
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return jsonResponse(openAiContent('late'))
        }
      )
    ).rejects.toSatisfy((error: unknown) => {
      const e = error as AiClientError
      expect(e.kind).toBe('timeout')
      expect(e.retryable).toBe(true)
      return true
    })
  })

  it('外部取消 → kind=aborted，提示已取消', async () => {
    const external = new AbortController()
    // 模拟真实 fetch 行为：abort 时拒绝请求
    const promise = chatCompletion(
      {
        baseUrl: 'http://x/v1',
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        signal: external.signal,
        timeoutMs: 5000
      },
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
    )
    setTimeout(() => external.abort(), 30)
    await expect(promise).rejects.toSatisfy((error: unknown) => {
      const e = error as AiClientError
      expect(e.kind).toBe('aborted')
      expect(e.message).toContain('取消')
      return true
    })
  })

  it('响应不是 JSON / 结构不符 → invalid-response', async () => {
    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () => new Response('<html>gateway</html>', { status: 200 })
      )
    ).rejects.toThrow('不是有效 JSON')

    await expect(
      chatCompletion(
        { baseUrl: 'http://x/v1', model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        async () => jsonResponse({ foo: 'bar' })
      )
    ).rejects.toThrow('结构不符合')
  })
})
