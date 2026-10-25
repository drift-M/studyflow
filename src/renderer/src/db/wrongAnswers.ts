import { getDB, dbError, newId, STORE_WRONG_ANSWERS } from './database'
import type { WrongAnswer } from './schema'

export interface RecordWrongAnswerInput {
  questionId: string
  questionSnapshot: string
  correctAnswerText: string
  userAnswerText: string
}

/**
 * 记录一次答错。同一题目重复答错时合并为一条记录（wrongCount 递增），
 * 已解决的错题再次答错会重新变为未解决。
 */
export async function recordWrongAnswer(input: RecordWrongAnswerInput): Promise<WrongAnswer> {
  try {
    const db = await getDB()
    const existing = await db
      .getAllFromIndex(STORE_WRONG_ANSWERS, 'by-questionId', input.questionId)
    const now = Date.now()
    const previous = existing[0]
    const record: WrongAnswer = previous
      ? {
          ...previous,
          userAnswerText: input.userAnswerText,
          wrongCount: previous.wrongCount + 1,
          lastWrongAt: now,
          resolvedAt: null,
          updatedAt: now
        }
      : {
          id: newId(),
          questionId: input.questionId,
          questionSnapshot: input.questionSnapshot,
          correctAnswerText: input.correctAnswerText,
          userAnswerText: input.userAnswerText,
          wrongCount: 1,
          lastWrongAt: now,
          resolvedAt: null,
          createdAt: now,
          updatedAt: now
        }
    await db.put(STORE_WRONG_ANSWERS, record)
    return record
  } catch (error) {
    throw dbError('记录错题', error)
  }
}

/** 全部错题，按最近答错时间倒序 */
export async function listWrongAnswers(): Promise<WrongAnswer[]> {
  try {
    const db = await getDB()
    const all = await db.getAllFromIndex(STORE_WRONG_ANSWERS, 'by-lastWrongAt')
    return all.reverse()
  } catch (error) {
    throw dbError('错题列表', error)
  }
}

export async function countUnresolvedWrongAnswers(): Promise<number> {
  try {
    const db = await getDB()
    const all = await db.getAll(STORE_WRONG_ANSWERS)
    return all.filter((wrong) => wrong.resolvedAt === null).length
  } catch (error) {
    throw dbError('统计错题', error)
  }
}

/** 标记已掌握。记录不存在返回 undefined */
export async function resolveWrongAnswer(id: string): Promise<WrongAnswer | undefined> {
  try {
    const db = await getDB()
    const wrong = await db.get(STORE_WRONG_ANSWERS, id)
    if (!wrong) return undefined
    const now = Date.now()
    const updated: WrongAnswer = {
      ...wrong,
      resolvedAt: wrong.resolvedAt ?? now,
      updatedAt: now
    }
    await db.put(STORE_WRONG_ANSWERS, updated)
    return updated
  } catch (error) {
    throw dbError('解决错题', error)
  }
}

/** 返回记录是否真实存在并被删除 */
export async function deleteWrongAnswer(id: string): Promise<boolean> {
  try {
    const db = await getDB()
    const existed = !!(await db.get(STORE_WRONG_ANSWERS, id))
    if (existed) {
      await db.delete(STORE_WRONG_ANSWERS, id)
    }
    return existed
  } catch (error) {
    throw dbError('删除错题', error)
  }
}
