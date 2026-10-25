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
 * 原生文件选择（Electron 对话框）→ 主进程校验元数据 → 仅保存文件引用到 IndexedDB。
 * 文件内容不在导入时读取/存储，打开资料时按需从原始路径读取。
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
      const result = await window.api.importStudyFile()
      if (result.canceled) {
        return false
      }
      const document = await createDocument({
        title: stripExtension(result.fileName),
        fileName: result.fileName,
        fileType: result.fileType,
        fileSize: result.fileSize,
        sourcePath: result.filePath
      })
      push(`已导入「${document.title}」，点击打开即可阅读`, 'success')
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
