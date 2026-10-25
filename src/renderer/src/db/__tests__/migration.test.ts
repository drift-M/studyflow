import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { DB_NAME, DB_VERSION, getDB, closeDB } from '../database'

/** 每个迁移测试都从全新数据库开始，互不污染 */
beforeEach(async () => {
  await closeDB()
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = request.onerror = request.onblocked = () => resolve(null)
  })
})
import { listDocuments } from '../documents'
import { getCard } from '../cards'
import { countCards } from '../cards'
import { countSessions } from '../sessions'

/** 模拟旧版本（v1）数据库：手工创建与 v1 相同结构的库并写入旧格式记录 */
function openLegacyV1(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      const documents = db.createObjectStore('documents', { keyPath: 'id' })
      documents.createIndex('by-importedAt', 'importedAt')
      const cards = db.createObjectStore('cards', { keyPath: 'id' })
      cards.createIndex('by-documentId', 'documentId')
      cards.createIndex('by-nextReviewAt', 'nextReviewAt')
      const questions = db.createObjectStore('questions', { keyPath: 'id' })
      questions.createIndex('by-documentId', 'documentId')
      const wrongAnswers = db.createObjectStore('wrongAnswers', { keyPath: 'id' })
      wrongAnswers.createIndex('by-questionId', 'questionId')
      wrongAnswers.createIndex('by-lastWrongAt', 'lastWrongAt')
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
      sessions.createIndex('by-startedAt', 'startedAt')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 模拟 v3 旧库：卡片无 reviewStage 字段，但已有复习历史 */
function openLegacyV3(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3)
    request.onupgradeneeded = () => {
      const db = request.result
      const documents = db.createObjectStore('documents', { keyPath: 'id' })
      documents.createIndex('by-importedAt', 'importedAt')
      const cards = db.createObjectStore('cards', { keyPath: 'id' })
      cards.createIndex('by-documentId', 'documentId')
      cards.createIndex('by-nextReviewAt', 'nextReviewAt')
      const questions = db.createObjectStore('questions', { keyPath: 'id' })
      questions.createIndex('by-documentId', 'documentId')
      const wrongAnswers = db.createObjectStore('wrongAnswers', { keyPath: 'id' })
      wrongAnswers.createIndex('by-questionId', 'questionId')
      wrongAnswers.createIndex('by-lastWrongAt', 'lastWrongAt')
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
      sessions.createIndex('by-startedAt', 'startedAt')
      const attempts = db.createObjectStore('attempts', { keyPath: 'id' })
      attempts.createIndex('by-questionId', 'questionId')
      attempts.createIndex('by-answeredAt', 'answeredAt')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('数据库 v3 → v4 迁移（间隔复习上线）', () => {
  it('旧卡片回填 reviewStage=0，既有复习计划与统计保留', async () => {
    const legacy = await openLegacyV3()
    await new Promise<void>((resolve, reject) => {
      const tx = legacy.transaction('cards', 'readwrite')
      tx.objectStore('cards').put({
        id: 'v3-card',
        documentId: null,
        front: '旧卡片',
        back: '旧答案',
        tags: [],
        reviewCount: 3,
        lastReviewedAt: 12345,
        nextReviewAt: Date.now() + 86_400_000,
        createdAt: 1,
        updatedAt: 1
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    legacy.close()

    const db = await getDB()
    expect(db.version).toBe(DB_VERSION)
    const card = await getCard('v3-card')
    expect(card?.reviewStage).toBe(0)
    expect(card?.reviewCount).toBe(3)
    expect(card?.nextReviewAt).toBeGreaterThan(Date.now())
  })
})

function putLegacyRecords(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents', 'cards', 'sessions'], 'readwrite')
    // v1 旧格式：content 必填、无 sourcePath / pageCount
    tx.objectStore('documents').put({
      id: 'legacy-doc-1',
      title: '旧版导入的资料',
      fileName: 'legacy.md',
      fileType: 'markdown',
      fileSize: 12,
      content: '# 旧内容',
      status: 'imported',
      importedAt: 1000,
      createdAt: 1000,
      updatedAt: 1000
    })
    tx.objectStore('cards').put({
      id: 'legacy-card-1',
      documentId: 'legacy-doc-1',
      front: '旧卡片',
      back: '答案',
      tags: [],
      reviewCount: 2,
      lastReviewedAt: null,
      nextReviewAt: 1000,
      createdAt: 1000,
      updatedAt: 1000
    })
    tx.objectStore('sessions').put({
      id: 'legacy-session-1',
      type: 'study',
      summary: '旧学习记录',
      startedAt: 1000,
      durationSec: 60,
      documentId: null,
      createdAt: 1000,
      updatedAt: 1000
    })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

describe('数据库 v1 → v2 迁移', () => {
  it('升级后旧资料、卡片、学习记录全部保留，新字段安全回填', async () => {
    const legacy = await openLegacyV1()
    expect(legacy.version).toBe(1)
    await putLegacyRecords(legacy)
    legacy.close()

    // 用新版本号打开，触发迁移
    const db = await getDB()
    expect(db.version).toBe(DB_VERSION)

    const docs = await listDocuments()
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe('legacy-doc-1')
    expect(docs[0].title).toBe('旧版导入的资料')
    // 旧内容未丢失，新字段已回填
    expect(docs[0].content).toBe('# 旧内容')
    expect(docs[0].sourcePath).toBeNull()
    expect(docs[0].pageCount).toBeNull()

    expect(await countCards()).toBe(1)
    expect(await countSessions()).toBe(1)
  })
})
