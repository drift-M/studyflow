import { getDB, dbError, newId, STORE_CARDS } from './database'
import type { CardMastery, KnowledgeCard } from './schema'

export interface NewCardInput {
  documentId?: string | null
  front: string
  back: string
  tags?: string[]
  explanation?: string
  sourceChapter?: string | null
}

/** 复习间隔：答对/复习后 24 小时内不再计入待复习 */
const REVIEW_INTERVAL_MS = 24 * 60 * 60 * 1000

export async function createCard(input: NewCardInput): Promise<KnowledgeCard> {
  if (!input.front.trim() || !input.back.trim()) {
    throw new Error('卡片正面和背面都不能为空')
  }
  try {
    const now = Date.now()
    const card: KnowledgeCard = {
      id: newId(),
      documentId: input.documentId ?? null,
      front: input.front.trim(),
      back: input.back.trim(),
      tags: input.tags ?? [],
      explanation: input.explanation?.trim() || undefined,
      sourceChapter: input.sourceChapter ?? null,
      mastery: 'unrated',
      reviewCount: 0,
      lastReviewedAt: null,
      nextReviewAt: now,
      createdAt: now,
      updatedAt: now
    }
    const db = await getDB()
    await db.put(STORE_CARDS, card)
    return card
  } catch (error) {
    throw dbError('新增卡片', error)
  }
}

export async function getCard(id: string): Promise<KnowledgeCard | undefined> {
  try {
    const db = await getDB()
    return await db.get(STORE_CARDS, id)
  } catch (error) {
    throw dbError('查询卡片', error)
  }
}

/** 全部卡片，按创建时间倒序 */
export async function listCards(): Promise<KnowledgeCard[]> {
  try {
    const db = await getDB()
    const all = await db.getAll(STORE_CARDS)
    return all.sort((a, b) => b.createdAt - a.createdAt)
  } catch (error) {
    throw dbError('卡片列表', error)
  }
}

/** 按资料 ID 查询关联卡片，按创建时间倒序 */
export async function listCardsByDocument(documentId: string): Promise<KnowledgeCard[]> {
  try {
    const db = await getDB()
    const cards = await db.getAllFromIndex(STORE_CARDS, 'by-documentId', documentId)
    return cards.sort((a, b) => b.createdAt - a.createdAt)
  } catch (error) {
    throw dbError('按资料查询卡片', error)
  }
}

export async function countCards(): Promise<number> {
  try {
    const db = await getDB()
    return await db.count(STORE_CARDS)
  } catch (error) {
    throw dbError('统计卡片', error)
  }
}

/** 待复习数量：nextReviewAt 已到期的卡片 */
export async function countDueCards(now: number = Date.now()): Promise<number> {
  try {
    const db = await getDB()
    return await db.countFromIndex(
      STORE_CARDS,
      'by-nextReviewAt',
      IDBKeyRange.upperBound(now)
    )
  } catch (error) {
    throw dbError('统计待复习', error)
  }
}

/** 编辑卡片内容；卡片不存在返回 undefined */
export async function updateCard(
  id: string,
  patch: Partial<Pick<KnowledgeCard, 'front' | 'back' | 'tags' | 'explanation'>>
): Promise<KnowledgeCard | undefined> {
  try {
    const db = await getDB()
    const card = await db.get(STORE_CARDS, id)
    if (!card) return undefined
    const updated: KnowledgeCard = {
      ...card,
      ...patch,
      front: (patch.front ?? card.front).trim(),
      back: (patch.back ?? card.back).trim(),
      updatedAt: Date.now()
    }
    if (!updated.front || !updated.back) {
      throw new Error('卡片正面和背面都不能为空')
    }
    await db.put(STORE_CARDS, updated)
    return updated
  } catch (error) {
    if (error instanceof Error && error.message.includes('不能为空')) throw error
    throw dbError('编辑卡片', error)
  }
}

/**
 * 标记掌握状态：
 * - 掌握：计入一次复习，24 小时后再次进入待复习
 * - 不熟悉：立即回到待复习队列
 */
export async function markCardMastery(
  id: string,
  mastery: Exclude<CardMastery, 'unrated'>
): Promise<KnowledgeCard | undefined> {
  try {
    const db = await getDB()
    const card = await db.get(STORE_CARDS, id)
    if (!card) return undefined
    const now = Date.now()
    const updated: KnowledgeCard = {
      ...card,
      mastery,
      reviewCount: mastery === 'mastered' ? card.reviewCount + 1 : card.reviewCount,
      lastReviewedAt: now,
      nextReviewAt: mastery === 'mastered' ? now + REVIEW_INTERVAL_MS : now,
      updatedAt: now
    }
    await db.put(STORE_CARDS, updated)
    return updated
  } catch (error) {
    throw dbError('标记掌握', error)
  }
}

/** 标记一次复习：复习次数 +1，下次复习推迟到 24 小时后。卡片不存在返回 undefined */
export async function reviewCard(id: string): Promise<KnowledgeCard | undefined> {
  try {
    const db = await getDB()
    const card = await db.get(STORE_CARDS, id)
    if (!card) return undefined
    const now = Date.now()
    const updated: KnowledgeCard = {
      ...card,
      reviewCount: card.reviewCount + 1,
      lastReviewedAt: now,
      nextReviewAt: now + REVIEW_INTERVAL_MS,
      updatedAt: now
    }
    await db.put(STORE_CARDS, updated)
    return updated
  } catch (error) {
    throw dbError('复习卡片', error)
  }
}

/** 返回卡片是否真实存在并被删除 */
export async function deleteCard(id: string): Promise<boolean> {
  try {
    const db = await getDB()
    const existed = !!(await db.get(STORE_CARDS, id))
    if (existed) {
      await db.delete(STORE_CARDS, id)
    }
    return existed
  } catch (error) {
    throw dbError('删除卡片', error)
  }
}
