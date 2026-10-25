import { useCallback, useState } from 'react'
import {
  buildMarkdownChunks,
  buildPdfChunks,
  collectScopeText,
  validateChunksForGeneration,
  type ContentChunk
} from '../lib/chunks'
import { loadDocumentText } from '../components/readers/MarkdownReader'
import { loadPdfDocument, extractAllPageTexts, type ExtractAllProgress } from '../lib/pdf'
import { getGenerationService } from '../services'
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
}

const INITIAL: GenerationState = {
  phase: 'idle',
  error: null,
  chunks: [],
  truncated: false,
  progress: null,
  savedCards: [],
  savedQuestions: [],
  notice: null
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
 * 资料内容生成流程：加载文本片段 → 调用生成服务（当前为演示模式）→ 运行时校验 → 写入数据库。
 */
export function useGenerate(doc: StudyDocument): {
  state: GenerationState
  loadChunks: () => Promise<void>
  generate: (kind: GenerationKind, mode: GenerationMode, options: GenerateOptions) => Promise<boolean>
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
                sourceChapter: card.sourceChapter
              })
            )
          }
          setState((current) => ({
            ...current,
            phase: 'done',
            savedCards: saved,
            notice:
              saved.length < options.count
                ? `资料中可提取的内容有限，本次生成了 ${saved.length} 张卡片（目标 ${options.count} 张）`
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
              sourceChapter: question.sourceChapter
            })
          )
        }
        setState((current) => ({
          ...current,
          phase: 'done',
          savedQuestions: saved,
          notice:
            saved.length < options.count
              ? `资料中可提取的内容有限，本次生成了 ${saved.length} 道题（目标 ${options.count} 道）`
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

  const reset = useCallback((): void => {
    setState(INITIAL)
  }, [])

  return { state, loadChunks: handleLoadChunks, generate, reset }
}
