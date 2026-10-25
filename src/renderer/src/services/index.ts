import type { GenerationMode, GenerationService } from './types'
import { demoGenerationService } from './demo'
import { aiGenerationService, AI_MODE_HINT } from './ai'

/** 按模式获取生成服务。AI 模式未配置时界面应展示 unconfiguredHint 并允许切回演示模式 */
export function getGenerationService(mode: GenerationMode): GenerationService {
  return mode === 'ai' ? aiGenerationService : demoGenerationService
}

export { AI_MODE_HINT }
export type { GenerationMode, GenerationService }
