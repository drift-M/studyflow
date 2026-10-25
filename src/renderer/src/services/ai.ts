import type { GenerationInput, GenerationService, GeneratedCard, GeneratedQuestion } from './types'
import { buildCardPrompt, buildQuestionPrompt } from './prompts'
import { parseModelJsonArray } from './parse'
import { validateCardBatch, validateQuestionBatch } from './validate'

/**
 * AI 生成服务：通过主进程 IPC 调用用户配置的模型（本地或自备 API）。
 *
 * 分层：
 * - 提示词：prompts.ts
 * - 模型调用：主进程 aiIpc/aiClient（渲染进程不接触密钥）
 * - JSON 解析：parse.ts（兼容代码围栏）
 * - 结构校验：validate.ts
 * - 本模块：编排 + 有限重试（网络/限流/5xx/超时最多重试 1 次；配置错误不重试）
 */

/** 单条消息的输出预算（20 条 JSON 也足够） */
const MAX_OUTPUT_TOKENS = 8000
/** 有限重试：最多额外尝试 1 次 */
const MAX_RETRIES = 1
/** 生成来源标记回填：提示词要求模型不填 sourceChapter，由本模块注入真实来源 */
const SYSTEM_PROMPT =
  '你是学习资料整理助手。严格只输出 JSON 数组，不要输出解释文字。不要编造来源字段。'

let callCounter = 0

export interface AiCallControl {
  /** 请求取消入口（由界面持有） */
  cancel(): void
}

/** 当前挂起的调用控制（模块级，供 GenerateModal 取消） */
let activeControl: AiCallControl | null = null

/** 用户点击取消时中断当前请求 */
export function cancelActiveGeneration(): void {
  activeControl?.cancel()
}

async function callModel(prompt: string): Promise<string> {
  if (typeof window === 'undefined' || !window.api) {
    throw new Error('AI 生成需要在桌面应用中使用')
  }
  const callId = `gen-${Date.now()}-${++callCounter}`
  let cancelled = false
  activeControl = {
    cancel(): void {
      cancelled = true
      void window.api.aiCancelGenerate(callId).catch(() => {})
    }
  }
  try {
    return await runWithRetry(callId, prompt)
  } finally {
    if (!cancelled) activeControl = null
    else activeControl = null
  }
}

async function runWithRetry(callId: string, prompt: string): Promise<string> {
  let lastError: Error = new Error('生成失败')
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await window.api.aiGenerate({
      callId,
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: MAX_OUTPUT_TOKENS
    })
    if (result.ok) {
      return result.content
    }
    const error = new Error(result.error)
    if (!result.retryable || attempt === MAX_RETRIES) {
      throw error
    }
    lastError = error
    // 限流/超时后稍等再重试，避免立即再次撞限
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
  throw lastError
}

/** 解析 + 校验模型输出（提示词不含来源注入，这里统一回填真实范围标签） */
function finalize(
  raw: string,
  kind: 'cards' | 'questions',
  scopeLabel: string,
  count: number
): GeneratedCard[] | GeneratedQuestion[] {
  const items = parseModelJsonArray(raw)
  const validated =
    kind === 'cards' ? validateCardBatch(items) : validateQuestionBatch(items)
  if (validated.length === 0) {
    throw new Error('模型没有生成有效内容（资料文本可能不适合该题型），请调整范围或数量后重试')
  }
  // 来源以用户选择的范围为准，不采用模型自报的来源，杜绝编造页码/章节
  return validated.slice(0, count).map((item) => ({ ...item, sourceChapter: scopeLabel }))
}

export const aiGenerationService: GenerationService = {
  mode: 'ai',
  isConfigured(): boolean {
    // 是否可用由配置决定；未配置时 generate 会返回主进程的明确错误
    return true
  },
  unconfiguredHint(): string {
    return 'AI 生成模式需要在设置页配置模型服务（本地模型或自备 API）'
  },
  async generateCards(input: GenerationInput): Promise<GeneratedCard[]> {
    const prompt = buildCardPrompt(input.scopeLabel, input.text, input.count)
    const raw = await callModel(prompt)
    return finalize(raw, 'cards', input.scopeLabel, input.count) as GeneratedCard[]
  },
  async generateQuestions(input: GenerationInput): Promise<GeneratedQuestion[]> {
    const prompt = buildQuestionPrompt(
      input.scopeLabel,
      input.text,
      input.count,
      input.questionTypes ?? ['choice']
    )
    const raw = await callModel(prompt)
    return finalize(raw, 'questions', input.scopeLabel, input.count) as GeneratedQuestion[]
  }
}
