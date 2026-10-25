import { getDB, dbError, STORE_DOCUMENTS, STORE_CARDS, STORE_QUESTIONS, STORE_WRONG_ANSWERS, STORE_SESSIONS, STORE_ATTEMPTS } from './database'
import type { BackupData } from '../lib/backup'
import { sanitizeBackupData } from '../lib/backup'

const ALL_STORES = [
  STORE_DOCUMENTS,
  STORE_CARDS,
  STORE_QUESTIONS,
  STORE_WRONG_ANSWERS,
  STORE_SESSIONS,
  STORE_ATTEMPTS
] as const

/** 导出全部本地数据（用于构建备份文件） */
export async function exportAllData(): Promise<BackupData> {
  try {
    const db = await getDB()
    const tx = db.transaction([...ALL_STORES], 'readonly')
    const [documents, cards, questions, wrongAnswers, sessions, attempts] = await Promise.all([
      tx.objectStore(STORE_DOCUMENTS).getAll(),
      tx.objectStore(STORE_CARDS).getAll(),
      tx.objectStore(STORE_QUESTIONS).getAll(),
      tx.objectStore(STORE_WRONG_ANSWERS).getAll(),
      tx.objectStore(STORE_SESSIONS).getAll(),
      tx.objectStore(STORE_ATTEMPTS).getAll()
    ])
    await tx.done
    return { documents, cards, questions, wrongAnswers, sessions, attempts }
  } catch (error) {
    throw dbError('导出数据', error)
  }
}

export type RestoreStrategy = 'merge' | 'replace'

export interface RestoreResult {
  imported: Record<keyof BackupData, number>
  skipped: Record<keyof BackupData, number>
  /** 合并模式下因 ID 已存在而保留现状的数量 */
  keptExisting: Record<keyof BackupData, number>
}

/**
 * 恢复备份数据。
 * - replace：清空现有数据后整份写入（单事务，失败整体回滚）
 * - merge：逐条写入不存在的 ID，已存在的记录保留现状（不会覆盖用户数据）
 */
export async function restoreData(
  data: BackupData,
  strategy: RestoreStrategy
): Promise<RestoreResult> {
  const { clean, skipped } = sanitizeBackupData(data)
  const imported: Record<keyof BackupData, number> = {
    documents: 0,
    cards: 0,
    questions: 0,
    wrongAnswers: 0,
    sessions: 0,
    attempts: 0
  }
  const keptExisting: Record<keyof BackupData, number> = {
    documents: 0,
    cards: 0,
    questions: 0,
    wrongAnswers: 0,
    sessions: 0,
    attempts: 0
  }

  try {
    const db = await getDB()
    const tx = db.transaction([...ALL_STORES], 'readwrite')
    try {
      for (const key of ALL_STORES) {
        const store = tx.objectStore(key)
        const records = clean[key] as Array<{ id: string }>

        if (strategy === 'replace') {
          await store.clear()
          for (const record of records) {
            // 循环中的 store 是六种存储的联合类型，record 与 key 一一对应，
            // 但 TS 无法静态关联，这里用断言收敛
            await store.put(record as never)
            imported[key]++
          }
          continue
        }

        // merge：已存在的 ID 保留现状
        const existingIds = new Set((await store.getAllKeys()).map(String))
        for (const record of records) {
          if (existingIds.has(record.id)) {
            keptExisting[key]++
            continue
          }
          await store.put(record as never)
          imported[key]++
        }
      }
      await tx.done
    } catch (error) {
      // 任何写入失败都要显式中止事务：同步抛出的错误不会自动回滚，
      // 不中止的话已执行的 clear/put 会随事务提交，留下半份数据
      try {
        tx.abort()
      } catch {
        /* 事务已自行中止时忽略 */
      }
      throw error
    }
  } catch (error) {
    throw dbError(`恢复数据（${strategy === 'merge' ? '合并' : '替换'}模式）`, error)
  }

  return { imported, skipped, keptExisting }
}
