import { getDB, dbError, newId, STORE_DOCUMENTS, STORE_CARDS, STORE_QUESTIONS, STORE_WRONG_ANSWERS } from './database'
import type { StudyDocument } from './schema'

export interface NewStudyDocumentInput {
  title: string
  fileName: string
  fileType: StudyDocument['fileType']
  fileSize: number
  /** 内联内容（示例数据 / 旧版数据使用）；正常导入传 sourcePath，不传 content */
  content?: StudyDocument['content']
  /** 原始文件绝对路径；正常导入必填，示例数据为空 */
  sourcePath?: string | null
  note?: string
}

export async function createDocument(input: NewStudyDocumentInput): Promise<StudyDocument> {
  try {
    const now = Date.now()
    const doc: StudyDocument = {
      id: newId(),
      title: input.title,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      sourcePath: input.sourcePath ?? null,
      pageCount: null,
      content: input.content,
      status: 'imported',
      note: input.note,
      importedAt: now,
      createdAt: now,
      updatedAt: now
    }
    const db = await getDB()
    await db.put(STORE_DOCUMENTS, doc)
    return doc
  } catch (error) {
    throw dbError('新增资料', error)
  }
}

/** 数据不存在时返回 undefined */
export async function getDocument(id: string): Promise<StudyDocument | undefined> {
  try {
    const db = await getDB()
    return await db.get(STORE_DOCUMENTS, id)
  } catch (error) {
    throw dbError('查询资料', error)
  }
}

/** 按导入时间倒序 */
export async function listDocuments(): Promise<StudyDocument[]> {
  try {
    const db = await getDB()
    const all = await db.getAllFromIndex(STORE_DOCUMENTS, 'by-importedAt')
    return all.reverse()
  } catch (error) {
    throw dbError('资料列表', error)
  }
}

export async function countDocuments(): Promise<number> {
  try {
    const db = await getDB()
    return await db.count(STORE_DOCUMENTS)
  } catch (error) {
    throw dbError('统计资料', error)
  }
}

/** 返回更新后的记录；数据不存在时返回 undefined */
export async function updateDocument(
  id: string,
  patch: Partial<
    Pick<
      StudyDocument,
      'title' | 'note' | 'sourcePath' | 'fileName' | 'fileSize' | 'pageCount'
    >
  >
): Promise<StudyDocument | undefined> {
  try {
    const db = await getDB()
    const doc = await db.get(STORE_DOCUMENTS, id)
    if (!doc) return undefined
    const updated: StudyDocument = {
      ...doc,
      ...patch,
      updatedAt: Date.now()
    }
    await db.put(STORE_DOCUMENTS, updated)
    return updated
  } catch (error) {
    throw dbError('更新资料', error)
  }
}

/**
 * 删除资料并级联删除其关联的知识卡片、练习题与对应错题记录。
 * 返回资料是否真实存在并被删除。
 */
export async function deleteDocument(id: string): Promise<boolean> {
  try {
    const db = await getDB()
    const tx = db.transaction(
      [STORE_DOCUMENTS, STORE_CARDS, STORE_QUESTIONS, STORE_WRONG_ANSWERS],
      'readwrite'
    )
    const docStore = tx.objectStore(STORE_DOCUMENTS)
    const existed = !!(await docStore.get(id))
    if (!existed) {
      await tx.done
      return false
    }
    await docStore.delete(id)

    const questions = await tx.objectStore(STORE_QUESTIONS).index('by-documentId').getAll(id)
    for (const question of questions) {
      const wrongs = await tx
        .objectStore(STORE_WRONG_ANSWERS)
        .index('by-questionId')
        .getAll(question.id)
      for (const wrong of wrongs) {
        await tx.objectStore(STORE_WRONG_ANSWERS).delete(wrong.id)
      }
      await tx.objectStore(STORE_QUESTIONS).delete(question.id)
    }

    const cards = await tx.objectStore(STORE_CARDS).index('by-documentId').getAll(id)
    for (const card of cards) {
      await tx.objectStore(STORE_CARDS).delete(card.id)
    }

    await tx.done
    return true
  } catch (error) {
    throw dbError('删除资料', error)
  }
}
