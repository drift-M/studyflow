import { getDB, dbError, newId, STORE_QUESTIONS, STORE_WRONG_ANSWERS, STORE_ATTEMPTS } from './database'
import type { QuizQuestion, QuizType } from './schema'

/** 判断题的固定选项 */
export const JUDGE_OPTIONS = ['正确', '错误'] as const

export interface NewQuestionInput {
  documentId?: string | null
  type: QuizType
  question: string
  /** choice 需要至少两个非空选项；judge 忽略此字段（固定为 正确/错误） */
  options?: string[]
  /** choice/judge 的正确选项下标；judge 只能是 0 或 1 */
  answerIndex?: number
  /** short 的参考答案文本 */
  answerText?: string
  explanation?: string
  sourceChapter?: string | null
  generatedBy?: 'demo' | 'ai' | 'manual'
}

function assertInput(input: NewQuestionInput): {
  options: string[]
  answer: number | string
} {
  if (!input.question.trim()) {
    throw new Error('题目内容不能为空')
  }
  if (input.type === 'short') {
    if (!input.answerText?.trim()) {
      throw new Error('简答题需要提供参考答案')
    }
    return { options: [], answer: input.answerText.trim() }
  }
  if (input.type === 'judge') {
    if (input.answerIndex !== 0 && input.answerIndex !== 1) {
      throw new Error('判断题答案只能是「正确」或「错误」')
    }
    return { options: [...JUDGE_OPTIONS], answer: input.answerIndex }
  }
  // choice
  const options = (input.options ?? []).map((option) => option.trim())
  if (options.filter((option) => option).length < 2) {
    throw new Error('至少需要两个非空选项')
  }
  if (
    input.answerIndex === undefined ||
    input.answerIndex < 0 ||
    input.answerIndex >= options.length
  ) {
    throw new Error('正确选项不在选项范围内')
  }
  return { options, answer: input.answerIndex }
}

export async function createQuestion(input: NewQuestionInput): Promise<QuizQuestion> {
  const { options, answer } = assertInput(input)
  try {
    const now = Date.now()
    const question: QuizQuestion = {
      id: newId(),
      documentId: input.documentId ?? null,
      type: input.type,
      question: input.question.trim(),
      options,
      answer,
      explanation: input.explanation?.trim() || undefined,
      sourceChapter: input.sourceChapter ?? null,
      generatedBy: input.generatedBy ?? 'manual',
      createdAt: now,
      updatedAt: now
    }
    const db = await getDB()
    await db.put(STORE_QUESTIONS, question)
    return question
  } catch (error) {
    if (error instanceof Error && !error.message.startsWith('数据库操作失败')) throw error
    throw dbError('新增题目', error)
  }
}

export async function getQuestion(id: string): Promise<QuizQuestion | undefined> {
  try {
    const db = await getDB()
    return await db.get(STORE_QUESTIONS, id)
  } catch (error) {
    throw dbError('查询题目', error)
  }
}

/** 按创建时间倒序 */
export async function listQuestions(): Promise<QuizQuestion[]> {
  try {
    const db = await getDB()
    const all = await db.getAll(STORE_QUESTIONS)
    return all.sort((a, b) => b.createdAt - a.createdAt)
  } catch (error) {
    throw dbError('题目列表', error)
  }
}

/** 按资料 ID 查询关联题目，按创建时间倒序 */
export async function listQuestionsByDocument(documentId: string): Promise<QuizQuestion[]> {
  try {
    const db = await getDB()
    const questions = await db.getAllFromIndex(STORE_QUESTIONS, 'by-documentId', documentId)
    return questions.sort((a, b) => b.createdAt - a.createdAt)
  } catch (error) {
    throw dbError('按资料查询题目', error)
  }
}

export async function countQuestions(): Promise<number> {
  try {
    const db = await getDB()
    return await db.count(STORE_QUESTIONS)
  } catch (error) {
    throw dbError('统计题目', error)
  }
}

/** 删除题目并级联删除其错题记录与答题记录。返回题目是否真实存在并被删除 */
export async function deleteQuestion(id: string): Promise<boolean> {
  try {
    const db = await getDB()
    const tx = db.transaction([STORE_QUESTIONS, STORE_WRONG_ANSWERS, STORE_ATTEMPTS], 'readwrite')
    const existed = !!(await tx.objectStore(STORE_QUESTIONS).get(id))
    if (!existed) {
      await tx.done
      return false
    }
    await tx.objectStore(STORE_QUESTIONS).delete(id)
    const wrongs = await tx.objectStore(STORE_WRONG_ANSWERS).index('by-questionId').getAll(id)
    for (const wrong of wrongs) {
      await tx.objectStore(STORE_WRONG_ANSWERS).delete(wrong.id)
    }
    const attempts = await tx.objectStore(STORE_ATTEMPTS).index('by-questionId').getAll(id)
    for (const attempt of attempts) {
      await tx.objectStore(STORE_ATTEMPTS).delete(attempt.id)
    }
    await tx.done
    return true
  } catch (error) {
    throw dbError('删除题目', error)
  }
}
