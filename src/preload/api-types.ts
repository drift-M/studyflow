/** 渲染进程与主进程之间约定的 IPC 类型。此文件不包含运行时代码。 */

export interface StudyFileSelection {
  canceled: boolean
  filePath?: string
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
  selectStudyFile(): Promise<StudyFileSelection>
  readStudyFile(filePath: string): Promise<ReadStudyFileResult>
}
