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

// ===== AI 模型服务（密钥只在主进程，渲染进程永远拿不到明文） =====

export type AiProviderMode = 'demo' | 'local' | 'api'

export interface AiProviderConfig {
  mode: AiProviderMode
  localBaseUrl: string
  localModel: string
  apiBaseUrl: string
  apiModel: string
}

export interface AiConfigInfo {
  config: AiProviderConfig
  hasApiKey: boolean
  apiKeyPersisted: boolean
  safeStorageAvailable: boolean
}

export interface AiGenerateCall {
  callId: string
  prompt: string
  systemPrompt?: string
  maxTokens?: number
}

export type AiGenerateResult =
  | { ok: true; content: string }
  | { ok: false; error: string; retryable?: boolean; kind?: string }

/** 通过 contextBridge 暴露给渲染进程的最小化 API */
export interface StudyFlowApi {
  /** 打开原生文件选择框（仅选择，供重新关联文件使用） */
  selectStudyFile(): Promise<StudyFileSelection>
  /** 导入：选择 + 元数据校验，不读取内容 */
  importStudyFile(): Promise<ImportStudyFileResult>
  /** 读取资料内容（主进程校验路径与格式后读取） */
  readStudyFile(filePath: string): Promise<ReadStudyFileResult>
  /** 保存备份 JSON 到用户选择的位置（本地写文件，不上传） */
  saveBackupFile(json: string): Promise<{ saved: boolean; filePath?: string; error?: string }>
  /** 打开备份文件并返回其文本内容（本地读取） */
  openBackupFile(): Promise<{ canceled: boolean; content?: string; error?: string }>
  /** 读取 AI 服务配置（不含密钥明文，只有状态标志） */
  aiGetConfig(): Promise<AiConfigInfo>
  /** 保存 AI 服务配置；apiKey 传字符串保存、null 清除、undefined 不变 */
  aiSaveConfig(config: AiProviderConfig, apiKey?: string | null): Promise<AiConfigInfo>
  /** 仅清除已保存的 API Key */
  aiClearKey(): Promise<AiConfigInfo>
  /** 由用户主动触发的连接测试（主进程发起请求） */
  aiTestConnection(): Promise<{ ok: boolean; message: string }>
  /** 模型生成（主进程执行请求；渲染进程不接触密钥） */
  aiGenerate(request: AiGenerateCall): Promise<AiGenerateResult>
  /** 取消进行中的生成请求 */
  aiCancelGenerate(callId: string): Promise<boolean>
}
