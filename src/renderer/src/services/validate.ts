import type { GeneratedCard, GeneratedQuestion } from './types'
import type { QuizType } from '../db/schema'

const QUIZ_TYPES: QuizType[] = ['choice', 'judge', 'short']

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * 运行时校验生成的卡片（对 Demo 与 AI 输出统一执行）。
 * 校验失败抛出带中文说明的 Error，调用方据此提示并允许重试。
 */
export function validateGeneratedCard(item: unknown): GeneratedCard {
  if (typeof item !== 'object' || item === null) {
    throw new Error('生成结果格式错误：卡片不是对象')
  }
  const raw = item as Record<string, unknown>
  const front = asString(raw.front)?.trim()
  const back = asString(raw.back)?.trim()
  if (!front || !back) {
    throw new Error('生成结果格式错误：卡片正面或背面为空')
  }
  if (front.length > 300 || back.length > 800) {
    throw new Error('生成结果格式错误：卡片内容超长')
  }
  const explanation = asString(raw.explanation)?.trim() || undefined
  const sourceChapter = asString(raw.sourceChapter)?.trim() || '未标注来源'
  return { front, back, explanation, sourceChapter }
}

/**
 * 运行时校验生成的题目。
 * choice/judge 必须有合法的选项与答案下标，short 必须有参考答案。
 */
export function validateGeneratedQuestion(item: unknown): GeneratedQuestion {
  if (typeof item !== 'object' || item === null) {
    throw new Error('生成结果格式错误：题目不是对象')
  }
  const raw = item as Record<string, unknown>
  const question = asString(raw.question)?.trim()
  if (!question) {
    throw new Error('生成结果格式错误：题干为空')
  }
  if (question.length > 500) {
    throw new Error('生成结果格式错误：题干超长')
  }
  const type = asString(raw.type) as QuizType | undefined
  if (!type || !QUIZ_TYPES.includes(type)) {
    throw new Error(`生成结果格式错误：未知题型「${String(raw.type)}」`)
  }
  const sourceChapter = asString(raw.sourceChapter)?.trim() || '未标注来源'
  const explanation = asString(raw.explanation)?.trim() || undefined

  if (type === 'short') {
    const answerText = asString(raw.answerText)?.trim()
    if (!answerText) {
      throw new Error('生成结果格式错误：简答题缺少参考答案')
    }
    return { type, question, options: [], answerText, explanation, sourceChapter }
  }

  const options = Array.isArray(raw.options) ? raw.options.map((option) => asString(option)?.trim() ?? '') : []
  const answerIndex = typeof raw.answerIndex === 'number' ? raw.answerIndex : undefined
  if (type === 'judge') {
    if (answerIndex !== 0 && answerIndex !== 1) {
      throw new Error('生成结果格式错误：判断题答案必须是 0（正确）或 1（错误）')
    }
    return { type, question, options: ['正确', '错误'], answerIndex, explanation, sourceChapter }
  }
  if (options.filter((option) => option).length < 2) {
    throw new Error('生成结果格式错误：选择题选项不足两个')
  }
  if (answerIndex === undefined || answerIndex < 0 || answerIndex >= options.length) {
    throw new Error('生成结果格式错误：选择题答案下标越界')
  }
  return { type, question, options, answerIndex, explanation, sourceChapter }
}

/** 批量校验，失败项跳过并计数，全部失败时抛错 */
export function validateCardBatch(items: unknown[]): GeneratedCard[] {
  const valid: GeneratedCard[] = []
  let failures = 0
  for (const item of items) {
    try {
      valid.push(validateGeneratedCard(item))
    } catch {
      failures++
    }
  }
  if (valid.length === 0 && failures > 0) {
    throw new Error(`AI 返回的 ${failures} 条卡片全部无法通过格式校验，请重试`)
  }
  return valid
}

/** 批量校验题目，行为同上 */
export function validateQuestionBatch(items: unknown[]): GeneratedQuestion[] {
  const valid: GeneratedQuestion[] = []
  let failures = 0
  for (const item of items) {
    try {
      valid.push(validateGeneratedQuestion(item))
    } catch {
      failures++
    }
  }
  if (valid.length === 0 && failures > 0) {
    throw new Error(`AI 返回的 ${failures} 道题目全部无法通过格式校验，请重试`)
  }
  return valid
}
