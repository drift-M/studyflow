import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  StudyDocument,
  KnowledgeCard,
  QuizQuestion,
  WrongAnswer,
  StudySession
} from './schema'

export const DB_NAME = 'studyflow'
export const DB_VERSION = 2

export const STORE_DOCUMENTS = 'documents'
export const STORE_CARDS = 'cards'
export const STORE_QUESTIONS = 'questions'
export const STORE_WRONG_ANSWERS = 'wrongAnswers'
export const STORE_SESSIONS = 'sessions'

export interface StudyFlowDB extends DBSchema {
  documents: {
    key: string
    value: StudyDocument
    indexes: { 'by-importedAt': number }
  }
  cards: {
    key: string
    value: KnowledgeCard
    indexes: { 'by-documentId': string; 'by-nextReviewAt': number }
  }
  questions: {
    key: string
    value: QuizQuestion
    indexes: { 'by-documentId': string }
  }
  wrongAnswers: {
    key: string
    value: WrongAnswer
    indexes: { 'by-questionId': string; 'by-lastWrongAt': number }
  }
  sessions: {
    key: string
    value: StudySession
    indexes: { 'by-startedAt': number }
  }
}

/** 单例连接：整个应用只打开一次数据库 */
let dbPromise: Promise<IDBPDatabase<StudyFlowDB>> | null = null

export function getDB(): Promise<IDBPDatabase<StudyFlowDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StudyFlowDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        // 版本升级时按 oldVersion 逐级迁移，已发布的分支不要改动
        if (oldVersion < 1) {
          const documents = db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' })
          documents.createIndex('by-importedAt', 'importedAt')
          const cards = db.createObjectStore(STORE_CARDS, { keyPath: 'id' })
          cards.createIndex('by-documentId', 'documentId')
          cards.createIndex('by-nextReviewAt', 'nextReviewAt')
          const questions = db.createObjectStore(STORE_QUESTIONS, { keyPath: 'id' })
          questions.createIndex('by-documentId', 'documentId')
          const wrongAnswers = db.createObjectStore(STORE_WRONG_ANSWERS, { keyPath: 'id' })
          wrongAnswers.createIndex('by-questionId', 'questionId')
          wrongAnswers.createIndex('by-lastWrongAt', 'lastWrongAt')
          const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
          sessions.createIndex('by-startedAt', 'startedAt')
        }
        if (oldVersion < 2 && oldVersion >= 1) {
          // v1 → v2：为旧记录补充 sourcePath / pageCount 字段。
          // 旧记录的 content 保留原样，阅读器会回退到内联内容，不丢失任何用户数据。
          const store = transaction.objectStore(STORE_DOCUMENTS)
          const docs = await store.getAll()
          for (const doc of docs) {
            if (doc.sourcePath === undefined || doc.pageCount === undefined) {
              await store.put({
                ...doc,
                sourcePath: doc.sourcePath ?? null,
                pageCount: doc.pageCount ?? null
              })
            }
          }
        }
      },
      blocked() {
        console.error('数据库被旧版本页面占用，无法升级，请关闭其他 StudyFlow 窗口后重试')
      },
      blocking() {
        // 有新版本请求升级时，主动关闭当前连接，避免互相阻塞
        dbPromise?.then((db) => db.close()).catch(() => {})
        dbPromise = null
      }
    })
    // 打开失败时清空单例，允许下次重试
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

/** 仅供测试使用：关闭连接，模拟应用重启 */
export async function closeDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
}

/** 清空全部数据（设置页"清空全部数据"使用） */
export async function clearAllData(): Promise<void> {
  try {
    const db = await getDB()
    const tx = db.transaction(
      [STORE_DOCUMENTS, STORE_CARDS, STORE_QUESTIONS, STORE_WRONG_ANSWERS, STORE_SESSIONS],
      'readwrite'
    )
    await Promise.all([
      tx.objectStore(STORE_DOCUMENTS).clear(),
      tx.objectStore(STORE_CARDS).clear(),
      tx.objectStore(STORE_QUESTIONS).clear(),
      tx.objectStore(STORE_WRONG_ANSWERS).clear(),
      tx.objectStore(STORE_SESSIONS).clear()
    ])
    await tx.done
  } catch (error) {
    throw dbError('清空数据', error)
  }
}

export function newId(): string {
  return crypto.randomUUID()
}

/** 将底层 IndexedDB 异常转换为带上下文的中文错误，供界面提示 */
export function dbError(scope: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(`数据库操作失败（${scope}）：${detail}`)
}
