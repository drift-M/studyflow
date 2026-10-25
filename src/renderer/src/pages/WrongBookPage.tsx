import { useState } from 'react'
import { Badge, Button, ConfirmModal, EmptyState, useToast } from '../components/ui'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import {
  listWrongAnswers,
  resolveWrongAnswer,
  deleteWrongAnswer,
  addAnswerRecord,
  recordWrongAnswer,
  getQuestion,
  type WrongAnswer,
  type QuizQuestion
} from '../db'
import { optionLetter, formatRelative } from '../format'
import type { PageId } from '../components/Sidebar'

const JUDGE_OPTIONS = ['正确', '错误']

interface RedoState {
  wrong: WrongAnswer
  question: QuizQuestion
  selected: number | null
  shortText: string
  revealed: boolean
  outcome: 'correct' | 'wrong' | null
}

export function WrongBookPage({
  onNavigate
}: {
  onNavigate: (page: PageId) => void
}): React.JSX.Element {
  const wrongs = useAsyncData(listWrongAnswers, [])
  const { push } = useToast()
  const [confirmTarget, setConfirmTarget] = useState<WrongAnswer | null>(null)
  const [redo, setRedo] = useState<RedoState | null>(null)
  const [redoLoading, setRedoLoading] = useState(false)

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

  const startRedo = async (wrong: WrongAnswer): Promise<void> => {
    setRedoLoading(true)
    try {
      const question = await getQuestion(wrong.questionId)
      if (!question) {
        push('原题已被删除，无法重做；可以标记已掌握或删除这条记录', 'error')
        return
      }
      setRedo({
        wrong,
        question,
        selected: null,
        shortText: '',
        revealed: false,
        outcome: null
      })
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setRedoLoading(false)
    }
  }

  const submitRedo = async (isCorrect: boolean, userAnswerText: string): Promise<void> => {
    if (!redo) return
    try {
      await addAnswerRecord({
        questionId: redo.question.id,
        questionType: redo.question.type,
        isCorrect,
        userAnswerText
      })
      if (isCorrect) {
        await resolveWrongAnswer(redo.wrong.id)
        push('重做正确，已自动标记为掌握', 'success')
      } else {
        await recordWrongAnswer({
          questionId: redo.question.id,
          questionSnapshot: redo.question.question,
          correctAnswerText:
            redo.question.type === 'short'
              ? String(redo.question.answer)
              : redo.question.type === 'judge'
                ? JUDGE_OPTIONS[redo.question.answer as number]
                : `${optionLetter(redo.question.answer as number)}、${redo.question.options[redo.question.answer as number]}`,
          userAnswerText
        })
        push('又答错了，错题记录已更新', 'error')
      }
      setRedo({ ...redo, outcome: isCorrect ? 'correct' : 'wrong' })
      wrongs.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    }
  }

  const unresolved = wrongs.data?.filter((wrong) => wrong.resolvedAt === null) ?? []
  const resolved = wrongs.data?.filter((wrong) => wrong.resolvedAt !== null) ?? []

  const renderRedoPanel = (): React.JSX.Element | null => {
    if (!redo) return null
    const { question } = redo
    return (
      <div className="redo-panel">
        <div className="redo-title">
          重做：{question.question}
          {question.type !== 'short' ? <Badge variant="gray">{question.type === 'judge' ? '判断' : '单选'}</Badge> : <Badge variant="gray">简答</Badge>}
        </div>
        {question.type === 'short' ? (
          <>
            <textarea
              className="form-textarea"
              placeholder="再次作答，然后对照参考答案自评"
              value={redo.shortText}
              disabled={!!redo.outcome}
              onChange={(event) => setRedo({ ...redo, shortText: event.target.value })}
            />
            {!redo.revealed && !redo.outcome ? (
              <div className="quiz-actions">
                <Button onClick={() => setRedo({ ...redo, revealed: true })}>对照参考答案</Button>
              </div>
            ) : null}
            {redo.revealed && !redo.outcome ? (
              <div className="quiz-reference">
                <div className="quiz-reference-title">参考答案（自我对照）</div>
                <div>{String(question.answer)}</div>
              </div>
            ) : null}
            {redo.revealed && !redo.outcome ? (
              <div className="quiz-actions">
                <Button variant="primary" icon="check" onClick={() => submitRedo(true, redo.shortText.trim() || '（未作答）')}>
                  我答对了
                </Button>
                <Button variant="danger" onClick={() => submitRedo(false, redo.shortText.trim() || '（未作答）')}>
                  我答错了
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="quiz-options quiz-options-static">
              {question.options.map((option, index) => (
                <button
                  key={index}
                  className={`quiz-option quiz-option-click${
                    redo.outcome && index === question.answer ? ' correct' : ''
                  }${redo.outcome && redo.selected === index && index !== question.answer ? ' wrong' : ''}${
                    !redo.outcome && redo.selected === index ? ' selected' : ''
                  }`}
                  disabled={!!redo.outcome}
                  onClick={() => setRedo({ ...redo, selected: index })}
                >
                  <span className="quiz-option-letter">{optionLetter(index)}</span>
                  <span>{option}</span>
                </button>
              ))}
            </div>
            {!redo.outcome ? (
              <div className="quiz-actions">
                <Button
                  variant="primary"
                  disabled={redo.selected === null}
                  onClick={() => {
                    const isCorrect = redo.selected === question.answer
                    const userAnswerText =
                      question.type === 'judge'
                        ? JUDGE_OPTIONS[redo.selected!]
                        : `${optionLetter(redo.selected!)}、${question.options[redo.selected!]}`
                    void submitRedo(isCorrect, userAnswerText)
                  }}
                >
                  提交答案
                </Button>
              </div>
            ) : (
              <div className={`quiz-verdict ${redo.outcome === 'correct' ? 'correct' : 'wrong'}`}>
                {redo.outcome === 'correct' ? '回答正确 ✓' : '回答错误 ✗'}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">错题本</h1>
          <p className="page-subtitle">
            {wrongs.data
              ? `${unresolved.length} 题待巩固 · ${resolved.length} 题已掌握 · 支持重做`
              : '答题答错后会自动收录到这里'}
          </p>
        </div>
      </div>

      {wrongs.error ? <div className="error-block">{wrongs.error}</div> : null}

      <div className="panel">
        {wrongs.loading ? (
          <div className="loading-block">加载中…</div>
        ) : unresolved.length > 0 ? (
          unresolved.map((wrong) => (
            <div className="list-row" key={wrong.id} style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div className="wrong-question">{wrong.questionSnapshot}</div>
                <div className="wrong-answers-line">
                  我的答案：<strong>{wrong.userAnswerText || '—'}</strong>
                  　正确答案：{wrong.correctAnswerText}
                </div>
                <div className="wrong-meta">
                  累计答错 {wrong.wrongCount} 次 · 最近 {formatRelative(wrong.lastWrongAt)}
                </div>
                {redo?.wrong.id === wrong.id ? renderRedoPanel() : null}
              </div>
              <div className="doc-actions">
                <Button small variant="secondary" onClick={() => startRedo(wrong)} disabled={redoLoading}>
                  重做
                </Button>
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
            desc="去练习题页面答题，答错的题会自动出现在这里。"
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
