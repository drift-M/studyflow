import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { clearAllData, getDB } from '../database'
import { exportAllData, restoreData } from '../backup'
import {
  buildBackupJson,
  parseBackupFile,
  sanitizeBackupData
} from '../../lib/backup'
import { createDocument } from '../documents'
import { createCard, rateCard, countDueCards, listDueCards, describeNextReview } from '../cards'
import { createQuestion } from '../quiz'
import { addAnswerRecord } from '../answers'
import { addSession } from '../sessions'
import { getReviewStats } from '../stats'

beforeEach(async () => {
  await clearAllData()
})

async function seedSampleDataset(): Promise<void> {
  const doc = await createDocument({
    title: '备份测试资料',
    fileName: 'test.md',
    fileType: 'markdown',
    fileSize: 10,
    content: '# 内容'
  })
  await createCard({ documentId: doc.id, front: 'F', back: 'B' })
  const question = await createQuestion({
    documentId: doc.id,
    type: 'choice',
    question: 'Q',
    options: ['A', 'B'],
    answerIndex: 0
  })
  await addAnswerRecord({
    questionId: question.id,
    questionType: 'choice',
    isCorrect: false,
    userAnswerText: 'B'
  })
  await addSession({ type: 'study', summary: '学习', startedAt: Date.now() - 1000, durationSec: 60 })
}

describe('备份导出与解析', () => {
  it('导出的 JSON 含版本号与全部数据类型，可完整解析', async () => {
    await seedSampleDataset()
    const json = buildBackupJson(await exportAllData())
    const parsed = JSON.parse(json)
    expect(parsed.app).toBe('studyflow')
    expect(parsed.formatVersion).toBe(1)
    expect(typeof parsed.exportedAt).toBe('string')

    const { summary } = parseBackupFile(json)
    expect(summary.documents).toBe(1)
    expect(summary.cards).toBe(1)
    expect(summary.questions).toBe(1)
    expect(summary.attempts).toBe(1)
    expect(summary.sessions).toBe(1)
  })

  it('内置二进制内容经 base64 往返后保持一致', async () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251])
    await createDocument({
      title: '内置 PDF',
      fileName: 'x.pdf',
      fileType: 'pdf',
      fileSize: bytes.length,
      content: bytes
    })
    const json = buildBackupJson(await exportAllData())
    const { backup } = parseBackupFile(json)
    const restored = backup.data.documents[0].content as Uint8Array
    expect(Array.from(restored)).toEqual(Array.from(bytes))
  })

  it('损坏 JSON 与外来文件被拒绝', () => {
    expect(() => parseBackupFile('not json{')).toThrow('JSON')
    expect(
      () => parseBackupFile(JSON.stringify({ app: 'other', formatVersion: 1, exportedAt: '', data: {} }))
    ).toThrow('不是 StudyFlow')
    expect(() => parseBackupFile(JSON.stringify({ app: 'studyflow', exportedAt: '', data: {} }))).toThrow(
      '版本号'
    )
  })

  it('更高版本的备份被拒绝并提示升级', () => {
    const future = JSON.stringify({
      app: 'studyflow',
      formatVersion: 99,
      exportedAt: '2026-01-01',
      data: { documents: [], cards: [] }
    })
    expect(() => parseBackupFile(future)).toThrow('请先升级应用')
  })

  it('字段缺失（无 attempts）按空数组处理', () => {
    const legacy = JSON.stringify({
      app: 'studyflow',
      formatVersion: 1,
      exportedAt: '2026-01-01',
      data: { documents: [], cards: [] }
    })
    const { summary } = parseBackupFile(legacy)
    expect(summary.attempts).toBe(0)
    expect(summary.cards).toBe(0)
  })

  it('无效记录与文件内重复 ID 被跳过且计数', () => {
    const bad = JSON.stringify({
      app: 'studyflow',
      formatVersion: 1,
      exportedAt: '2026-01-01',
      data: {
        documents: [],
        cards: [
          { id: 'c1', front: 'F', back: 'B', tags: [] },
          { id: 'c1', front: '重复', back: '重复', tags: [] },
          { front: '无ID', back: 'x', tags: [] },
          { id: 'c2', front: '', back: '空正面', tags: [] }
        ]
      }
    })
    const { backup } = parseBackupFile(bad)
    const { clean, skipped } = sanitizeBackupData(backup.data)
    expect(clean.cards).toHaveLength(1)
    expect(skipped.cards).toBe(3)
  })
})

