import type { QuizType } from '../db/schema'

/** 生成模式：demo = 本地规则提取；ai = 真实模型服务（接口已定义，待接入） */
export type GenerationMode = 'demo' | 'ai'

/** 生成结果：知识卡片 */
export interface GeneratedCard {
  front: string
  back: string
  explanation?: string
  /** 来源章节（Markdown）或页码（PDF） */
  sourceChapter: string
}

/** 生成结果：练习题 */
export interface GeneratedQuestion {
  type: QuizType
  question: string
  options: string[]
  /** choice/judge 的正确选项下标 */
  answerIndex?: number
  /** short 的参考答案 */
  answerText?: string
  explanation?: string
  sourceChapter: string
}

export interface GenerationInput {
  sourceTitle: string
  scopeLabel: string
  text: string
  count: number
  questionTypes?: QuizType[]
}

/** 可替换的生成服务接口：演示与 AI 模式实现同一契约 */
export interface GenerationService {
  readonly mode: GenerationMode
  /** 服务是否已配置完成（demo 恒为 true；ai 取决于配置） */
  isConfigured(): boolean
  /** 未配置时返回提示文案 */
  unconfiguredHint(): string
  generateCards(input: GenerationInput): Promise<GeneratedCard[]>
  generateQuestions(input: GenerationInput): Promise<GeneratedQuestion[]>
}
