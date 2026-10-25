import { getDB, dbError, newId, STORE_QUESTIONS, STORE_WRONG_ANSWERS } from './database'
import type { QuizQuestion } from './schema'

export interface NewQuestionInput {
  documentId?: string | null
  question: string
  options: string[]
  /** 正确选项下标 */
  answerIndex: number
  explanation?: string
}

function assertChoiceInput(input: NewQuestionInput): void {
  if (!input.question.trim()) {
    throw new Error('题目内容不能为空')
  }
  const filled = input.options.filter((option) => option.trim())
  if (filled.length < 2) {
    throw new Error('至少需要两个非空选项')
  }
  if (input.answerIndex < 0 || input.answerIndex >= input.options.length) {
    throw new Error('正确选项不在选项范围内')
  }
}

export async function createQuestion(input: NewQuestionInput): Promise<QuizQuestion> {
  assertChoiceInput(input)
  try {
    const now = Date.now()
    const question: QuizQuestion = {
      id: newId(),
      documentId: input.documentId ?? null,
      type: 'choice',
      question: input.question.trim(),
      options: input.options.map((option) => option.trim()),
      answer: input.answerIndex,
      explanation: input.explanation?.trim() || undefined,
      createdAt: now,
      updatedAt: now
    }
    const db = await getDB()
    await db.put(STORE_QUESTIONS, question)
    return question
  } catch (error) {
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

/** 删除题目并级联删除其错题记录。返回题目是否真实存在并被删除 */
export async function deleteQuestion(id: string): Promise<boolean> {
  try {
    const db = await getDB()
    const tx = db.transaction([STORE_QUESTIONS, STORE_WRONG_ANSWERS], 'readwrite')
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
    await tx.done
    return true
  } catch (error) {
    throw dbError('删除题目', error)
  }
}
