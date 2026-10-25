import { useState } from 'react'
import { Badge, Button, ConfirmModal, EmptyState, useToast } from '../components/ui'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import { useStudyTracker } from '../hooks/useStudyTracker'
import {
  listQuestions,
  createQuestion,
  deleteQuestion,
  addAnswerRecord,
  recordWrongAnswer,
  listDocuments,
  type QuizQuestion,
  type QuizType
} from '../db'
import { optionLetter } from '../format'

const JUDGE_OPTIONS = ['正确', '错误']

interface QuestionFormState {
  type: QuizType
  question: string
  options: [string, string, string, string]
  answerIndex: number
  answerText: string
  explanation: string
}

const EMPTY_FORM: QuestionFormState = {
  type: 'choice',
  question: '',
  options: ['', '', '', ''],
  answerIndex: 0,
  answerText: '',
  explanation: ''
}

interface SessionResult {
  question: QuizQuestion
  isCorrect: boolean
  userAnswerText: string
}

interface Session {
  queue: QuizQuestion[]
  index: number
  results: SessionResult[]
}

const TYPE_BADGE: Record<QuizType, { label: string; variant: 'md' | 'warn' | 'gray' }> = {
  choice: { label: '单选', variant: 'md' },
  judge: { label: '判断', variant: 'warn' },
  short: { label: '简答', variant: 'gray' }
}

