/**
 * StudyFlow 本地备份格式（formatVersion 1）：
 *
 * {
 *   "app": "studyflow",
 *   "formatVersion": 1,
 *   "exportedAt": "2026-10-25T12:00:00.000Z",
 *   "data": {
 *     "documents":  StudyDocument[]   // 资料元数据 + 引用路径；旧版内置内容以 base64 保存
 *     "cards":      KnowledgeCard[]  // 含复习状态（下次复习时间、复习阶段、掌握度）
 *     "questions":  QuizQuestion[]
 *     "wrongAnswers": WrongAnswer[]
 *     "sessions":   StudySession[]
 *     "attempts":   AnswerRecord[]
 *   }
 * }
 *
 * 重要：备份不包含外部 PDF / Markdown 原始文件本体（只记录其本机路径），
 * 恢复到其他电脑后需要重新关联文件。旧版本导入的内置内容会完整备份。
 */

import type {
  AnswerRecord,
  KnowledgeCard,
  QuizQuestion,
  StudyDocument,
  StudySession,
  WrongAnswer
} from '../db/schema'

export const BACKUP_APP_ID = 'studyflow'
export const BACKUP_FORMAT_VERSION = 1

export interface BackupData {
  documents: StudyDocument[]
  cards: KnowledgeCard[]
  questions: QuizQuestion[]
  wrongAnswers: WrongAnswer[]
  sessions: StudySession[]
  attempts: AnswerRecord[]
}

export interface BackupFile {
  app: string
  formatVersion: number
  exportedAt: string
  data: BackupData
}

/** 二进制内容在 JSON 中的标记形式（仅旧版内置内容使用） */
interface BinaryMarker {
  __binaryBase64: string
}

function isBinaryMarker(value: unknown): value is BinaryMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).__binaryBase64 === 'string'
  )
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** 导出前转换：二进制内容 → base64 标记（备份格式与内存类型有意不同，此处做类型伪装） */
function encodeDocument(doc: StudyDocument): StudyDocument {
  if (doc.content instanceof Uint8Array) {
    return {
      ...doc,
      content: { __binaryBase64: bytesToBase64(doc.content) } as unknown as StudyDocument['content']
    }
  }
  return doc
}

/** 导入时还原：base64 标记 → 二进制 */
function decodeDocument(doc: StudyDocument): StudyDocument {
  if (isBinaryMarker(doc.content)) {
    return { ...doc, content: base64ToBytes(doc.content.__binaryBase64) }
  }
  return doc
}

export interface BackupSummary {
  documents: number
  inlineDocuments: number
  cards: number
  questions: number
  wrongAnswers: number
  sessions: number
  attempts: number
}

/** 校验备份文件结构；返回解析后的备份与数量汇总。任何不兼容都抛出中文错误 */
export function parseBackupFile(text: string): { backup: BackupFile; summary: BackupSummary } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是有效的 JSON，文件可能已损坏')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('备份文件结构不正确')
  }
  const root = parsed as Record<string, unknown>
  if (root.app !== BACKUP_APP_ID) {
    throw new Error('这不是 StudyFlow 知页的备份文件')
  }
  const formatVersion = root.formatVersion
  if (typeof formatVersion !== 'number') {
    throw new Error('备份文件缺少版本号，无法识别')
  }
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `备份文件版本（${formatVersion}）比当前应用支持的版本（${BACKUP_FORMAT_VERSION}）更新，请先升级应用`
    )
  }
  if (typeof root.exportedAt !== 'string') {
    throw new Error('备份文件缺少导出时间')
  }
  if (typeof root.data !== 'object' || root.data === null) {
    throw new Error('备份文件缺少数据部分')
  }
  const rawData = root.data as Record<string, unknown>
  const arrayOrEmpty = (key: string): unknown[] => {
    const value = rawData[key]
    if (value === undefined || value === null) return [] // 旧版本字段缺失按空处理
    if (!Array.isArray(value)) {
      throw new Error(`备份文件中「${key}」不是列表，文件可能已损坏`)
    }
    return value
  }

  const documents = arrayOrEmpty('documents').map((item) => decodeDocument(item as StudyDocument))
  const backup: BackupFile = {
    app: BACKUP_APP_ID,
    formatVersion,
    exportedAt: root.exportedAt,
    data: {
      documents,
      cards: arrayOrEmpty('cards') as KnowledgeCard[],
      questions: arrayOrEmpty('questions') as QuizQuestion[],
      wrongAnswers: arrayOrEmpty('wrongAnswers') as WrongAnswer[],
      sessions: arrayOrEmpty('sessions') as StudySession[],
      attempts: arrayOrEmpty('attempts') as AnswerRecord[]
    }
  }

  const summary: BackupSummary = {
    documents: backup.data.documents.length,
    inlineDocuments: backup.data.documents.filter((doc) => !doc.sourcePath).length,
    cards: backup.data.cards.length,
    questions: backup.data.questions.length,
    wrongAnswers: backup.data.wrongAnswers.length,
    sessions: backup.data.sessions.length,
    attempts: backup.data.attempts.length
  }
  return { backup, summary }
}

