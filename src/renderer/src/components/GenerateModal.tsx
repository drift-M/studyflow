import { useEffect, useState } from 'react'
import { Badge, Button, Modal, useToast } from './ui'
import { useGenerate, type GenerationKind } from '../hooks/useGenerate'
import type { StudyDocument, QuizType } from '../db'
import type { GenerationMode } from '../services/types'
import { AI_MODE_HINT } from '../services'

const COUNT_OPTIONS = [5, 10, 20]

const QUESTION_TYPE_LABELS: Array<{ id: QuizType; label: string }> = [
  { id: 'choice', label: '单选题' },
  { id: 'judge', label: '判断题' },
  { id: 'short', label: '简答题' }
]

export function GenerateModal({
  open,
  kind,
  doc,
  onClose,
  onSaved
}: {
  open: boolean
  kind: GenerationKind
  doc: StudyDocument
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element | null {
  const { push } = useToast()
  const { state, loadChunks, generate, reset } = useGenerate(doc)
  const [scopeLabel, setScopeLabel] = useState('全部可提取文本')
  const [count, setCount] = useState(5)
  const [questionTypes, setQuestionTypes] = useState<Set<QuizType>>(
    new Set(['choice', 'judge', 'short'])
  )
  const [mode] = useState<GenerationMode>('demo')

  useEffect(() => {
    if (open) {
      reset()
      setScopeLabel('全部可提取文本')
      void loadChunks()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc.id])

  const toggleType = (type: QuizType): void => {
    setQuestionTypes((current) => {
      const next = new Set(current)
      if (next.has(type)) {
        if (next.size > 1) next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const handleGenerate = async (): Promise<void> => {
    const saved = await generate(kind, mode, {
      scopeLabel,
      count,
      questionTypes: [...questionTypes]
    })
    if (saved) {
      onSaved()
    }
  }

  if (!open) return null

  const isCards = kind === 'cards'
  const title = isCards ? '生成知识卡片' : '生成练习题'
  const busy = state.phase === 'loading-chunks' || state.phase === 'generating'
  const savedCount = isCards ? state.savedCards.length : state.savedQuestions.length

  return (
    <Modal open={open} title={title} footer={<Button onClick={onClose}>关闭</Button>}>
      <div className="gen-mode-banner">
        <Badge variant="md">演示模式 · 规则生成</Badge>
        <span className="text-muted">
          内容由本地规则从资料文本提取（非真实 AI 调用），相同内容生成结果稳定。{AI_MODE_HINT}
        </span>
      </div>

      {state.phase === 'loading-chunks' ? (
        <div className="loading-block">正在提取资料文本…</div>
      ) : state.phase === 'error' ? (
        <div className="error-block">{state.error}</div>
      ) : (
        <>
          {state.truncated ? (
            <div className="gen-notice">
              该文档较长，已仅提取前一部分文本参与生成（上限约 12 万字符 / 300 页）。
            </div>
          ) : null}

          <div className="form-field">
            <span className="form-label">生成范围</span>
            <select
              className="form-select"
              value={scopeLabel}
              onChange={(event) => setScopeLabel(event.target.value)}
              disabled={busy}
            >
              <option value="全部可提取文本">全部可提取文本</option>
              {state.chunks.map((chunk) => (
                <option key={chunk.label} value={chunk.label}>
                  {chunk.label}（{chunk.text.length} 字）
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <span className="form-label">生成数量</span>
            <div className="gen-count-row">
              {COUNT_OPTIONS.map((option) => (
                <label key={option} className="gen-radio">
                  <input
                    type="radio"
                    name="gen-count"
                    checked={count === option}
                    disabled={busy}
                    onChange={() => setCount(option)}
                  />
                  {option} {isCards ? '张' : '道'}
                </label>
              ))}
            </div>
          </div>

          {!isCards ? (
            <div className="form-field">
              <span className="form-label">题型（至少选择一种）</span>
              <div className="gen-count-row">
                {QUESTION_TYPE_LABELS.map(({ id, label }) => (
                  <label key={id} className="gen-radio">
                    <input
                      type="checkbox"
                      checked={questionTypes.has(id)}
                      disabled={busy}
                      onChange={() => toggleType(id)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {state.phase === 'generating' ? (
            <div className="loading-block">正在生成…</div>
          ) : null}

          {state.phase === 'done' ? (
            <div className="gen-results">
              <div className="gen-results-title">
                已生成并保存 {savedCount} {isCards ? '张卡片' : '道题'}到本地数据库
              </div>
              {state.notice ? <div className="gen-notice">{state.notice}</div> : null}
              <div className="gen-results-list">
                {isCards
                  ? state.savedCards.map((card, index) => (
                      <div className="gen-result-item" key={card.id}>
                        <div className="gen-result-q">
                          {index + 1}. {card.front}
                        </div>
                        <div className="gen-result-a">{card.back}</div>
                        <div className="gen-result-src">来源：{card.sourceChapter}</div>
                      </div>
                    ))
                  : state.savedQuestions.map((question, index) => (
                      <div className="gen-result-item" key={question.id}>
                        <div className="gen-result-q">
                          {index + 1}. [{question.type === 'choice' ? '单选' : question.type === 'judge' ? '判断' : '简答'}]{' '}
                          {question.question}
                        </div>
                        <div className="gen-result-a">
                          {question.type === 'short'
                            ? `参考答案：${question.answer ?? ''}`
                            : `答案：${
                                typeof question.answer === 'number'
                                  ? question.options[question.answer]
                                  : ''
                              }`}
                        </div>
                        <div className="gen-result-src">来源：{question.sourceChapter}</div>
                      </div>
                    ))}
              </div>
            </div>
          ) : null}

          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={busy || state.phase === 'done'}
            >
              {state.phase === 'done'
                ? '已生成'
                : `开始生成（${scopeLabel === '全部可提取文本' ? '全部文本' : scopeLabel}）`}
            </Button>
            {state.phase === 'done' ? (
              <Button
                onClick={() => {
                  push(`可在${isCards ? '「知识卡片」' : '「练习题」'}页面查看和练习`, 'success')
                  onClose()
                }}
              >
                完成
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  )
}