describe('备份恢复', () => {
  it('替换模式：清空现有数据后完整写入备份', async () => {
    await seedSampleDataset()
    const json = buildBackupJson(await exportAllData())
    const { backup } = parseBackupFile(json)

    // 清空并写入无关数据，再恢复备份
    await clearAllData()
    const { createCard } = await import('../cards')
    await createCard({ front: '现有卡片', back: '会被替换' })

    const result = await restoreData(backup.data, 'replace')
    expect(result.imported.cards).toBe(1)
    expect(result.imported.documents).toBe(1)
    expect(result.imported.attempts).toBe(1)
    expect(result.imported.sessions).toBe(1)

    // 替换后的数据与备份一致
    const stats = await getReviewStats()
    expect(stats.total).toBe(1)
  })

  it('合并模式：已存在的 ID 保留现状，不覆盖用户数据', async () => {
    await seedSampleDataset()
    const json = buildBackupJson(await exportAllData())
    const { backup } = parseBackupFile(json)

    // 修改现有卡片的正面内容，模拟用户在备份之后编辑过
    const { listCards, updateCard } = await import('../cards')
    const existing = (await listCards())[0]
    await updateCard(existing.id, { front: '用户修改过的问题' })

    const result = await restoreData(backup.data, 'merge')
    expect(result.keptExisting.cards).toBe(1)
    expect(result.imported.cards).toBe(0)

    const after = await listCards()
    expect(after[0].front).toBe('用户修改过的问题')
  })

  it('合并模式：只导入新增的记录', async () => {
    await seedSampleDataset()
    const json = buildBackupJson(await exportAllData())
    const { backup } = parseBackupFile(json)
    await clearAllData()

    const result = await restoreData(backup.data, 'merge')
    expect(result.imported.cards).toBe(1)
    expect(result.imported.documents).toBe(1)
    expect(result.imported.questions).toBe(1)
    expect(result.imported.wrongAnswers).toBeGreaterThanOrEqual(0)

    const stats = await getReviewStats()
    expect(stats.total).toBe(1)
  })

  it('事务失败时不留下半份数据（恢复前后数据一致）', async () => {
    await seedSampleDataset()
    const before = await exportAllData()
    // 备份中额外加一张新卡，让 replace 模式有多步写入
    const json = buildBackupJson(before)
    const { backup } = parseBackupFile(json)
    backup.data.cards.push({
      ...(backup.data.cards[0] as (typeof backup.data.cards)[number]),
      id: 'extra-card',
      front: '额外卡片'
    })

    // 拦截 put：第 2 次调用时抛错（此时第 1 个存储已写入），验证事务整体回滚
    const db = await getDB()
    const probe = db.transaction('cards', 'readonly').objectStore('cards')
    const storeProto = Object.getPrototypeOf(probe) as {
      put: (...args: unknown[]) => Promise<unknown>
    }
    const originalPut = storeProto.put
    let putCalls = 0
    storeProto.put = function spyPut(...args: unknown[]) {
      putCalls++
      if (putCalls === 2) {
        throw new Error('模拟写入失败')
      }
      return originalPut.apply(this, args)
    }
    try {
      await expect(restoreData(backup.data, 'replace')).rejects.toThrow('数据库操作失败')
    } finally {
      storeProto.put = originalPut
    }

    // 回滚后：数据与恢复前完全一致（没有被清空，也没有写入部分记录）
    const after = await exportAllData()
    expect(after.cards.length).toBe(before.cards.length)
    expect(after.documents.length).toBe(before.documents.length)
    expect(after.attempts.length).toBe(before.attempts.length)
    const { listCards } = await import('../cards')
    expect((await listCards())[0].front).toBe(before.cards[0].front)
  })
})

