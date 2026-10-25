import type { GenerationInput, GenerationService } from './types'
import { buildCardPrompt, buildQuestionPrompt } from './prompts'

/**
 * AI 生成服务适配器（接口占位）。
 *
 * 当前版本尚未接入真实模型服务——本模块定义了未来接入所需的全部契约：
 * - 提示词构建（prompts.ts，已实现并有测试）
 * - 结构化输出解析与运行时校验（validate.ts，已实现并有测试）
 * - 服务接口（types.ts 的 GenerationService）
 *
 * 安全约定：真实接入时 API Key 只能保存在主进程侧（如系统凭据库），
 * 通过 IPC 以引用方式使用，绝不写入渲染进程代码、IndexedDB 或 Git。
 */

export interface AiServiceConfig {
  /** 模型服务地址（由用户在设置中配置） */
  baseUrl: string
  /** 模型名称 */
  model: string
  /** API Key 的存储引用（主进程凭据 ID），渲染进程不接触明文 */
  apiKeyRef: string
}

export const AI_MODE_HINT =
  'AI 生成模式将在后续版本接入真实模型服务（需在设置中配置本地或自建模型）。当前版本请使用「演示模式」，它会基于资料文本规则生成内容。'

function createAiService(config?: Partial<AiServiceConfig>): GenerationService {
  void config
  return {
    mode: 'ai',
    isConfigured: () => false,
    unconfiguredHint: () => AI_MODE_HINT,
    async generateCards(_input: GenerationInput) {
      throw new Error(AI_MODE_HINT)
    },
    async generateQuestions(_input: GenerationInput) {
      throw new Error(AI_MODE_HINT)
    }
  }
}

/** 当前版本固定返回未配置的 AI 服务；接入真实模型时在此创建带配置的适配器 */
export const aiGenerationService: GenerationService = createAiService()

// 保留提示词构建函数的导出引用，供后续适配器与单元测试使用
export const aiPrompts = { buildCardPrompt, buildQuestionPrompt }
