import { useState } from 'react'
import { Badge, Button, ConfirmModal, EmptyState, Modal, useToast } from '../components/ui'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import { useStudyTracker } from '../hooks/useStudyTracker'
import {
  listCards,
  createCard,
  updateCard,
  markCardMastery,
  deleteCard,
  listDocuments,
  type KnowledgeCard
} from '../db'
import { formatRelative } from '../format'

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

interface EditForm {
  front: string
  back: string
  tags: string
  explanation: string
}

export function CardsPage({
  onOpenDocument
}: {
  onOpenDocument: (docId: string) => void
}): React.JSX.Element {
  useStudyTracker('浏览知识卡片')
  const cards = useAsyncData(listCards, [])
  const documents = useAsyncData(listDocuments, [])
  const { push } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ front: '', back: '', tags: '' })
  const [saving, setSaving] = useState(false)
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<KnowledgeCard | null>(null)
  const [editTarget, setEditTarget] = useState<KnowledgeCard | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ front: '', back: '', tags: '', explanation: '' })
  const [editSaving, setEditSaving] = useState(false)

  const docTitle = (documentId: string | null): string | null => {
    if (!documentId) return null
    return documents.data?.find((doc) => doc.id === documentId)?.title ?? '（已删除的资料）'
  }

  const handleCreate = async (): Promise<void> => {
    setSaving(true)
    try {
      await createCard({ front: form.front, back: form.back, tags: parseTags(form.tags) })
      push('卡片已创建', 'success')
      setForm({ front: '', back: '', tags: '' })
      setShowForm(false)
      cards.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleFlip = (id: string): void => {
    setFlipped((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleMastery = async (card: KnowledgeCard, mastery: 'mastered' | 'unfamiliar'): Promise<void> => {
    try {
      await markCardMastery(card.id, mastery)
      push(mastery === 'mastered' ? '已标记掌握，24 小时后再次复习' : '已标记不熟悉，会尽快再出现', 'success')
      cards.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    }
  }

  const openEdit = (card: KnowledgeCard): void => {
    setEditTarget(card)
    setEditForm({
      front: card.front,
      back: card.back,
      tags: card.tags.join(' '),
      explanation: card.explanation ?? ''
    })
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
      if (!updated) {
        push('卡片已不存在', 'error')
      } else {
        push('卡片已更新', 'success')
      }
      setEditTarget(null)
      cards.reload()
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
      cards.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setConfirmTarget(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">知识卡片</h1>
          <p className="page-subtitle">
            {cards.data
              ? `共 ${cards.data.length} 张卡片 · 点击卡片翻面查看答案`
              : '手动创建卡片，或在资料详情页点击「生成知识卡片」'}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="plus" onClick={() => setShowForm((v) => !v)}>
            {showForm ? '收起表单' : '新建卡片'}
          </Button>
        </div>
      </div>

      {cards.error ? <div className="error-block">{cards.error}</div> : null}

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
            const isFlipped = flipped.has(card.id)
            const source = docTitle(card.documentId)
            return (
              <div className="card-item" key={card.id}>
                <div
                  className="card-main card-flip"
                  onClick={() => toggleFlip(card.id)}
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
                    {card.reviewCount > 0
                      ? `已复习 ${card.reviewCount} 次${card.lastReviewedAt ? ` · 上次 ${formatRelative(card.lastReviewedAt)}` : ''}`
                      : '还未复习过'}{' '}
                    · 创建于 {formatRelative(card.createdAt)}
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
                  <Button small icon="check" onClick={() => handleMastery(card, 'mastered')}>
                    掌握
                  </Button>
                  <Button small variant="ghost" onClick={() => handleMastery(card, 'unfamiliar')}>
                    不熟悉
                  </Button>
                  <Button small variant="ghost" icon="eye" onClick={() => openEdit(card)}>
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
            title="还没有知识卡片"
            desc="打开一份学习资料，点击右上角「生成知识卡片」，或在此手动创建。"
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
