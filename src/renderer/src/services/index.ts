import type { GenerationService } from './types'
import { demoGenerationService } from './demo'
import { aiGenerationService, cancelActiveGeneration } from './ai'
import type { AiProviderMode } from '../../../preload/api-types'

export type GenerationMode = 'demo' | 'ai'

/** 设置页的模式 → 生成服务：demo 用规则；local/api 都走 AI 服务（由主进程配置决定） */
export function getGenerationService(mode: GenerationMode): GenerationService {
  return mode === 'ai' ? aiGenerationService : demoGenerationService
}

/** 设置模式 → 界面显示标签 */
export function describeGenerationMode(mode: AiProviderMode, modelName?: string): string {
  if (mode === 'demo') return '演示模式 · 规则生成（非 AI 调用）'
  if (mode === 'local') return `本地模型${modelName ? ` · ${modelName}` : ''}`
  return `自备 API${modelName ? ` · ${modelName}` : ''}`
}

export { cancelActiveGeneration }
export type { GenerationService }
