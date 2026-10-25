import { ipcMain, dialog, type BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'
import type {
  ImportStudyFileResult,
  ReadStudyFileResult,
  StudyFileData,
  StudyFileSelection
} from '../preload/api-types'

const CHANNEL_SELECT_FILE = 'studyflow:select-file'
const CHANNEL_IMPORT_FILE = 'studyflow:import-file'
const CHANNEL_READ_FILE = 'studyflow:read-file'
const CHANNEL_SAVE_BACKUP = 'studyflow:save-backup'
const CHANNEL_OPEN_BACKUP = 'studyflow:open-backup'

/** 允许导入的扩展名白名单 */
const ALLOWED_EXTENSIONS = ['.pdf', '.md', '.markdown']
/** 单文件大小上限：50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024

const DIALOG_OPTIONS: OpenDialogOptions = {
  title: '导入学习资料',
  properties: ['openFile'],
  filters: [{ name: '学习资料（PDF / Markdown）', extensions: ['pdf', 'md', 'markdown'] }]
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

function fileTypeOf(extension: string): 'pdf' | 'markdown' {
  return extension === '.pdf' ? 'pdf' : 'markdown'
}

async function showDialog(parent: BrowserWindow | null): Promise<StudyFileSelection> {
  const result = parent
    ? await dialog.showOpenDialog(parent, DIALOG_OPTIONS)
    : await dialog.showOpenDialog(DIALOG_OPTIONS)
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }
  return { canceled: false, filePath: result.filePaths[0] }
}

/** 校验路径参数与文件元数据（不读内容）。返回错误信息，null 表示通过 */
async function validateFileMeta(filePath: string): Promise<string | null> {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return '文件路径无效'
  }
  if (!isAbsolute(filePath)) {
    return '仅支持绝对路径的本地文件'
  }
  const extension = extname(filePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return `不支持的文件格式「${extension || '无扩展名'}」，仅支持 PDF 和 Markdown 文件`
  }
  const info = await stat(filePath).catch(() => null)
  if (!info) {
    return '文件不存在或无法访问（可能已被移动、重命名或删除）'
  }
  if (!info.isFile()) {
    return '所选路径不是普通文件'
  }
  if (info.size === 0) {
    return '文件为空，无法使用'
  }
  if (info.size > MAX_FILE_SIZE) {
    return '文件超过 50MB 限制，请先拆分后再使用'
  }
  return null
}

/** 读取并校验文件内容（PDF 文件头 / Markdown UTF-8 与二进制污染） */
async function loadStudyFile(filePath: string): Promise<ReadStudyFileResult> {
  const metaError = await validateFileMeta(filePath).catch((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  )
  if (metaError) return fail(metaError)

  const extension = extname(filePath).toLowerCase()
  try {
    const buffer = await readFile(filePath)
    const fileName = basename(filePath)
    const info = await stat(filePath)

    if (extension === '.pdf') {
      // 基础格式验证：PDF 文件头必须是 %PDF-
      const header = buffer.subarray(0, 5).toString('latin1')
      if (header !== '%PDF-') {
        return fail('这不是有效的 PDF 文件（缺少 %PDF 文件头）')
      }
      const data: StudyFileData = {
        fileName,
        fileType: 'pdf',
        fileSize: info.size,
        content: new Uint8Array(buffer)
      }
      return { ok: true, data }
    }

    // Markdown：必须是合法 UTF-8 文本，且不含二进制内容
    if (buffer.includes(0)) {
      return fail('文件包含二进制内容，不是有效的 Markdown 文本')
    }
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let text: string
    try {
      text = decoder.decode(buffer)
    } catch {
      return fail('文件不是有效的 UTF-8 编码文本（可能是 GBK 等编码），请先转换为 UTF-8 再导入')
    }
    text = text.replace(/^\uFEFF/, '') // 去除 BOM
    if (text.trim().length === 0) {
      return fail('文件没有可阅读的文本内容')
    }
    const data: StudyFileData = {
      fileName,
      fileType: 'markdown',
      fileSize: info.size,
      content: text
    }
    return { ok: true, data }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return fail(`读取文件失败：${detail}`)
  }
}

/**
 * 注册主进程 IPC 处理器。
 * 每个处理器都校验来自渲染进程的参数，只开放最小化的文件能力：
 * 选择框、元数据校验、按路径读取白名单格式的文件。
 */
export function registerIpcHandlers(getParentWindow: () => BrowserWindow | null): void {
  ipcMain.handle(CHANNEL_SELECT_FILE, async (): Promise<StudyFileSelection> => {
    return showDialog(getParentWindow())
  })

  ipcMain.handle(CHANNEL_IMPORT_FILE, async (): Promise<ImportStudyFileResult> => {
    const selection = await showDialog(getParentWindow())
    if (selection.canceled || !selection.filePath) {
      return { canceled: true }
    }
    const metaError = await validateFileMeta(selection.filePath)
    if (metaError) {
      return { canceled: true }
    }
    const extension = extname(selection.filePath).toLowerCase()
    const info = await stat(selection.filePath)
    return {
      canceled: false,
      filePath: selection.filePath,
      fileName: basename(selection.filePath),
      fileType: fileTypeOf(extension),
      fileSize: info.size
    }
  })

  ipcMain.handle(
    CHANNEL_READ_FILE,
    async (_event, filePath: unknown): Promise<ReadStudyFileResult> => {
      if (typeof filePath !== 'string' || filePath.length === 0) {
        return fail('文件路径无效')
      }
      return loadStudyFile(filePath)
    }
  )

  // ===== 备份文件读写（全程本地，不上传） =====

  ipcMain.handle(
    CHANNEL_SAVE_BACKUP,
    async (
      _event,
      payload: unknown
    ): Promise<{ saved: boolean; filePath?: string; error?: string }> => {
      if (typeof payload !== 'string' || payload.length === 0) {
        return { saved: false, error: '备份内容无效' }
      }
      // 备份 JSON 上限 200MB，防止异常调用写入超大文件
      if (payload.length > 200 * 1024 * 1024) {
        return { saved: false, error: '备份内容超出大小限制' }
      }
      const parent = getParentWindow()
      const today = new Date().toISOString().slice(0, 10)
      const options: SaveDialogOptions = {
        title: '导出学习数据备份',
        defaultPath: `studyflow-backup-${today}.json`,
        filters: [{ name: 'StudyFlow 备份（JSON）', extensions: ['json'] }]
      }
      const result = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) {
        return { saved: false }
      }
      try {
        await writeFile(result.filePath, payload, 'utf-8')
        return { saved: true, filePath: result.filePath }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return { saved: false, error: `写入备份文件失败：${detail}` }
      }
    }
  )

  ipcMain.handle(
    CHANNEL_OPEN_BACKUP,
    async (): Promise<{ canceled: boolean; content?: string; error?: string }> => {
      const parent = getParentWindow()
      const options: OpenDialogOptions = {
        title: '选择备份文件',
        properties: ['openFile'],
        filters: [{ name: 'StudyFlow 备份（JSON）', extensions: ['json'] }]
      }
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true }
      }
      const filePath = result.filePaths[0]
      try {
        const info = await stat(filePath)
        if (info.size > 200 * 1024 * 1024) {
          return { canceled: false, error: '备份文件超过 200MB，不是有效的备份' }
        }
        const content = await readFile(filePath, 'utf-8')
        return { canceled: false, content }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        return { canceled: false, error: `读取备份文件失败：${detail}` }
      }
    }
  )
}
