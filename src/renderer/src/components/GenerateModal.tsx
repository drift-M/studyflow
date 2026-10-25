import { useEffect, useState } from 'react'
import { Badge, Button, Modal, useToast } from './ui'
import { useGenerate, AI_INPUT_CHAR_LIMIT_UI, type GenerationKind } from '../hooks/useGenerate'
import { describeGenerationMode } from '../services'
import type { StudyDocument, QuizType } from '../db'
import type { AiProviderMode } from '../../../preload/api-types'

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
  const { state, loadChunks, generate, cancel, reset } = useGenerate(doc)
  const [scopeLabel, setScopeLabel] = useState('全部可提取文本')
  const [count, setCount] = useState(5)
  const [questionTypes, setQuestionTypes] = useState<Set<QuizType>>(
    new Set(['choice', 'judge', 'short'])
  )
  const [providerMode, setProviderMode] = useState<AiProviderMode>('demo')
  const [providerModel, setProviderModel] = useState('')

  useEffect(() => {
    if (open) {
      reset()
      setScopeLabel('全部可提取文本')
      void loadChunks()
      // 读取当前模型服务模式（默认演示，不自动调用任何模型）
      if (window.api) {
        window.api
          .aiGetConfig()
          .then((info) => {
            setProviderMode(info.config.mode)
            setProviderModel(
              info.config.mode === 'local'
                ? info.config.localModel
                : info.config.mode === 'api'
                  ? info.config.apiModel
                  : ''
            )
          })
          .catch(() => undefined)
      }
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

  const isAi = providerMode !== 'demo'
  const generationMode = isAi ? 'ai' : 'demo'

  const handleGenerate = async (): Promise<void> => {
    const saved = await generate(kind, generationMode, {
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
  const scopeChars = state.chunks.find((chunk) => chunk.label === scopeLabel)?.text.length
  const effectiveChars = scopeLabel === '全部可提取文本'
    ? state.chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)
    : scopeChars ?? 0

  return (
    <Modal open={open} title={title} footer={<Button onClick={onClose}>关闭</Button>}>
      <div className="gen-mode-banner">
        <Badge variant={isAi ? 'ok' : 'md'}>{describeGenerationMode(providerMode, providerModel)}</Badge>
        {isAi ? (
          <span className="text-muted">
            将调用你配置的模型服务生成内容；所选文本会发送给该服务。
            {providerModel ? '' : '（模型名称未配置，请到设置页填写）'}
          </span>
        ) : (
          <span className="text-muted">内容由本地规则从资料文本提取，不调用任何模型服务。</span>
        )}
      </div>

      {state.phase === 'loading-chunks' ? (
        <div className="loading-block">正在提取资料文本…</div>
      ) : state.phase === 'error' ? (
        <>
          <div className="error-block">{state.error}</div>
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <Button variant="primary" onClick={handleGenerate}>
              重试
            </Button>
          </div>
        </>
      ) : (
        <>
          {state.truncated ? (
            <div className="gen-notice">
              该文档较长，已仅提取前一部分文本参与生成（上限约 12 万字符 / 300 页）。
            </div>
          ) : null}
          {isAi && effectiveChars > AI_INPUT_CHAR_LIMIT_UI ? (
            <div className="gen-notice">
              所选范围约 {effectiveChars} 字，超过单次生成上限 {AI_INPUT_CHAR_LIMIT_UI} 字，将只使用前
              {AI_INPUT_CHAR_LIMIT_UI} 字（建议按章节分次生成）。
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
            <div className="loading-block">
              {isAi ? '模型生成中，可能需要几十秒（本地模型首次响应较慢）…' : '正在生成…'}
              <div className="form-actions" style={{ justifyContent: 'center', marginTop: 10 }}>
                <Button variant="danger" onClick={cancel}>
                  取消生成
                </Button>
              </div>
            </div>
          ) : null}

          {state.phase === 'done' ? (
            <div className="gen-results">
              <div className="gen-results-title">
                已生成并保存 {savedCount} {isCards ? '张卡片' : '道题'}到本地数据库
                {state.usedMode === 'ai' ? '（AI 模型生成）' : '（演示规则生成）'}
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

          {state.phase !== 'done' && state.phase !== 'generating' ? (
            <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
              <Button variant="primary" onClick={handleGenerate} disabled={busy}>
                {isAi ? '调用模型生成' : '开始生成'}（{scopeLabel === '全部可提取文本' ? '全部文本' : scopeLabel} ·{' '}
                {count} {isCards ? '张' : '道'}）
              </Button>
            </div>
          ) : null}
          {state.phase === 'done' ? (
            <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
              <Button
                onClick={() => {
                  push(`可在${isCards ? '「知识卡片」' : '「练习题」'}页面查看和练习`, 'success')
                  onClose()
                }}
              >
                完成
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Modal>
  )
}