export function QuizPage(): React.JSX.Element {
  useStudyTracker('做练习题')
  const questions = useAsyncData(listQuestions, [])
  const documents = useAsyncData(listDocuments, [])
  const { push } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<QuestionFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<QuizQuestion | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [shortAnswer, setShortAnswer] = useState('')
  const [currentResult, setCurrentResult] = useState<SessionResult | null>(null)
  const [shortRevealed, setShortRevealed] = useState(false)

  const docTitle = (documentId: string | null): string | null => {
    if (!documentId) return null
    return documents.data?.find((doc) => doc.id === documentId)?.title ?? '（已删除的资料）'
  }

  const correctAnswerText = (question: QuizQuestion): string => {
    if (question.type === 'short') return String(question.answer)
    if (question.type === 'judge') return JUDGE_OPTIONS[question.answer as number]
    return `${optionLetter(question.answer as number)}、${question.options[question.answer as number]}`
  }

  const startSession = (): void => {
    if (!questions.data || questions.data.length === 0) return
    setSession({ queue: [...questions.data], index: 0, results: [] })
    setSelected(null)
    setShortAnswer('')
    setCurrentResult(null)
    setShortRevealed(false)
  }

  const recordResult = async (question: QuizQuestion, isCorrect: boolean, userAnswerText: string): Promise<void> => {
    try {
      await addAnswerRecord({
        questionId: question.id,
        questionType: question.type,
        isCorrect,
        userAnswerText
      })
      if (!isCorrect) {
        await recordWrongAnswer({
          questionId: question.id,
          questionSnapshot: question.question,
          correctAnswerText: correctAnswerText(question),
          userAnswerText
        })
      }
    } catch (error) {
      push(errorMessage(error), 'error')
    }
  }

  const submitObjective = async (): Promise<void> => {
    const question = session!.queue[session!.index]
    if (selected === null) return
    const isCorrect = selected === question.answer
    const userAnswerText =
      question.type === 'judge'
        ? JUDGE_OPTIONS[selected]
        : `${optionLetter(selected)}、${question.options[selected]}`
    const result: SessionResult = { question, isCorrect, userAnswerText }
    setCurrentResult(result)
    await recordResult(question, isCorrect, userAnswerText)
  }

  const selfAssessShort = async (isCorrect: boolean): Promise<void> => {
    const question = session!.queue[session!.index]
    const result: SessionResult = { question, isCorrect, userAnswerText: shortAnswer.trim() || '（未作答）' }
    setCurrentResult(result)
    setShortRevealed(true)
    await recordResult(question, isCorrect, result.userAnswerText)
  }

  const nextQuestion = (): void => {
    if (!session || !currentResult) return
    const results = [...session.results, currentResult]
    if (session.index + 1 >= session.queue.length) {
      // 最后一题：index 推进到队尾，触发结果汇总页
      setSession({ ...session, index: session.queue.length, results })
      setCurrentResult(null)
      return
    }
    setSession({ ...session, index: session.index + 1, results })
    setSelected(null)
    setShortAnswer('')
    setCurrentResult(null)
    setShortRevealed(false)
  }

  const endSession = (): void => {
    setSession(null)
    setSelected(null)
    setShortAnswer('')
    setCurrentResult(null)
    setShortRevealed(false)
  }

  const handleCreate = async (): Promise<void> => {
    setSaving(true)
    try {
      await createQuestion({
        type: form.type,
        question: form.question,
        options: form.type === 'judge' ? [...JUDGE_OPTIONS] : form.options,
        answerIndex: form.type === 'short' ? undefined : form.answerIndex,
        answerText: form.type === 'short' ? form.answerText : undefined,
        explanation: form.explanation
      })
      push('题目已创建', 'success')
      setForm(EMPTY_FORM)
      setShowForm(false)
      questions.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!confirmTarget) return
    try {
      await deleteQuestion(confirmTarget.id)
      push('题目已删除', 'success')
      questions.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setConfirmTarget(null)
    }
  }

  const formValid =
    form.question.trim().length > 0 &&
    (form.type === 'short' ? form.answerText.trim().length > 0 : true) &&
    (form.type === 'choice' ? form.options.filter((o) => o.trim()).length >= 2 : true)

  // ===== 答题会话 =====
  if (session && session.queue.length > 0) {
    const finished = session.index >= session.queue.length
    if (finished) {
      const correctCount = session.results.filter((result) => result.isCorrect).length
      return (
        <div className="page">
          <div className="page-header">
            <div>
              <h1 className="page-title">练习完成</h1>
              <p className="page-subtitle">答题记录已保存到本地</p>
            </div>
          </div>
          <div className="panel">
            <div className="session-summary-box">
              <div className="stat-row">
                <div>
                  <div className="stat-value">{session.results.length}</div>
                  <div className="stat-label">总题数</div>
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>
                    {correctCount}
                  </div>
                  <div className="stat-label">答对</div>
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--danger)' }}>
                    {session.results.length - correctCount}
                  </div>
                  <div className="stat-label">答错（已记入错题本）</div>
                </div>
              </div>
              <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
                <Button variant="primary" onClick={startSession}>
                  再来一轮
                </Button>
                <Button onClick={endSession}>结束</Button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    const question = session.queue[session.index]
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">答题中</h1>
            <p className="page-subtitle">
              第 {session.index + 1} / {session.queue.length} 题 · 答错的题会自动记入错题本
            </p>
          </div>
          <div className="page-actions">
            <Button variant="ghost" onClick={endSession}>
              结束练习
            </Button>
          </div>
        </div>

        <div className="panel quiz-session-panel">
          <div className="quiz-item">
            <div className="quiz-top">
              <div className="quiz-question">{question.question}</div>
              <Badge variant={TYPE_BADGE[question.type].variant}>
                {TYPE_BADGE[question.type].label}
              </Badge>
            </div>

            {question.type === 'short' ? (
              <>
                <textarea
                  className="form-textarea"
                  style={{ marginTop: 12 }}
                  placeholder="在此输入你的答案（提交后对照参考答案自评）"
                  value={shortAnswer}
                  disabled={!!currentResult}
                  onChange={(event) => setShortAnswer(event.target.value)}
                />
                {!currentResult ? (
                  <div className="quiz-actions">
                    <Button
                      variant="primary"
                      onClick={() => setShortRevealed(true)}
                      disabled={shortRevealed}
                    >
                      对照参考答案
                    </Button>
                  </div>
                ) : null}
                {shortRevealed ? (
                  <div className="quiz-reference">
                    <div className="quiz-reference-title">参考答案（请自我对照，自行评判）</div>
                    <div>{String(question.answer)}</div>
                    {question.explanation ? (
                      <div className="quiz-explanation">{question.explanation}</div>
                    ) : null}
                  </div>
                ) : null}
                {!currentResult && shortRevealed ? (
                  <div className="quiz-actions">
                    <Button variant="primary" icon="check" onClick={() => selfAssessShort(true)}>
                      我答对了
                    </Button>
                    <Button variant="danger" onClick={() => selfAssessShort(false)}>
                      我答错了
                    </Button>
                  </div>
                ) : null}
                {currentResult ? (
                  <div className={`quiz-verdict ${currentResult.isCorrect ? 'correct' : 'wrong'}`}>
                    {currentResult.isCorrect ? '回答正确 ✓' : '已记为答错，进入错题本'}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="quiz-options">
                  {question.options.map((option, index) => {
                    const isAnswer = index === question.answer
                    const isSelected = selected === index
                    const showState = !!currentResult
                    return (
                      <button
                        key={index}
                        className={`quiz-option quiz-option-click${
                          showState && isAnswer ? ' correct' : ''
                        }${showState && isSelected && !isAnswer ? ' wrong' : ''}${
                          !showState && isSelected ? ' selected' : ''
                        }`}
                        disabled={!!currentResult}
                        onClick={() => setSelected(index)}
                      >
                        <span className="quiz-option-letter">{optionLetter(index)}</span>
                        <span>{option}</span>
                      </button>
                    )
                  })}
                </div>
                {currentResult ? (
                  <>
                    <div className={`quiz-verdict ${currentResult.isCorrect ? 'correct' : 'wrong'}`}>
                      {currentResult.isCorrect
                        ? '回答正确 ✓'
                        : `回答错误 ✗ 正确答案：${correctAnswerText(question)}`}
                    </div>
                    {question.explanation ? (
                      <div className="quiz-explanation">{question.explanation}</div>
                    ) : null}
                  </>
                ) : null}
                <div className="quiz-actions">
                  {!currentResult ? (
                    <Button variant="primary" onClick={submitObjective} disabled={selected === null}>
                      提交答案
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={nextQuestion}>
                      {session.index + 1 >= session.queue.length ? '查看结果' : '下一题'}
                    </Button>
                  )}
                </div>
              </>
            )}
            {question.type === 'short' && currentResult ? (
              <div className="quiz-actions">
                <Button variant="primary" onClick={nextQuestion}>
                  {session.index + 1 >= session.queue.length ? '查看结果' : '下一题'}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  // ===== 概览 / 管理页 =====
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">练习题</h1>
          <p className="page-subtitle">
            {questions.data
              ? `共 ${questions.data.length} 道题 · 单选/判断自动判分，简答题自评对照`
              : '在资料详情页点击「生成练习题」，或手动创建'}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon="plus" onClick={() => setShowForm((v) => !v)}>
            {showForm ? '收起表单' : '新建题目'}
          </Button>
          <Button variant="primary" icon="quiz" onClick={startSession} disabled={!questions.data || questions.data.length === 0}>
            开始练习
          </Button>
        </div>
      </div>

      {questions.error ? <div className="error-block">{questions.error}</div> : null}

      {showForm ? (
        <div className="panel">
          <div className="form">
            <div className="form-field">
              <span className="form-label">题型</span>
              <div className="gen-count-row">
                {(['choice', 'judge', 'short'] as QuizType[]).map((type) => (
                  <label key={type} className="gen-radio">
                    <input
                      type="radio"
                      name="new-question-type"
                      checked={form.type === type}
                      onChange={() => setForm({ ...form, type })}
                    />
                    {TYPE_BADGE[type].label}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">题干</label>
              <textarea
                className="form-textarea"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                placeholder="例如：下列哪种学习方式使用「有标注数据」进行训练？"
              />
            </div>
            {form.type === 'choice' ? (
              <div className="form-field">
                <label className="form-label">选项（至少填写两个）</label>
                {form.options.map((option, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
                    <input
                      className="form-input"
                      style={{ flex: 1 }}
                      value={option}
                      onChange={(e) => {
                        const options = [...form.options] as QuestionFormState['options']
                        options[index] = e.target.value
                        setForm({ ...form, options })
                      }}
                      placeholder={`选项 ${optionLetter(index)}`}
                    />
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12.5,
                        color: 'var(--text-2)',
                        flexShrink: 0
                      }}
                    >
                      <input
                        type="radio"
                        name="correct-option"
                        checked={form.answerIndex === index}
                        onChange={() => setForm({ ...form, answerIndex: index })}
                      />
                      正确
                    </label>
                  </div>
                ))}
              </div>
            ) : null}
            {form.type === 'judge' ? (
              <div className="form-field">
                <span className="form-label">正确答案</span>
                <div className="gen-count-row">
                  {JUDGE_OPTIONS.map((option, index) => (
                    <label key={option} className="gen-radio">
                      <input
                        type="radio"
                        name="judge-answer"
                        checked={form.answerIndex === index}
                        onChange={() => setForm({ ...form, answerIndex: index })}
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {form.type === 'short' ? (
              <div className="form-field">
                <label className="form-label">参考答案</label>
                <textarea
                  className="form-textarea"
                  value={form.answerText}
                  onChange={(e) => setForm({ ...form, answerText: e.target.value })}
                  placeholder="答题时会展示给用户自我对照"
                />
              </div>
            ) : null}
            <div className="form-field">
              <label className="form-label">解析（可选）</label>
              <input
                className="form-input"
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                placeholder="为什么这个答案是对的"
              />
            </div>
            <div className="form-actions">
              <Button onClick={() => setShowForm(false)}>取消</Button>
              <Button variant="primary" onClick={handleCreate} disabled={saving || !formValid}>
                {saving ? '保存中…' : '创建题目'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        {questions.loading ? (
          <div className="loading-block">加载中…</div>
        ) : questions.data && questions.data.length > 0 ? (
          questions.data.map((question) => (
            <div className="quiz-item" key={question.id}>
              <div className="quiz-top">
                <div className="quiz-question">{question.question}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {question.sourceChapter ? (
                    <Badge variant="gray">{question.sourceChapter}</Badge>
                  ) : null}
                  <Badge variant={TYPE_BADGE[question.type].variant}>
                    {TYPE_BADGE[question.type].label}
                  </Badge>
                  <Button
                    small
                    variant="ghost"
                    icon="trash"
                    onClick={() => setConfirmTarget(question)}
                  >
                    删除
                  </Button>
                </div>
              </div>
              {question.type !== 'short' ? (
                <div className="quiz-options quiz-options-static">
                  {question.options.map((option, index) => (
                    <div
                      key={index}
                      className={`quiz-option${index === question.answer ? ' correct' : ''}`}
                    >
                      <span className="quiz-option-letter">{optionLetter(index)}</span>
                      <span>{option}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="quiz-reference">
                  <div className="quiz-reference-title">参考答案</div>
                  <div>{String(question.answer)}</div>
                </div>
              )}
              {question.explanation ? <div className="quiz-explanation">{question.explanation}</div> : null}
              {docTitle(question.documentId) ? (
                <div className="card-meta">来源：{docTitle(question.documentId)}</div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState
            icon="quiz"
            title="还没有练习题"
            desc="打开一份学习资料，点击右上角「生成练习题」，或手动创建。"
          />
        )}
      </div>

      <ConfirmModal
        open={!!confirmTarget}
        title="删除题目"
        desc={
          <>
            确定删除这道题吗？
            <br />
            {confirmTarget?.question}
            <br />
            关联的错题记录与答题记录也会一并删除。
          </>
        }
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  )
}
