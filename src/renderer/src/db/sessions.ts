import { getDB, dbError, newId, STORE_SESSIONS } from './database'
import type { StudySession, StudySessionType } from './schema'

export interface NewSessionInput {
  type: StudySessionType
  summary: string
  startedAt: number
  durationSec: number
  documentId?: string | null
}

export async function addSession(input: NewSessionInput): Promise<StudySession> {
  try {
    const now = Date.now()
    const session: StudySession = {
      id: newId(),
      type: input.type,
      summary: input.summary,
      startedAt: input.startedAt,
      durationSec: Math.max(0, Math.round(input.durationSec)),
      documentId: input.documentId ?? null,
      createdAt: now,
      updatedAt: now
    }
    const db = await getDB()
    await db.put(STORE_SESSIONS, session)
    return session
  } catch (error) {
    throw dbError('记录学习', error)
  }
}

/** 最近的学习记录，按开始时间倒序，最多 limit 条 */
export async function listRecentSessions(limit: number = 5): Promise<StudySession[]> {
  try {
    const db = await getDB()
    const all = await db.getAllFromIndex(STORE_SESSIONS, 'by-startedAt')
    return all.slice(-limit).reverse()
  } catch (error) {
    throw dbError('学习记录', error)
  }
}

export async function countSessions(): Promise<number> {
  try {
    const db = await getDB()
    return await db.count(STORE_SESSIONS)
  } catch (error) {
    throw dbError('统计学习记录', error)
  }
}
