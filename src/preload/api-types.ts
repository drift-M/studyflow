/** 渲染进程与主进程之间约定的 IPC 类型。此文件不包含运行时代码。 */

/** 原生文件选择框结果（不做任何校验） */
export interface StudyFileSelection {
  canceled: boolean
  filePath?: string
}

/** 导入结果：只包含元数据，不读取文件内容 */
export type ImportStudyFileResult =
  | { canceled: true }
  | {
      canceled: false
      filePath: string
      fileName: string
      fileType: 'pdf' | 'markdown'
      fileSize: number
    }

export interface StudyFileData {
  fileName: string
  fileType: 'pdf' | 'markdown'
  fileSize: number
  /** Markdown 为 UTF-8 文本；PDF 为原始二进制 */
  content: string | Uint8Array
}

export type ReadStudyFileResult =
  | { ok: true; data: StudyFileData }
  | { ok: false; error: string }

/** 通过 contextBridge 暴露给渲染进程的最小化 API */
export interface StudyFlowApi {
  /** 打开原生文件选择框（仅选择，供重新关联文件使用） */
  selectStudyFile(): Promise<StudyFileSelection>
  /** 导入：选择 + 元数据校验，不读取内容 */
  importStudyFile(): Promise<ImportStudyFileResult>
  /** 读取资料内容（主进程校验路径与格式后读取） */
  readStudyFile(filePath: string): Promise<ReadStudyFileResult>
}
