import { useCallback, useState } from 'react'
import { createDocument } from '../db'
import { useToast } from '../components/ui'
import { errorMessage } from './useAsyncData'

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

/**
 * 导入学习资料的完整流程：
 * 原生文件选择（Electron 对话框）→ 主进程校验并读取 → 写入 IndexedDB。
 * 返回是否导入成功，便于调用方刷新列表。
 */
export function useImportDocument(): {
  importDocument: () => Promise<boolean>
  importing: boolean
} {
  const { push } = useToast()
  const [importing, setImporting] = useState(false)

  const importDocument = useCallback(async (): Promise<boolean> => {
    if (!window.api) {
      push('文件选择功能需要在桌面应用中使用', 'error')
      return false
    }
    setImporting(true)
    try {
      const selection = await window.api.selectStudyFile()
      if (selection.canceled || !selection.filePath) {
        return false
      }
      const result = await window.api.readStudyFile(selection.filePath)
      if (!result.ok) {
        push(result.error, 'error')
        return false
      }
      const file = result.data
      const document = await createDocument({
        title: stripExtension(file.fileName),
        fileName: file.fileName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        content: file.content
      })
      push(`已导入「${document.title}」`, 'success')
      return true
    } catch (error) {
      push(errorMessage(error), 'error')
      return false
    } finally {
      setImporting(false)
    }
  }, [push])

  return { importDocument, importing }
}
