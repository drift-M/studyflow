import { useState } from 'react'
import { Badge, Button, ConfirmModal, EmptyState, Modal, useToast } from '../components/ui'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import { useImportDocument } from '../hooks/useImport'
import { listDocuments, deleteDocument, type StudyDocument } from '../db'
import { formatFileSize, formatRelative } from '../format'

function DocumentTypeBadge({ fileType }: { fileType: StudyDocument['fileType'] }): React.JSX.Element {
  return fileType === 'pdf' ? <Badge variant="pdf">PDF</Badge> : <Badge variant="md">Markdown</Badge>
}

export function DocumentsPage(): React.JSX.Element {
  const documents = useAsyncData(listDocuments, [])
  const { importDocument, importing } = useImportDocument()
  const { push } = useToast()
  const [confirmTarget, setConfirmTarget] = useState<StudyDocument | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<StudyDocument | null>(null)

  const handleImport = async (): Promise<void> => {
    if (await importDocument()) {
      documents.reload()
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!confirmTarget) return
    setDeleting(true)
    try {
      const deleted = await deleteDocument(confirmTarget.id)
      push(deleted ? `已删除「${confirmTarget.title}」` : '该资料已不存在', 'success')
      documents.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setDeleting(false)
      setConfirmTarget(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">我的资料</h1>
          <p className="page-subtitle">
            {documents.data
              ? `共 ${documents.data.length} 份资料 · 支持导入 PDF 与 Markdown`
              : '支持导入 PDF 与 Markdown 文件'}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="import" onClick={handleImport} disabled={importing}>
            {importing ? '导入中…' : '导入资料'}
          </Button>
        </div>
      </div>

      {documents.error ? <div className="error-block">{documents.error}</div> : null}

      <div className="panel doc-table">
        {documents.loading ? (
          <div className="loading-block">加载中…</div>
        ) : documents.data && documents.data.length > 0 ? (
          <>
            <div className="list-header doc-grid">
              <span>文件</span>
              <span>类型</span>
              <span>大小</span>
              <span>导入时间</span>
              <span>状态</span>
              <span style={{ textAlign: 'right' }}>操作</span>
            </div>
            {documents.data.map((doc) => (
              <div className="list-row doc-grid" key={doc.id}>
                <div style={{ minWidth: 0 }}>
                  <div className="doc-name">{doc.title}</div>
                  <div className="doc-file">{doc.fileName}</div>
                </div>
                <DocumentTypeBadge fileType={doc.fileType} />
                <span className="cell-muted">{formatFileSize(doc.fileSize)}</span>
                <span className="cell-muted">{formatRelative(doc.importedAt)}</span>
                <Badge variant="ok">已导入</Badge>
                <div className="doc-actions">
                  {doc.fileType === 'markdown' ? (
                    <Button small icon="eye" onClick={() => setPreviewTarget(doc)}>
                      预览
                    </Button>
                  ) : null}
                  <Button small variant="danger" icon="trash" onClick={() => setConfirmTarget(doc)}>
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <EmptyState
            icon="import"
            title="还没有学习资料"
            desc="点击右上角「导入资料」，选择 PDF 或 Markdown 文件。文件内容会保存在本机的 IndexedDB 中，不会上传到任何服务器。"
          />
        )}
      </div>

      <ConfirmModal
        open={!!confirmTarget}
        title="删除学习资料"
        desc={
          <>
            确定删除「{confirmTarget?.title}」吗？
            <br />
            关联的知识卡片、练习题与错题记录也会一并删除，操作不可恢复。
          </>
        }
        confirmText="删除"
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmTarget(null)}
      />

      <Modal
        open={!!previewTarget}
        title={previewTarget?.fileName ?? ''}
        footer={<Button onClick={() => setPreviewTarget(null)}>关闭</Button>}
      >
        <div className="preview-content">
          {typeof previewTarget?.content === 'string' ? previewTarget.content : ''}
        </div>
      </Modal>
    </div>
  )
}
