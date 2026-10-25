import { getDB, dbError, newId, STORE_ATTEMPTS } from './database'
import type { AnswerRecord, QuizType } from './schema'

export interface NewAnswerRecordInput {
  questionId: string
  questionType: QuizType
  isCorrect: boolean
  userAnswerText: string
}

/** 保存一次答题记录（不可变事件，用于学习统计） */
export async function addAnswerRecord(input: NewAnswerRecordInput): Promise<AnswerRecord> {
  try {
    const now = Date.now()
    const record: AnswerRecord = {
      id: newId(),
      questionId: input.questionId,
      questionType: input.questionType,
      isCorrect: input.isCorrect,
      userAnswerText: input.userAnswerText,
      answeredAt: now,
      createdAt: now,
      updatedAt: now
    }
    const db = await getDB()
    await db.put(STORE_ATTEMPTS, record)
    return record
  } catch (error) {
    throw dbError('保存答题记录', error)
  }
}

/** 按题目查询答题记录，按时间倒序 */
export async function listAttemptsByQuestion(questionId: string): Promise<AnswerRecord[]> {
  try {
    const db = await getDB()
    const all = await db.getAllFromIndex(STORE_ATTEMPTS, 'by-questionId', questionId)
    return all.sort((a, b) => b.answeredAt - a.answeredAt)
  } catch (error) {
    throw dbError('查询答题记录', error)
  }
}

/** 最近的答题记录，按时间倒序，最多 limit 条 */
export async function listRecentAttempts(limit: number = 20): Promise<AnswerRecord[]> {
  try {
    const db = await getDB()
    const all = await db.getAllFromIndex(STORE_ATTEMPTS, 'by-answeredAt')
    return all.slice(-limit).reverse()
  } catch (error) {
    throw dbError('最近答题记录', error)
  }
}

export async function countAttempts(): Promise<number> {
  try {
    const db = await getDB()
    return await db.count(STORE_ATTEMPTS)
  } catch (error) {
    throw dbError('统计答题记录', error)
  }
}
