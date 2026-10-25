/**
 * StudyFlow 数据层类型定义（IndexedDB）。
 * 所有实体都包含稳定 id、createdAt、updatedAt。
 */

export type DocumentFileType = 'pdf' | 'markdown'

/** 学习资料 */
export interface StudyDocument {
  id: string
  /** 显示标题，默认为去扩展名的文件名 */
  title: string
  fileName: string
  fileType: DocumentFileType
  /** 字节数 */
  fileSize: number
  /**
   * 原始文件在本机的绝对路径。正常导入的资料只保存路径引用，
   * 打开时通过主进程读取；为 null 表示内容内联存储（示例数据或旧版本导入）。
   */
  sourcePath?: string | null
  /** PDF 总页数，首次打开时更新；非 PDF 为 null */
  pageCount?: number | null
  /**
   * 内联内容：Markdown 存 UTF-8 文本；PDF 存原始二进制。
   * 仅 sourcePath 为 null 的资料使用（示例数据 / v1 旧数据）。
   */
  content?: string | Uint8Array
  status: 'imported'
  note?: string
  importedAt: number
  createdAt: number
  updatedAt: number
}

/** 知识卡片 */
export interface KnowledgeCard {
  id: string
  /** 关联资料，手动创建的卡片为 null */
  documentId: string | null
  front: string
  back: string
  tags: string[]
  reviewCount: number
  lastReviewedAt: number | null
  /** 下次应复习时间；新卡片等于创建时间（立即可复习） */
  nextReviewAt: number
  createdAt: number
  updatedAt: number
}

export type QuizType = 'choice' | 'short'

/** 练习题 */
export interface QuizQuestion {
  id: string
  documentId: string | null
  type: QuizType
  question: string
  /** choice 选项文本 */
  options: string[]
  /** choice 为正确选项下标；short 为参考答案文本 */
  answer: number | string
  explanation?: string
  createdAt: number
  updatedAt: number
}

/** 错题记录 */
export interface WrongAnswer {
  id: string
  questionId: string
  /** 题目快照，避免题目被删除后错题本丢失语义 */
  questionSnapshot: string
  correctAnswerText: string
  userAnswerText: string
  wrongCount: number
  lastWrongAt: number
  resolvedAt: number | null
  createdAt: number
  updatedAt: number
}

export type StudySessionType = 'study' | 'review' | 'quiz'

/** 学习记录 */
export interface StudySession {
  id: string
  type: StudySessionType
  summary: string
  startedAt: number
  durationSec: number
  documentId: string | null
  createdAt: number
  updatedAt: number
}