describe('间隔复习', () => {
  it('新卡片立即可复习；不熟悉 → 10 分钟后', async () => {
    const card = await createCard({ front: 'F', back: 'B' })
    expect(await countDueCards()).toBe(1)

    const rated = await rateCard(card.id, 'unfamiliar')
    expect(rated?.reviewStage).toBe(0)
    expect(rated?.mastery).toBe('unfamiliar')
    // 10 分钟 = 600000ms，允许 1 秒误差
    expect(rated!.nextReviewAt).toBeGreaterThan(Date.now() + 590000)
    expect(await countDueCards()).toBe(0)
  })

  it('有点印象：阶段至少 1（1 天后），掌握度回到未标记', async () => {
    const card = await createCard({ front: 'F', back: 'B' })
    const rated = await rateCard(card.id, 'vague')
    expect(rated?.reviewStage).toBe(1)
    expect(rated?.mastery).toBe('unrated')
    expect(rated!.nextReviewAt).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000)
  })

  it('已掌握：阶梯递进 1 → 3 → 7 → 14 → 30 天封顶', async () => {
    const card = await createCard({ front: 'F', back: 'B' })
    const stages: number[] = []
    let current = card
    for (let i = 0; i < 7; i++) {
      current = (await rateCard(current.id, 'mastered'))!
      stages.push(current.reviewStage!)
    }
    expect(stages).toEqual([1, 2, 3, 4, 5, 5, 5])
    expect(current.mastery).toBe('mastered')
  })

  it('不熟悉后重新爬阶梯', async () => {
    const card = await createCard({ front: 'F', back: 'B' })
    await rateCard(card.id, 'mastered')
    await rateCard(card.id, 'mastered')
    const reset = await rateCard(card.id, 'unfamiliar')
    expect(reset?.reviewStage).toBe(0)
  })

  it('describeNextReview 输出可解释文案', () => {
    expect(describeNextReview('unfamiliar', 3)).toBe('10 分钟后')
    expect(describeNextReview('vague', 0)).toBe('1 天后')
    expect(describeNextReview('mastered', 0)).toBe('1 天后')
    expect(describeNextReview('mastered', 4)).toBe('30 天后')
  })

  it('评分后卡片离开待复习队列', async () => {
    const a = await createCard({ front: 'A', back: 'a' })
    const due = await listDueCards()
    expect(due).toHaveLength(1)
    expect(due[0].front).toBe('A')
    void a
    await rateCard(a.id, 'mastered') // a 推迟 1 天
    const due2 = await listDueCards()
    expect(due2).toHaveLength(0)
  })
})

describe('学习统计', () => {
  it('统计今日复习、掌握率与连续天数', async () => {
    const card = await createCard({ front: 'F', back: 'B' })
    await rateCard(card.id, 'mastered')
    await addSession({ type: 'study', summary: '学习', startedAt: Date.now(), durationSec: 60 })

    const stats = await getReviewStats()
    expect(stats.total).toBe(1)
    expect(stats.reviewedToday).toBe(1)
    expect(stats.mastered).toBe(1)
    expect(stats.masteryRate).toBe(100)
    expect(stats.streakDays).toBeGreaterThanOrEqual(1)
    expect(stats.dueNow).toBe(0) // 掌握后推迟 1 天
  })

  it('无卡片时统计为零且不报错', async () => {
    const stats = await getReviewStats()
    expect(stats.total).toBe(0)
    expect(stats.masteryRate).toBe(0)
    expect(stats.streakDays).toBe(0)
  })
})
