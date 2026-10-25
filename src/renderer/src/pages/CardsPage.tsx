import { useState } from 'react'
import { Badge, Button, ConfirmModal, EmptyState, Modal, useToast } from '../components/ui'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import {
  listCards,
  listDueCards,
  listNewCards,
  listMasteredCards,
  getReviewStats,
  createCard,
  updateCard,
  rateCard,
  describeNextReview,
  deleteCard,
  listDocuments,
  REVIEW_LADDER_MINUTES,
  type KnowledgeCard,
  type ReviewRating
} from '../db'
import { formatRelative } from '../format'

type CardTab = 'due' | 'new' | 'mastered' | 'all'

const TAB_LABELS: Record<CardTab, string> = {
  due: '今日待复习',
  new: '尚未学习',
  mastered: '已掌握',
  all: '全部'
}

const TAB_LOADERS: Record<CardTab, () => Promise<KnowledgeCard[]>> = {
  due: () => listDueCards(),
  new: () => listNewCards(),
  mastered: () => listMasteredCards(),
  all: () => listCards()
}

function parseTags(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function MasteryBadge({ card }: { card: KnowledgeCard }): React.JSX.Element | null {
  if (card.mastery === 'mastered') return <Badge variant="ok">已掌握</Badge>
  if (card.mastery === 'unfamiliar') return <Badge variant="warn">不熟悉</Badge>
  return null
}

interface ReviewSession {
  queue: KnowledgeCard[]
  index: number
  flipped: boolean
  counts: Record<ReviewRating, number>
}

export function CardsPage({
  onOpenDocument
}: {
  onOpenDocument: (docId: string) => void
}): React.JSX.Element {
  const { push } = useToast()
  const [tab, setTab] = useState<CardTab>('due')
  const stats = useAsyncData(getReviewStats, [])
  const cards = useAsyncData(() => TAB_LOADERS[tab](), [tab])
  const documents = useAsyncData(listDocuments, [])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ front: '', back: '', tags: '' })
  const [saving, setSaving] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<KnowledgeCard | null>(null)
  const [editTarget, setEditTarget] = useState<KnowledgeCard | null>(null)
  const [editForm, setEditForm] = useState({ front: '', back: '', tags: '', explanation: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set())
  const [session, setSession] = useState<ReviewSession | null>(null)

  const docTitle = (documentId: string | null): string | null => {
    if (!documentId) return null
    return documents.data?.find((doc) => doc.id === documentId)?.title ?? '（已删除的资料）'
  }

  const reloadAll = (): void => {
    cards.reload()
    stats.reload()
  }

  const handleCreate = async (): Promise<void> => {
    setSaving(true)
    try {
      await createCard({ front: form.front, back: form.back, tags: parseTags(form.tags) })
      push('卡片已创建，已进入今日复习队列', 'success')
      setForm({ front: '', back: '', tags: '' })
      setShowForm(false)
      reloadAll()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const startReview = async (): Promise<void> => {
    try {
      const due = await listDueCards()
      if (due.length === 0) {
        push('今天没有待复习的卡片', 'info')
        return
      }
      setSession({ queue: due, index: 0, flipped: false, counts: { unfamiliar: 0, vague: 0, mastered: 0 } })
    } catch (error) {
      push(errorMessage(error), 'error')
    }
  }

  const handleRate = async (rating: ReviewRating): Promise<void> => {
    if (!session) return
    const card = session.queue[session.index]
    try {
      const updated = await rateCard(card.id, rating)
      if (!updated) {
        push('这张卡片已被删除', 'error')
      }
      const counts = { ...session.counts, [rating]: session.counts[rating] + 1 }
      if (session.index + 1 >= session.queue.length) {
        // 最后一张：index 推进到队尾，触发复习总结页
        setSession({ ...session, index: session.queue.length, counts })
        return
      }
      setSession({ ...session, index: session.index + 1, flipped: false, counts })
    } catch (error) {
      push(errorMessage(error), 'error')
    }
  }

  const handleEditSave = async (): Promise<void> => {
    if (!editTarget) return
    setEditSaving(true)
    try {
      const updated = await updateCard(editTarget.id, {
        front: editForm.front,
        back: editForm.back,
        tags: parseTags(editForm.tags),
        explanation: editForm.explanation.trim() || undefined
      })
      push(updated ? '卡片已更新' : '卡片已不存在', updated ? 'success' : 'error')
      setEditTarget(null)
      reloadAll()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!confirmTarget) return
    try {
      await deleteCard(confirmTarget.id)
      push('卡片已删除（原始资料不受影响）', 'success')
      setConfirmTarget(null)
      reloadAll()
    } catch (error) {
      push(errorMessage(error), 'error')
    }
  }

  // ===== 复习会话 =====
  if (session) {
    const finished = session.index >= session.queue.length
    if (finished) {
      const total = session.queue.length
      return (
        <div className="page">
          <div className="page-header">
            <div>
              <h1 className="page-title">复习完成</h1>
              <p className="page-subtitle">复习计划已更新，下次复习时间已按间隔阶梯安排</p>
            </div>
          </div>
          <div className="panel">
            <div className="session-summary-box">
              <div className="stat-row">
                <div>
                  <div className="stat-value">{total}</div>
                  <div className="stat-label">今日已复习</div>
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--danger)' }}>
                    {session.counts.unfamiliar}
                  </div>
                  <div className="stat-label">不熟悉（10 分钟后再来）</div>
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--warn)' }}>
                    {session.counts.vague}
                  </div>
                  <div className="stat-label">有点印象</div>
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>
                    {session.counts.mastered}
                  </div>
                  <div className="stat-label">已掌握</div>
                </div>
              </div>
              <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
                <Button
                  variant="primary"
                  onClick={async () => {
                    setSession(null)
                    reloadAll()
                    await startReview()
                  }}
                >
                  继续复习剩余卡片
                </Button>
                <Button
                  onClick={() => {
                    setSession(null)
                    reloadAll()
                  }}
                >
                  完成
                </Button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    const card = session.queue[session.index]
    const currentStage = card.reviewStage ?? 0
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">复习中</h1>
            <p className="page-subtitle">
              第 {session.index + 1} / {session.queue.length} 张 · 翻面后如实评价，知页会安排下次复习时间
            </p>
          </div>
          <div className="page-actions">
            <Button
              variant="ghost"
              onClick={() => {
                setSession(null)
                reloadAll()
              }}
            >
              结束复习
            </Button>
          </div>
        </div>

        <div className="panel quiz-session-panel">
          <div className="card-review-box">
            <div className="card-side-label">{session.flipped ? '背面 · 答案' : '正面 · 问题'}</div>
            <div className="review-card-text">{session.flipped ? card.back : card.front}</div>
            {session.flipped && card.explanation ? (
              <div className="card-explanation">{card.explanation}</div>
            ) : null}
            <div className="card-meta">
              {card.reviewCount > 0
                ? `第 ${card.reviewCount + 1} 次复习 · 复习阶段 ${currentStage} · 来源${docTitle(card.documentId) ? `：${docTitle(card.documentId)}` : '：手动创建'}`
                : '第一次复习 · 来源：手动创建'}
            </div>
            {!session.flipped ? (
              <div className="quiz-actions">
                <Button variant="primary" onClick={() => setSession({ ...session, flipped: true })}>
                  翻面查看答案
                </Button>
              </div>
            ) : (
              <>
                <div className="rate-buttons">
                  <Button variant="danger" onClick={() => handleRate('unfamiliar')}>
                    不熟悉（{describeNextReview('unfamiliar', currentStage)}）
                  </Button>
                  <Button variant="secondary" onClick={() => handleRate('vague')}>
                    有点印象（{describeNextReview('vague', currentStage)}）
                  </Button>
                  <Button variant="primary" icon="check" onClick={() => handleRate('mastered')}>
                    已掌握（{describeNextReview('mastered', currentStage)}）
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ===== 概览 / 列表 =====
  const tabCounts: Record<CardTab, number | undefined> = {
    due: stats.data?.dueNow,
    new: stats.data?.isNew,
    mastered: stats.data?.mastered,
    all: stats.data?.total
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">知识卡片</h1>
          <p className="page-subtitle">
            {stats.data
              ? `连续学习 ${stats.data.streakDays} 天 · 今日已复习 ${stats.data.reviewedToday} 张 · 掌握率 ${stats.data.masteryRate}%`
              : '按间隔阶梯安排复习：不熟悉 10 分钟后再来，掌握后 1 → 3 → 7 → 14 → 30 天'}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon="plus" onClick={() => setShowForm((v) => !v)}>
            {showForm ? '收起表单' : '新建卡片'}
          </Button>
          <Button variant="primary" icon="cards" onClick={startReview} disabled={!stats.data || stats.data.dueNow === 0}>
            {stats.data && stats.data.dueNow > 0 ? `开始复习（${stats.data.dueNow}）` : '今日无待复习'}
          </Button>
        </div>
      </div>

      {cards.error ? <div className="error-block">{cards.error}</div> : null}

      <div className="card-tabs">
        {(Object.keys(TAB_LABELS) as CardTab[]).map((key) => (
          <button
            key={key}
            className={`card-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key]}
            {tabCounts[key] !== undefined ? <span className="tab-count">{tabCounts[key]}</span> : null}
          </button>
        ))}
      </div>

      {showForm ? (
        <div className="panel">
          <div className="form">
            <div className="form-field">
              <label className="form-label">正面（问题）</label>
              <textarea
                className="form-textarea"
                value={form.front}
                onChange={(e) => setForm({ ...form, front: e.target.value })}
                placeholder="例如：机器学习按学习方式分为哪三大类？"
              />
            </div>
            <div className="form-field">
              <label className="form-label">背面（答案）</label>
              <textarea
                className="form-textarea"
                value={form.back}
                onChange={(e) => setForm({ ...form, back: e.target.value })}
                placeholder="例如：监督学习、无监督学习、强化学习"
              />
            </div>
            <div className="form-field">
              <label className="form-label">标签（可选，用逗号或空格分隔）</label>
              <input
                className="form-input"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="例如：机器学习 基础概念"
              />
            </div>
            <div className="form-actions">
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="primary" onClick={handleCreate} disabled={saving || !form.front.trim() || !form.back.trim()}>
                {saving ? '保存中…' : '创建卡片'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        {cards.loading ? (
          <div className="loading-block">加载中…</div>
        ) : cards.data && cards.data.length > 0 ? (
          cards.data.map((card) => {
            const isFlipped = flippedIds.has(card.id)
            const source = docTitle(card.documentId)
            const dueLabel =
              card.nextReviewAt <= Date.now()
                ? '现已到期'
                : formatRelative(card.nextReviewAt).includes('刚刚')
                  ? ''
                  : `下次 ${formatRelative(card.nextReviewAt)}`
            return (
              <div className="card-item" key={card.id}>
                <div
                  className="card-main card-flip"
                  onClick={() =>
                    setFlippedIds((current) => {
                      const next = new Set(current)
                      if (next.has(card.id)) next.delete(card.id)
                      else next.add(card.id)
                      return next
                    })
                  }
                  title="点击翻面"
                >
                  <div className="card-side-label">{isFlipped ? '背面 · 答案' : '正面 · 问题'}</div>
                  <div className="card-front">{isFlipped ? card.back : card.front}</div>
                  {isFlipped && card.explanation ? (
                    <div className="card-explanation">{card.explanation}</div>
                  ) : null}
                  {card.tags.length > 0 ? (
                    <div className="card-tags">
                      {card.tags.map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="card-meta">
                    已复习 {card.reviewCount} 次 · 阶段 {card.reviewStage ?? 0}/{REVIEW_LADDER_MINUTES.length - 1}
                    {dueLabel ? ` · ${dueLabel}` : ''}
                    {source ? (
                      <>
                        {' · 来源：'}
                        {card.documentId ? (
                          <button
                            className="card-source-link"
                            onClick={(event) => {
                              event.stopPropagation()
                              onOpenDocument(card.documentId!)
                            }}
                          >
                            {source}
                            {card.sourceChapter ? ` · ${card.sourceChapter}` : ''}
                          </button>
                        ) : (
                          <span>
                            {source}
                            {card.sourceChapter ? ` · ${card.sourceChapter}` : ''}
                          </span>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="card-actions">
                  <MasteryBadge card={card} />
                  <Button small variant="ghost" icon="eye" onClick={() => {
                    setEditTarget(card)
                    setEditForm({
                      front: card.front,
                      back: card.back,
                      tags: card.tags.join(' '),
                      explanation: card.explanation ?? ''
                    })
                  }}>
                    编辑
                  </Button>
                  <Button small variant="ghost" icon="trash" onClick={() => setConfirmTarget(card)}>
                    删除
                  </Button>
                </div>
              </div>
            )
          })
        ) : (
          <EmptyState
            icon="cards"
            title={
              tab === 'due'
                ? '今天没有待复习的卡片'
                : tab === 'new'
                  ? '没有尚未学习的卡片'
                  : tab === 'mastered'
                    ? '还没有已掌握的卡片'
                    : '还没有知识卡片'
            }
            desc={
              tab === 'all'
                ? '打开一份学习资料，点击「生成知识卡片」，或在此手动创建。'
                : tab === 'due'
                  ? '所有卡片的下次复习时间都在未来。明天再来看看，或切到「全部」浏览卡片。'
                  : undefined
            }
          />
        )}
      </div>

      <ConfirmModal
        open={!!confirmTarget}
        title="删除卡片"
        desc={<>确定删除这张卡片吗？「{confirmTarget?.front}」</>}
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmTarget(null)}
      />

      <Modal
        open={!!editTarget}
        title="编辑卡片"
        footer={
          <>
            <Button onClick={() => setEditTarget(null)} disabled={editSaving}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={handleEditSave}
              disabled={editSaving || !editForm.front.trim() || !editForm.back.trim()}
            >
              {editSaving ? '保存中…' : '保存'}
            </Button>
          </>
        }
      >
        <div className="form" style={{ padding: 0 }}>
          <div className="form-field">
            <label className="form-label">正面（问题）</label>
            <textarea
              className="form-textarea"
              value={editForm.front}
              onChange={(e) => setEditForm({ ...editForm, front: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label className="form-label">背面（答案）</label>
            <textarea
              className="form-textarea"
              value={editForm.back}
              onChange={(e) => setEditForm({ ...editForm, back: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label className="form-label">标签</label>
            <input
              className="form-input"
              value={editForm.tags}
              onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
            />
          </div>
          <div className="form-field">
            <label className="form-label">补充解释（可选）</label>
            <textarea
              className="form-textarea"
              value={editForm.explanation}
              onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
