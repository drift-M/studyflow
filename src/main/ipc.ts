import { ipcMain, dialog, type BrowserWindow } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'
import type { ReadStudyFileResult, StudyFileData, StudyFileSelection } from '../preload/api-types'

const CHANNEL_SELECT_FILE = 'studyflow:select-file'
const CHANNEL_READ_FILE = 'studyflow:read-file'

/** 允许导入的扩展名白名单 */
const ALLOWED_EXTENSIONS = ['.pdf', '.md', '.markdown']
/** 单文件大小上限：50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/**
 * 注册主进程 IPC 处理器。
 * 每个处理器都校验来自渲染进程的参数，只开放最小化的文件导入能力，
 * 渲染进程无法借此读取任意路径之外的系统能力。
 */
export function registerIpcHandlers(getParentWindow: () => BrowserWindow | null): void {
  ipcMain.handle(CHANNEL_SELECT_FILE, async (): Promise<StudyFileSelection> => {
    const parent = getParentWindow()
    const options: Electron.OpenDialogOptions = {
      title: '导入学习资料',
      properties: ['openFile'],
      filters: [
        { name: '学习资料（PDF / Markdown）', extensions: ['pdf', 'md', 'markdown'] }
      ]
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    return { canceled: false, filePath: result.filePaths[0] }
  })

  ipcMain.handle(
    CHANNEL_READ_FILE,
    async (_event, filePath: unknown): Promise<ReadStudyFileResult> => {
      // —— 参数校验：类型、绝对路径、扩展名白名单 ——
      if (typeof filePath !== 'string' || filePath.length === 0) {
        return fail('文件路径无效')
      }
      if (!isAbsolute(filePath)) {
        return fail('仅支持绝对路径的本地文件')
      }
      const extension = extname(filePath).toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        return fail(
          `不支持的文件格式「${extension || '无扩展名'}」，仅支持 PDF 和 Markdown 文件`
        )
      }

      try {
        const info = await stat(filePath)
        if (!info.isFile()) {
          return fail('所选路径不是普通文件')
        }
        if (info.size === 0) {
          return fail('文件为空，无法导入')
        }
        if (info.size > MAX_FILE_SIZE) {
          return fail('文件超过 50MB 限制，请先拆分后再导入')
        }

        const buffer = await readFile(filePath)
        const fileName = basename(filePath)

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

        // Markdown：按 UTF-8 文本读取，并做基础二进制污染检查
        if (buffer.includes(0)) {
          return fail('文件包含二进制内容，不是有效的 Markdown 文本')
        }
        const text = buffer.toString('utf-8')
        if (text.trim().length === 0) {
          return fail('文件没有可导入的文本内容')
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
  )
}
