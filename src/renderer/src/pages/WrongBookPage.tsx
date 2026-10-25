import { useState } from 'react'
import { Badge, Button, ConfirmModal, EmptyState, useToast } from '../components/ui'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import {
  listWrongAnswers,
  resolveWrongAnswer,
  deleteWrongAnswer,
  type WrongAnswer
} from '../db'
import { formatRelative } from '../format'
import type { PageId } from '../components/Sidebar'

export function WrongBookPage({ onNavigate }: { onNavigate: (page: PageId) => void }): React.JSX.Element {
  const wrongs = useAsyncData(listWrongAnswers, [])
  const { push } = useToast()
  const [confirmTarget, setConfirmTarget] = useState<WrongAnswer | null>(null)

  const handleResolve = async (wrong: WrongAnswer): Promise<void> => {
    try {
      const resolved = await resolveWrongAnswer(wrong.id)
      if (!resolved) {
        push('这条错题记录已不存在', 'error')
      } else {
        push('已标记为掌握', 'success')
      }
      wrongs.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!confirmTarget) return
    try {
      await deleteWrongAnswer(confirmTarget.id)
      push('错题记录已删除', 'success')
      wrongs.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setConfirmTarget(null)
    }
  }

  const unresolved = wrongs.data?.filter((wrong) => wrong.resolvedAt === null) ?? []
  const resolved = wrongs.data?.filter((wrong) => wrong.resolvedAt !== null) ?? []

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">错题本</h1>
          <p className="page-subtitle">
            {wrongs.data
              ? `${unresolved.length} 题待巩固 · ${resolved.length} 题已掌握`
              : '在练习题页面答错后，会自动收录到这里'}
          </p>
        </div>
      </div>

      {wrongs.error ? <div className="error-block">{wrongs.error}</div> : null}

      <div className="panel">
        {wrongs.loading ? (
          <div className="loading-block">加载中…</div>
        ) : unresolved.length > 0 ? (
          unresolved.map((wrong) => (
            <div className="list-row" key={wrong.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="wrong-question">{wrong.questionSnapshot}</div>
                <div className="wrong-answers-line">
                  我的答案：<strong>{wrong.userAnswerText || '—'}</strong>
                  　正确答案：{wrong.correctAnswerText}
                </div>
                <div className="wrong-meta">
                  累计答错 {wrong.wrongCount} 次 · 最近 {formatRelative(wrong.lastWrongAt)}
                </div>
              </div>
              <div className="doc-actions">
                <Button small icon="check" onClick={() => handleResolve(wrong)}>
                  已掌握
                </Button>
                <Button small variant="ghost" icon="trash" onClick={() => setConfirmTarget(wrong)}>
                  删除
                </Button>
              </div>
            </div>
          ))
        ) : wrongs.data && wrongs.data.length === 0 ? (
          <EmptyState
            icon="quiz"
            title="错题本还是空的"
            desc="去练习题页面答题，答错的题点击「记入错题本」就会出现在这里。"
            actions={<Button onClick={() => onNavigate('quiz')}>去做练习题</Button>}
          />
        ) : (
          <EmptyState icon="check" title="太棒了，没有待巩固的错题" desc="继续保持！已掌握的错题保留在下方。" />
        )}
      </div>

      {resolved.length > 0 ? (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">已掌握</div>
          </div>
          {resolved.map((wrong) => (
            <div className="list-row" key={wrong.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="wrong-question" style={{ color: 'var(--text-3)' }}>
                  {wrong.questionSnapshot}
                </div>
                <div className="wrong-meta">
                  掌握于 {formatRelative(wrong.resolvedAt!)} · 曾答错 {wrong.wrongCount} 次
                </div>
              </div>
              <Badge variant="ok">已掌握</Badge>
              <Button small variant="ghost" icon="trash" onClick={() => setConfirmTarget(wrong)}>
                删除
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <ConfirmModal
        open={!!confirmTarget}
        title="删除错题记录"
        desc={<>确定删除这条错题记录吗？删除后不可恢复。</>}
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  )
}
