import { useState } from 'react'
import { Button, ConfirmModal, EmptyState, useToast } from '../components/ui'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import { useStudyTracker } from '../hooks/useStudyTracker'
import { listCards, createCard, reviewCard, deleteCard, type KnowledgeCard } from '../db'
import { formatRelative } from '../format'

function parseTags(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)
}

export function CardsPage(): React.JSX.Element {
  useStudyTracker('浏览知识卡片')
  const cards = useAsyncData(listCards, [])
  const { push } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<KnowledgeCard | null>(null)

  const handleCreate = async (): Promise<void> => {
    setSaving(true)
    try {
      await createCard({ front, back, tags: parseTags(tags) })
      push('卡片已创建', 'success')
      setFront('')
      setBack('')
      setTags('')
      setShowForm(false)
      cards.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleReview = async (card: KnowledgeCard): Promise<void> => {
    try {
      await reviewCard(card.id)
      push('已记录一次复习，24 小时后再复习', 'success')
      cards.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!confirmTarget) return
    try {
      await deleteCard(confirmTarget.id)
      push('卡片已删除', 'success')
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
              ? `共 ${cards.data.length} 张卡片`
              : '手动创建卡片，或导入资料后由 AI 自动生成（后续版本）'}
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
                value={front}
                onChange={(e) => setFront(e.target.value)}
                placeholder="例如：机器学习按学习方式分为哪三大类？"
              />
            </div>
            <div className="form-field">
              <label className="form-label">背面（答案）</label>
              <textarea
                className="form-textarea"
                value={back}
                onChange={(e) => setBack(e.target.value)}
                placeholder="例如：监督学习、无监督学习、强化学习"
              />
            </div>
            <div className="form-field">
              <label className="form-label">标签（可选，用逗号或空格分隔）</label>
              <input
                className="form-input"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="例如：机器学习 基础概念"
              />
            </div>
            <div className="form-actions">
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="primary" onClick={handleCreate} disabled={saving || !front.trim() || !back.trim()}>
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
          cards.data.map((card) => (
            <div className="card-item" key={card.id}>
              <div className="card-main">
                <div className="card-front">{card.front}</div>
                <div className="card-back">{card.back}</div>
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
                    ? `已复习 ${card.reviewCount} 次 · 上次 ${formatRelative(card.lastReviewedAt!)}`
                    : '还未复习过'}{' '}
                  · 创建于 {formatRelative(card.createdAt)}
                </div>
              </div>
              <div className="card-actions">
                <Button small icon="check" onClick={() => handleReview(card)}>
                  已复习
                </Button>
                <Button small variant="ghost" icon="trash" onClick={() => setConfirmTarget(card)}>
                  删除
                </Button>
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            icon="cards"
            title="还没有知识卡片"
            desc="点击右上角「新建卡片」手动创建；导入学习资料后，AI 自动生成卡片的功能将在后续版本提供。"
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
    </div>
  )
}
