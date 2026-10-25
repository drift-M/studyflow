/**
 * AI 服务配置存储（主进程专用）。
 *
 * - 普通配置（模式/地址/模型名）保存在 userData/ai-config.json —— 不含密钥
 * - API Key 通过 Electron safeStorage 加密后保存在 userData/ai-key.bin
 *   （safeStorage 不可用时拒绝落盘，密钥仅保存在内存，重启后需重新输入，并明确告知用户）
 */

import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFile, writeFile, rm } from 'node:fs/promises'

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
  /** 是否已保存 API Key（safeStorage 不可用时表示仅内存中持有） */
  hasApiKey: boolean
  /** 密钥是否安全持久化；false 表示只在本次运行中有效 */
  apiKeyPersisted: boolean
  /** safeStorage 在本机不可用（密钥无法加密落盘） */
  safeStorageAvailable: boolean
}

const DEFAULT_CONFIG: AiProviderConfig = {
  mode: 'demo',
  localBaseUrl: 'http://localhost:11434/v1',
  localModel: '',
  apiBaseUrl: '',
  apiModel: ''
}

/** 内存态密钥（safeStorage 不可用时的会话级存放位置） */
let sessionApiKey: string | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'ai-config.json')
}

function keyPath(): string {
  return join(app.getPath('userData'), 'ai-key.bin')
}

export function isSafeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export async function loadConfigInfo(): Promise<AiConfigInfo> {
  let config = { ...DEFAULT_CONFIG }
  try {
    const raw = await readFile(configPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AiProviderConfig>
    config = {
      mode: parsed.mode === 'local' || parsed.mode === 'api' ? parsed.mode : 'demo',
      localBaseUrl: typeof parsed.localBaseUrl === 'string' ? parsed.localBaseUrl : DEFAULT_CONFIG.localBaseUrl,
      localModel: typeof parsed.localModel === 'string' ? parsed.localModel : '',
      apiBaseUrl: typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : '',
      apiModel: typeof parsed.apiModel === 'string' ? parsed.apiModel : ''
    }
  } catch {
    // 配置文件不存在或损坏：使用默认值
  }

  const safe = isSafeStorageAvailable()
  let persisted = false
  if (safe) {
    try {
      const bytes = await readFile(keyPath())
      if (bytes.length > 0 && safeStorage.decryptString(bytes)) persisted = true
    } catch {
      persisted = false
    }
  }
  return {
    config,
    hasApiKey: persisted || sessionApiKey !== null,
    apiKeyPersisted: persisted,
    safeStorageAvailable: safe
  }
}

/**
 * 保存配置（不含密钥）。传 apiKey 时保存密钥：
 * safeStorage 可用 → 加密写入 ai-key.bin；不可用 → 仅存内存并返回 persisted=false。
 * 传 null → 清除已保存的密钥。
 */
export async function saveConfig(
  config: AiProviderConfig,
  apiKey?: string | null
): Promise<AiConfigInfo> {
  const normalized: AiProviderConfig = {
    mode: config.mode,
    localBaseUrl: config.localBaseUrl.trim(),
    localModel: config.localModel.trim(),
    apiBaseUrl: config.apiBaseUrl.trim(),
    apiModel: config.apiModel.trim()
  }
  await writeFile(configPath(), JSON.stringify(normalized, null, 2), 'utf-8')

  if (apiKey === null) {
    sessionApiKey = null
    await rm(keyPath(), { force: true })
  } else if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
    const trimmed = apiKey.trim()
    if (isSafeStorageAvailable()) {
      await writeFile(keyPath(), safeStorage.encryptString(trimmed))
      sessionApiKey = null
    } else {
      sessionApiKey = trimmed
    }
  }
  return loadConfigInfo()
}

/** 取出密钥用于本次请求（仅主进程内部使用，绝不返回渲染进程） */
async function readApiKey(): Promise<string | undefined> {
  if (isSafeStorageAvailable()) {
    try {
      const bytes = await readFile(keyPath())
      if (bytes.length > 0) return safeStorage.decryptString(bytes)
    } catch {
      return undefined
    }
    return undefined
  }
  return sessionApiKey ?? undefined
}

/** 当前生效的服务商参数（mode 为 demo 时返回 null） */
export async function getActiveProvider(): Promise<
  | { kind: 'local' | 'api'; baseUrl: string; model: string; apiKey?: string }
  | null
> {
  const { config } = await loadConfigInfo()
  if (config.mode === 'demo') return null
  if (config.mode === 'local') {
    return { kind: 'local', baseUrl: config.localBaseUrl, model: config.localModel }
  }
  return {
    kind: 'api',
    baseUrl: config.apiBaseUrl,
    model: config.apiModel,
    apiKey: await readApiKey()
  }
}
