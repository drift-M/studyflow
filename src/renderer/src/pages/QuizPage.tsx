import { useState } from 'react'
import { Button, ConfirmModal, EmptyState, useToast } from '../components/ui'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import { useStudyTracker } from '../hooks/useStudyTracker'
import {
  listQuestions,
  createQuestion,
  deleteQuestion,
  recordWrongAnswer,
  type QuizQuestion
} from '../db'
import { optionLetter } from '../format'

interface QuestionFormState {
  question: string
  options: [string, string, string, string]
  answerIndex: number
  explanation: string
}

const EMPTY_FORM: QuestionFormState = {
  question: '',
  options: ['', '', '', ''],
  answerIndex: 0,
  explanation: ''
}

export function QuizPage(): React.JSX.Element {
  useStudyTracker('做练习题')
  const questions = useAsyncData(listQuestions, [])
  const { push } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<QuestionFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [confirmTarget, setConfirmTarget] = useState<QuizQuestion | null>(null)

  const handleCreate = async (): Promise<void> => {
    setSaving(true)
    try {
      await createQuestion({
        question: form.question,
        options: form.options,
        answerIndex: form.answerIndex,
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

  const toggleReveal = (id: string): void => {
    setRevealed((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleWrong = async (question: QuizQuestion): Promise<void> => {
    try {
      await recordWrongAnswer({
        questionId: question.id,
        questionSnapshot: question.question,
        correctAnswerText:
          typeof question.answer === 'number'
            ? `${optionLetter(question.answer)}、${question.options[question.answer]}`
            : String(question.answer),
        userAnswerText: '未选择（自评答错）'
      })
      push('已记入错题本', 'success')
    } catch (error) {
      push(errorMessage(error), 'error')
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
    form.question.trim().length > 0 && form.options.filter((o) => o.trim()).length >= 2

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">练习题</h1>
          <p className="page-subtitle">
            {questions.data
              ? `共 ${questions.data.length} 道题 · 答错的题可以一键记入错题本`
              : '先看题作答，再核对答案；答错的题可记入错题本'}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="plus" onClick={() => setShowForm((v) => !v)}>
            {showForm ? '收起表单' : '新建题目'}
          </Button>
        </div>
      </div>

      {questions.error ? <div className="error-block">{questions.error}</div> : null}

      {showForm ? (
        <div className="panel">
          <div className="form">
            <div className="form-field">
              <label className="form-label">题目</label>
              <textarea
                className="form-textarea"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                placeholder="例如：下列哪种学习方式使用「有标注数据」进行训练？"
              />
            </div>
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
          questions.data.map((question) => {
            const isRevealed = revealed.has(question.id)
            const answerIndex = typeof question.answer === 'number' ? question.answer : -1
            return (
              <div className="quiz-item" key={question.id}>
                <div className="quiz-top">
                  <div className="quiz-question">{question.question}</div>
                  <Button small variant="ghost" icon="trash" onClick={() => setConfirmTarget(question)}>
                    删除
                  </Button>
                </div>
                <div className="quiz-options">
                  {question.options.map((option, index) => (
                    <div
                      key={index}
                      className={`quiz-option${isRevealed && index === answerIndex ? ' correct' : ''}`}
                    >
                      <span className="quiz-option-letter">{optionLetter(index)}</span>
                      <span>{option}</span>
                    </div>
                  ))}
                </div>
                {isRevealed ? (
                  <>
                    {question.explanation ? (
                      <div className="quiz-explanation">{question.explanation}</div>
                    ) : null}
                    <div className="quiz-actions">
                      <Button small onClick={() => toggleReveal(question.id)}>
                        收起答案
                      </Button>
                      <Button small variant="danger" onClick={() => handleWrong(question)}>
                        答错了，记入错题本
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="quiz-actions">
                    <Button small variant="secondary" icon="eye" onClick={() => toggleReveal(question.id)}>
                      显示答案
                    </Button>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <EmptyState
            icon="quiz"
            title="还没有练习题"
            desc="点击右上角「新建题目」手动出题；导入学习资料后，AI 自动生成练习题的功能将在后续版本提供。"
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
            关联的错题记录也会一并删除。
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