/**
 * 逐条校验记录的基本字段，返回可安全导入的记录列表与被跳过的数量。
 * 无 id、字段类型错误或文件内重复 id 的记录会被跳过（不中断导入）。
 */
export function sanitizeBackupData(data: BackupData): {
  clean: BackupData
  skipped: Record<keyof BackupData, number>
} {
  const clean: BackupData = {
    documents: [],
    cards: [],
    questions: [],
    wrongAnswers: [],
    sessions: [],
    attempts: []
  }
  const skipped: Record<keyof BackupData, number> = {
    documents: 0,
    cards: 0,
    questions: 0,
    wrongAnswers: 0,
    sessions: 0,
    attempts: 0
  }

  const seenIds = new Set<string>()
  const accept = (key: keyof BackupData, item: { id?: unknown }, isValid: () => boolean): void => {
    if (typeof item?.id !== 'string' || item.id.length === 0 || seenIds.has(item.id) || !isValid()) {
      skipped[key]++
      return
    }
    seenIds.add(item.id)
    ;(clean[key] as unknown[]).push(item)
  }

  for (const doc of data.documents) {
    accept(
      'documents',
      doc,
      () =>
        typeof doc.title === 'string' &&
        typeof doc.fileName === 'string' &&
        (doc.fileType === 'pdf' || doc.fileType === 'markdown') &&
        typeof doc.fileSize === 'number'
    )
  }
  for (const card of data.cards) {
    accept(
      'cards',
      card,
      () =>
        typeof card.front === 'string' &&
        typeof card.back === 'string' &&
        card.front.trim().length > 0 &&
        card.back.trim().length > 0 &&
        Array.isArray(card.tags)
    )
  }
  for (const question of data.questions) {
    accept(
      'questions',
      question,
      () =>
        typeof question.question === 'string' &&
        ['choice', 'judge', 'short'].includes(question.type) &&
        Array.isArray(question.options)
    )
  }
  for (const wrong of data.wrongAnswers) {
    accept(
      'wrongAnswers',
      wrong,
      () =>
        typeof wrong.questionId === 'string' &&
        typeof wrong.questionSnapshot === 'string' &&
        typeof wrong.wrongCount === 'number'
    )
  }
  for (const session of data.sessions) {
    accept(
      'sessions',
      session,
      () =>
        typeof session.summary === 'string' &&
        ['study', 'review', 'quiz'].includes(session.type) &&
        typeof session.durationSec === 'number'
    )
  }
  for (const attempt of data.attempts) {
    accept(
      'attempts',
      attempt,
      () =>
        typeof attempt.questionId === 'string' &&
        typeof attempt.isCorrect === 'boolean' &&
        typeof attempt.userAnswerText === 'string'
    )
  }
  return { clean, skipped }
}

/** 构建备份 JSON 字符串（本地执行，不上传） */
export function buildBackupJson(data: BackupData): string {
  const payload: BackupFile = {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      documents: data.documents.map(encodeDocument),
      cards: data.cards,
      questions: data.questions,
      wrongAnswers: data.wrongAnswers,
      sessions: data.sessions,
      attempts: data.attempts
    }
  }
  return JSON.stringify(payload, null, 2)
}
