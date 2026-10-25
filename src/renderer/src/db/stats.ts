import { getDB, dbError, STORE_CARDS, STORE_SESSIONS, STORE_ATTEMPTS } from './database'

export interface ReviewStats {
  /** 今日待复习数量 */
  dueNow: number
  /** 尚未学习的卡片数量 */
  isNew: number
  /** 已掌握的卡片数量 */
  mastered: number
  /** 卡片总数 */
  total: number
  /** 掌握率（0-100，无卡片时为 0） */
  masteryRate: number
  /** 今日已复习的卡片数量 */
  reviewedToday: number
  /** 连续学习天数（含今天则从今天起算；有活动但今天没有则从昨天起算） */
  streakDays: number
}

function dayKey(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 当天零点 */
function startOfToday(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

/**
 * 汇总学习统计数据。
 * 连续学习天数：从今天（或昨天）往前数，每天至少有一条学习活动
 * （学习记录 / 卡片复习 / 答题记录任一）即连续。
 */
export async function getReviewStats(): Promise<ReviewStats> {
  try {
    const db = await getDB()
    const now = Date.now()
    const [cards, sessions, attempts] = await Promise.all([
      db.getAll(STORE_CARDS),
      db.getAllFromIndex(STORE_SESSIONS, 'by-startedAt'),
      db.getAllFromIndex(STORE_ATTEMPTS, 'by-answeredAt')
    ])

    const todayStart = startOfToday()
    const mastered = cards.filter((card) => card.mastery === 'mastered').length
    const dueNow = cards.filter((card) => card.nextReviewAt <= now).length
    const isNew = cards.filter((card) => card.reviewCount === 0).length
    const reviewedToday = cards.filter(
      (card) => card.lastReviewedAt !== null && card.lastReviewedAt >= todayStart
    ).length

    // 活跃日期集合
    const activeDays = new Set<string>()
    for (const session of sessions) activeDays.add(dayKey(session.startedAt))
    for (const attempt of attempts) activeDays.add(dayKey(attempt.answeredAt))
    for (const card of cards) {
      if (card.lastReviewedAt !== null) activeDays.add(dayKey(card.lastReviewedAt))
    }

    // 从今天起算连续天数；今天还没有活动则从昨天起算（连续 streak 未断）
    let streakDays = 0
    const cursor = new Date()
    if (!activeDays.has(dayKey(cursor.getTime()))) {
      cursor.setDate(cursor.getDate() - 1)
    }
    while (activeDays.has(dayKey(cursor.getTime()))) {
      streakDays++
      cursor.setDate(cursor.getDate() - 1)
    }

    return {
      dueNow,
      isNew,
      mastered,
      total: cards.length,
      masteryRate: cards.length > 0 ? Math.round((mastered / cards.length) * 100) : 0,
      reviewedToday,
      streakDays
    }
  } catch (error) {
    throw dbError('学习统计', error)
  }
}
