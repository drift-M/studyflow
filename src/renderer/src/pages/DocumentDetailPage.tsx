import { useEffect, useState } from 'react'
import { Button, EmptyState, useToast } from '../components/ui'
import { MarkdownReader, loadDocumentText } from '../components/readers/MarkdownReader'
import { PdfReader } from '../components/readers/PdfReader'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import { getDocument, updateDocument, type StudyDocument } from '../db'
import { formatFileSize } from '../format'
import type { TocItem } from '../lib/markdown'

export function DocumentDetailPage({
  docId,
  onBack,
  onNavigate
}: {
  docId: string
  onBack: () => void
  onNavigate: (page: 'cards' | 'quiz') => void
}): React.JSX.Element {
  const { push } = useToast()
  const docData = useAsyncData(() => getDocument(docId), [docId])
  const doc: StudyDocument | null = docData.data ?? null

  const [mdContent, setMdContent] = useState<string | null>(null)
  const [mdToc, setMdToc] = useState<TocItem[] | null>(null)
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [readerKey, setReaderKey] = useState(0)
  const [relinking, setRelinking] = useState(false)

  // Markdown 内容加载（PDF 由 PdfReader 自行加载）
  useEffect(() => {
    if (!doc || doc.fileType !== 'markdown') return
    let alive = true
    setMdContent(null)
    setMdToc(null)
    setLoadError(null)
    loadDocumentText(doc)
      .then((text) => {
        if (alive) setMdContent(text)
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(errorMessage(error))
      })
    return () => {
      alive = false
    }
  }, [doc?.id, doc?.sourcePath, readerKey])

  const handleRelink = async (): Promise<void> => {
    if (!doc || !window.api) return
    setRelinking(true)
    try {
      const selection = await window.api.selectStudyFile()
      if (selection.canceled || !selection.filePath) return
      const result = await window.api.readStudyFile(selection.filePath)
      if (!result.ok) {
        push(result.error, 'error')
        return
      }
      if (result.data.fileType !== doc.fileType) {
        push(`需要重新关联 ${doc.fileType === 'pdf' ? 'PDF' : 'Markdown'} 文件`, 'error')
        return
      }
      await updateDocument(doc.id, {
        sourcePath: selection.filePath,
        fileName: result.data.fileName,
        fileSize: result.data.fileSize
      })
      push('已重新关联文件', 'success')
      docData.reload()
      setReaderKey((key) => key + 1)
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setRelinking(false)
    }
  }

  const comingSoon = (): void => {
    push('该功能将在下一阶段（AI 智能生成）开放', 'info')
  }

  if (docData.loading) {
    return (
      <div className="page">
        <div className="loading-block">加载中…</div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="page">
        <div className="page-header">
          <Button variant="ghost" onClick={onBack}>
            ← 返回资料列表
          </Button>
        </div>
        <div className="panel">
          <EmptyState
            title="资料不存在"
            desc="这条资料可能已被删除。"
            actions={<Button onClick={onBack}>返回列表</Button>}
          />
        </div>
      </div>
    )
  }

  const fileMissing = loadError !== null && !!doc.sourcePath
  const metaParts = [
    doc.fileName,
    formatFileSize(doc.fileSize),
    doc.fileType === 'pdf'
      ? pageCount
        ? `${pageCount} 页`
        : '读取页数中…'
      : mdToc
        ? `${mdToc.length} 个章节`
        : '统计章节中…'
  ]
  if (!doc.sourcePath) {
    metaParts.push('内置内容')
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
          <Button variant="ghost" onClick={onBack}>
            ← 返回
          </Button>
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title">{doc.title}</h1>
            <p className="page-subtitle">{metaParts.join(' · ')}</p>
          </div>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="cards" onClick={comingSoon}>
            生成知识卡片
          </Button>
          <Button variant="primary" icon="quiz" onClick={comingSoon}>
            生成练习题
          </Button>
        </div>
      </div>

      {loadError ? (
        <div className="panel reader-error-panel">
          <div className="error-block">{loadError}</div>
          {fileMissing ? (
            <>
              <div className="text-muted" style={{ padding: '0 0 12px 14px', fontSize: 12.5 }}>
                原始文件可能已被移动、重命名或删除。知页不会删除你电脑上的原文件，可以重新关联到新位置。
              </div>
              <div style={{ padding: '0 14px 14px' }}>
                <Button variant="primary" onClick={handleRelink} disabled={relinking}>
                  {relinking ? '处理中…' : '重新选择文件位置'}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : doc.fileType === 'pdf' ? (
        <PdfReader key={readerKey} doc={doc} onPageCountReady={setPageCount} />
      ) : mdContent !== null ? (
        <MarkdownReader key={readerKey} content={mdContent} onTocReady={setMdToc} />
      ) : (
        <div className="loading-block">正在加载内容…</div>
      )}

      {doc.fileType === 'markdown' && mdToc && mdToc.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <Button onClick={() => onNavigate('cards')}>查看知识卡片</Button>
        </div>
      ) : null}
    </div>
  )
}
