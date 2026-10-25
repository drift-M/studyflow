/**
 * OpenAI 兼容 Chat Completions 客户端（主进程专用，纯函数可单测）。
 *
 * 安全约定：
 * - API Key 只存在于主进程内存与 safeStorage 加密文件中
 * - 任何错误信息返回渲染进程前必须经过 maskSecret 脱敏
 * - 不记录含密钥的日志
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 与全局 fetch 兼容的最小结构类型（便于单测注入假实现） */
interface MinimalResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

interface MinimalFetch {
  (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }): Promise<MinimalResponse>
}

export interface ChatCompletionParams {
  baseUrl: string
  apiKey?: string
  model: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export class AiClientError extends Error {
  /** retryable: 网络抖动 / 限流 / 5xx 可重试；4xx 配置类错误不重试 */
  readonly retryable: boolean
  readonly kind: 'timeout' | 'aborted' | 'http' | 'network' | 'invalid-response'
  readonly status?: number

  constructor(message: string, kind: AiClientError['kind'], options?: { retryable?: boolean; status?: number }) {
    super(message)
    this.name = 'AiClientError'
    this.kind = kind
    this.retryable = options?.retryable ?? false
    this.status = options?.status
  }
}

/** 从任何文本中抹去密钥形态的字符串（返回给渲染进程/日志前调用） */
export function maskSecret(text: string, secret?: string): string {
  let masked = text
  if (secret && secret.length >= 8) {
    masked = masked.split(secret).join('***')
  }
  // 兜底：抹去常见 Bearer 头与 sk- 开头的长令牌
  masked = masked.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***')
  masked = masked.replace(/\bsk-[A-Za-z0-9_-]{16,}/g, 'sk-***')
  return masked
}

/** 规范化 baseUrl：去尾部斜杠；chat 路径拼接 */
export function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  return `${base}/chat/completions`
}

type FetchLike = MinimalFetch

/**
 * 执行一次 Chat Completions 请求并返回首条消息文本。
 * 网络层错误统一转为 AiClientError（已脱敏）。
 */
export async function chatCompletion(
  params: ChatCompletionParams,
  fetchImpl: FetchLike
): Promise<string> {
  const timeoutMs = params.timeoutMs ?? 90_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  // 外部取消（用户点取消）优先
  const onExternalAbort = (): void => controller.abort(new Error('aborted'))
  params.signal?.addEventListener('abort', onExternalAbort, { once: true })

  let response: MinimalResponse
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (params.apiKey) headers.Authorization = `Bearer ${params.apiKey}`
    response = await fetchImpl(chatCompletionsUrl(params.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: params.maxTokens ?? 4000,
        temperature: params.temperature ?? 0.3,
        stream: false
      }),
      signal: controller.signal
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    if (reason === 'aborted') {
      throw new AiClientError('已取消生成', 'aborted')
    }
    if (reason === 'timeout' || controller.signal.aborted) {
      throw new AiClientError(`请求超时（${Math.round(timeoutMs / 1000)} 秒），本地模型首次响应可能较慢，可重试或换更小的模型`, 'timeout', { retryable: true })
    }
    throw new AiClientError(
      maskSecret(`无法连接模型服务：${reason}。请确认服务已启动、地址正确（Ollama 默认 http://localhost:11434/v1）`, params.apiKey),
      'network',
      { retryable: true }
    )
  } finally {
    clearTimeout(timer)
    params.signal?.removeEventListener('abort', onExternalAbort)
  }

  // 假实现/特殊网关可能忽略 abort 信号仍然返回：到达时已超时或取消则视为失败
  if (controller.signal.aborted) {
    const abortedReason = (controller.signal.reason as Error | undefined)?.message
    if (abortedReason === 'aborted') {
      throw new AiClientError('已取消生成', 'aborted')
    }
    throw new AiClientError(`请求超时（${Math.round(timeoutMs / 1000)} 秒），本地模型首次响应可能较慢，可重试或换更小的模型`, 'timeout', { retryable: true })
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new AiClientError(
      maskSecret(describeHttpError(response.status, bodyText), params.apiKey),
      'http',
      { retryable: response.status === 429 || response.status >= 500, status: response.status }
    )
  }

  let json: unknown
  try {
    json = await response.json()
  } catch {
    throw new AiClientError('模型服务返回的内容不是有效 JSON', 'invalid-response', { retryable: true })
  }
  const content = extractMessageContent(json)
  if (!content) {
    throw new AiClientError('模型服务返回内容为空或结构不符合 OpenAI 格式', 'invalid-response', { retryable: true })
  }
  return content
}

function describeHttpError(status: number, body: string): string {
  const brief = body.replace(/\s+/g, ' ').trim().slice(0, 200)
  switch (status) {
    case 401:
    case 403:
      return `认证失败（HTTP ${status}）：API Key 无效或没有权限${brief ? `：${brief}` : ''}`
    case 404:
      return `接口不存在（HTTP 404）：请检查服务地址是否正确（通常需要以 /v1 结尾）${brief ? `：${brief}` : ''}`
    case 429:
      return `请求过于频繁或额度不足（HTTP 429），请稍后重试${brief ? `：${brief}` : ''}`
    default:
      if (status >= 500) {
        return `模型服务内部错误（HTTP ${status}），请稍后重试${brief ? `：${brief}` : ''}`
      }
      return `请求失败（HTTP ${status}）${brief ? `：${brief}` : ''}`
  }
}

function extractMessageContent(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null
  const choices = (json as Record<string, unknown>).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0] as Record<string, unknown>
  const message = first.message as Record<string, unknown> | undefined
  if (message && typeof message.content === 'string') return message.content
  if (typeof first.text === 'string') return first.text
  return null
}
