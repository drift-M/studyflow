import { useCallback, useState } from 'react'
import {
  buildMarkdownChunks,
  buildPdfChunks,
  collectScopeText,
  validateChunksForGeneration,
  MAX_GENERATION_CHARS,
  type ContentChunk
} from '../lib/chunks'
import { loadDocumentText } from '../components/readers/MarkdownReader'
import { loadPdfDocument, extractAllPageTexts, type ExtractAllProgress } from '../lib/pdf'
import { getGenerationService, cancelActiveGeneration } from '../services'
import type { GenerationMode } from '../services/types'
import {
  createCard,
  createQuestion,
  type StudyDocument,
  type KnowledgeCard,
  type QuizQuestion
} from '../db'
import { errorMessage } from './useAsyncData'

export type GenerationKind = 'cards' | 'questions'

export interface GenerateOptions {
  scopeLabel: string
  count: number
  questionTypes: Array<'choice' | 'judge' | 'short'>
}

export interface GenerationState {
  phase: 'idle' | 'loading-chunks' | 'generating' | 'done' | 'error'
  error: string | null
  chunks: ContentChunk[]
  /** 全量提取时因达到上限被截断 */
  truncated: boolean
  progress: ExtractAllProgress | null
  savedCards: KnowledgeCard[]
  savedQuestions: QuizQuestion[]
  /** 规则可生成数量不足时的提示 */
  notice: string | null
  /** 本次生成使用的模式（用于结果标注） */
  usedMode: GenerationMode | null
}

const INITIAL: GenerationState = {
  phase: 'idle',
  error: null,
  chunks: [],
  truncated: false,
  progress: null,
  savedCards: [],
  savedQuestions: [],
  notice: null,
  usedMode: null
}

/** 加载资料的可用文本片段：Markdown 直接分块；PDF 按页提取（带上限） */
async function loadChunks(doc: StudyDocument): Promise<{ chunks: ContentChunk[]; truncated: boolean }> {
  if (doc.fileType === 'markdown') {
    const text = await loadDocumentText(doc)
    return { chunks: buildMarkdownChunks(text), truncated: false }
  }
  let bytes: Uint8Array
  if (doc.sourcePath) {
    const result = await window.api.readStudyFile(doc.sourcePath)
    if (!result.ok) throw new Error(result.error)
    bytes = result.data.content as Uint8Array
  } else if (doc.content instanceof Uint8Array) {
    bytes = doc.content
  } else {
    throw new Error('该资料没有可提取的内容')
  }
  const pdf = await loadPdfDocument(bytes)
  if (!pdf) throw new Error('PDF 解析失败，无法提取文本')
  const { pages, truncated } = await extractAllPageTexts(pdf)
  return { chunks: buildPdfChunks(pages), truncated }
}

/**
 * 资料内容生成流程：加载文本片段 → 调用生成服务（Demo/AI）→ 运行时校验 → 写入数据库。
 */
export function useGenerate(doc: StudyDocument): {
  state: GenerationState
  loadChunks: () => Promise<void>
  generate: (kind: GenerationKind, mode: GenerationMode, options: GenerateOptions) => Promise<boolean>
  cancel: () => void
  reset: () => void
} {
  const [state, setState] = useState<GenerationState>(INITIAL)

  const handleLoadChunks = useCallback(async (): Promise<void> => {
    setState({ ...INITIAL, phase: 'loading-chunks' })
    try {
      const { chunks, truncated } = await loadChunks(doc)
      setState({ ...INITIAL, chunks, truncated })
    } catch (error) {
      setState({ ...INITIAL, phase: 'error', error: errorMessage(error) })
    }
  }, [doc])

  const generate = useCallback(
    async (kind: GenerationKind, mode: GenerationMode, options: GenerateOptions): Promise<boolean> => {
      const service = getGenerationService(mode)
      if (!service.isConfigured()) {
        setState((current) => ({ ...current, phase: 'error', error: service.unconfiguredHint() }))
        return false
      }
      const validationError = validateChunksForGeneration(state.chunks, options.scopeLabel)
      if (validationError) {
        setState((current) => ({ ...current, phase: 'error', error: validationError }))
        return false
      }
      setState((current) => ({ ...current, phase: 'generating', error: null, notice: null }))
      try {
        const text = collectScopeText(state.chunks, options.scopeLabel)
        const generatedBy = mode === 'ai' ? ('ai' as const) : ('demo' as const)
        const input = {
          sourceTitle: doc.title,
          scopeLabel: options.scopeLabel,
          text,
          count: options.count,
          questionTypes: options.questionTypes
        }
        if (kind === 'cards') {
          const cards = await service.generateCards(input)
          const saved: KnowledgeCard[] = []
          for (const card of cards) {
            saved.push(
              await createCard({
                documentId: doc.id,
                front: card.front,
                back: card.back,
                explanation: card.explanation,
                sourceChapter: card.sourceChapter,
                generatedBy
              })
            )
          }
          setState((current) => ({
            ...current,
            phase: 'done',
            usedMode: mode,
            savedCards: saved,
            notice:
              saved.length < options.count
                ? `本次生成了 ${saved.length} 张卡片（目标 ${options.count} 张）`
                : null
          }))
          return true
        }
        const questions = await service.generateQuestions(input)
        const saved: QuizQuestion[] = []
        for (const question of questions) {
          saved.push(
            await createQuestion({
              documentId: doc.id,
              type: question.type,
              question: question.question,
              options: question.options,
              answerIndex: question.answerIndex,
              answerText: question.answerText,
              explanation: question.explanation,
              sourceChapter: question.sourceChapter,
              generatedBy
            })
          )
        }
        setState((current) => ({
          ...current,
          phase: 'done',
          usedMode: mode,
          savedQuestions: saved,
          notice:
            saved.length < options.count
              ? `本次生成了 ${saved.length} 道题（目标 ${options.count} 道）`
              : null
        }))
        return true
      } catch (error) {
        setState((current) => ({ ...current, phase: 'error', error: errorMessage(error) }))
        return false
      }
    },
    [doc, state.chunks]
  )

  /** 用户取消：中断进行中的模型请求（底层通过 AbortController 真正中断） */
  const cancel = useCallback((): void => {
    cancelActiveGeneration()
    setState((current) =>
      current.phase === 'generating'
        ? { ...current, phase: 'idle', error: '已取消本次生成' }
        : current
    )
  }, [])

  const reset = useCallback((): void => {
    cancelActiveGeneration()
    setState(INITIAL)
  }, [])

  return { state, loadChunks: handleLoadChunks, generate, cancel, reset }
}

/** AI 模式的输入上限（与主进程 AI_INPUT_CHAR_LIMIT 一致，用于界面提示） */
export const AI_INPUT_CHAR_LIMIT_UI = 30_000
void MAX_GENERATION_CHARS
