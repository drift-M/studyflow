import { ipcMain } from 'electron'
import { chatCompletion, AiClientError, maskSecret, type ChatMessage } from './aiClient'
import { loadConfigInfo, saveConfig, getActiveProvider, type AiProviderConfig, type AiConfigInfo } from './aiConfig'

const CHANNEL_GET = 'ai:get-config'
const CHANNEL_SAVE = 'ai:save-config'
const CHANNEL_CLEAR_KEY = 'ai:clear-key'
const CHANNEL_TEST = 'ai:test-connection'
const CHANNEL_GENERATE = 'ai:generate'
const CHANNEL_CANCEL = 'ai:cancel-generate'

/** 生成输入上限：超长文本截断，控制成本与上下文 */
export const AI_INPUT_CHAR_LIMIT = 30_000
/** 单次请求输出 token 上限 */
/** 单次请求输出 token 上限（思考型模型的推理过程也计入，需要留足余量） */
export const AI_OUTPUT_TOKEN_LIMIT = 8000
const REQUEST_TIMEOUT_MS = 90_000

/** 进行中的生成任务（callId → AbortController），支持取消 */
const activeGenerations = new Map<string, AbortController>()

/** 生成参数：只传提示词与采样参数，密钥由主进程自行取用 */
export interface AiGenerateRequest {
  callId: string
  /** chat 内容（提示词已由渲染进程的 prompts 模块构建） */
  prompt: string
  systemPrompt?: string
  maxTokens?: number
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} 无效`)
  }
  return value
}

export function registerAiIpcHandlers(): void {
  ipcMain.handle(CHANNEL_GET, (): Promise<AiConfigInfo> => loadConfigInfo())

  ipcMain.handle(
    CHANNEL_SAVE,
    (_event, config: unknown, apiKey?: unknown): Promise<AiConfigInfo> => {
      if (typeof config !== 'object' || config === null) {
        return Promise.reject(new Error('配置格式无效'))
      }
      const typed = config as Partial<AiProviderConfig>
      const normalized: AiProviderConfig = {
        mode: typed.mode === 'local' || typed.mode === 'api' ? typed.mode : 'demo',
        localBaseUrl: requireString(typed.localBaseUrl ?? '', '本地服务地址') || 'http://localhost:11434/v1',
        localModel: typeof typed.localModel === 'string' ? typed.localModel : '',
        apiBaseUrl: typeof typed.apiBaseUrl === 'string' ? typed.apiBaseUrl : '',
        apiModel: typeof typed.apiModel === 'string' ? typed.apiModel : ''
      }
      if (typeof apiKey !== 'string' && apiKey !== undefined && apiKey !== null) {
        return Promise.reject(new Error('API Key 格式无效'))
      }
      return saveConfig(normalized, apiKey as string | null | undefined)
    }
  )

  ipcMain.handle(CHANNEL_CLEAR_KEY, async (): Promise<AiConfigInfo> => {
    const info = await loadConfigInfo()
    return saveConfig(info.config, null)
  })

  /** 连接测试：发送一条最小请求验证服务与模型可用（由用户在设置页主动触发） */
  ipcMain.handle(CHANNEL_TEST, async (): Promise<{ ok: boolean; message: string }> => {
    const provider = await getActiveProvider()
    if (!provider) {
      return { ok: false, message: '当前是演示模式，无需测试连接' }
    }
    if (!provider.baseUrl) {
      return { ok: false, message: '服务地址为空，请先填写' }
    }
    if (!provider.model) {
      return { ok: false, message: '模型名称为空，请先填写' }
    }
    if (provider.kind === 'api' && !provider.apiKey) {
      return { ok: false, message: 'API Key 未设置，请先保存' }
    }
    try {
      const reply = await chatCompletion(
        {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: provider.model,
          messages: [{ role: 'user', content: '请只回复两个字：可用' }],
          // 思考型模型（如 deepseek-flash）的推理过程计入 max_tokens，
          // 预算过小会导致 content 为空（finish_reason=length）
          maxTokens: 512,
          timeoutMs: 60_000
        },
        fetch
      )
      return { ok: true, message: `连接成功，模型已响应（预览：${reply.slice(0, 40)}）` }
    } catch (error) {
      const message = error instanceof AiClientError ? error.message : maskSecret(String(error))
      return { ok: false, message }
    }
  })

  ipcMain.handle(
    CHANNEL_GENERATE,
    async (_event, request: unknown): Promise<{ ok: true; content: string } | { ok: false; error: string; retryable?: boolean; kind?: string }> => {
      if (typeof request !== 'object' || request === null) {
        return { ok: false, error: '生成请求格式无效' }
      }
      const typed = request as Partial<AiGenerateRequest>
      const callId = typeof typed.callId === 'string' ? typed.callId : ''
      const prompt = typeof typed.prompt === 'string' ? typed.prompt : ''
      if (!callId || !prompt) {
        return { ok: false, error: '生成请求缺少必要参数' }
      }
      const provider = await getActiveProvider()
      if (!provider) {
        return { ok: false, error: '当前是演示模式，没有可用的模型服务' }
      }
      if (!provider.baseUrl || !provider.model) {
        return { ok: false, error: '模型服务未配置完整，请到设置页填写服务地址与模型名称' }
      }
      if (provider.kind === 'api' && !provider.apiKey) {
        return { ok: false, error: 'API Key 未设置，请到设置页保存' }
      }

      const controller = new AbortController()
      activeGenerations.set(callId, controller)
      try {
        const messages: ChatMessage[] = [
          ...(typed.systemPrompt
            ? [{ role: 'system' as const, content: typed.systemPrompt }]
            : []),
          { role: 'user' as const, content: prompt.slice(0, AI_INPUT_CHAR_LIMIT * 2) }
        ]
        const content = await chatCompletion(
          {
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            model: provider.model,
            messages,
            maxTokens: Math.min(typed.maxTokens ?? AI_OUTPUT_TOKEN_LIMIT, AI_OUTPUT_TOKEN_LIMIT),
            timeoutMs: REQUEST_TIMEOUT_MS,
            signal: controller.signal
          },
          fetch
        )
        return { ok: true, content }
      } catch (error) {
        if (error instanceof AiClientError) {
          return { ok: false, error: error.message, retryable: error.retryable, kind: error.kind }
        }
        return { ok: false, error: maskSecret(String(error)) }
      } finally {
        activeGenerations.delete(callId)
      }
    }
  )

  ipcMain.handle(CHANNEL_CANCEL, (_event, callId: unknown): boolean => {
    if (typeof callId !== 'string') return false
    const controller = activeGenerations.get(callId)
    if (controller) {
      controller.abort(new Error('aborted'))
      return true
    }
    return false
  })
}
