import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdfDocument, extractPageText } from '../../lib/pdf'
import type { StudyDocument } from '../../db'

type ZoomMode = 'fit' | number

interface TextStatus {
  pageNumber: number
  chars: number
  empty: boolean
}

/** 加载 PDF 二进制：优先从原始文件读取，旧数据回退到内联内容 */
async function loadPdfBytes(doc: StudyDocument): Promise<Uint8Array> {
  if (doc.sourcePath) {
    if (!window.api) {
      throw new Error('读取原始文件需要桌面应用环境（preload 未加载）')
    }
    const result = await window.api.readStudyFile(doc.sourcePath)
    if (!result.ok) {
      throw new Error(result.error)
    }
    if (result.data.fileType !== 'pdf') {
      throw new Error('文件类型与资料记录不一致')
    }
    return result.data.content as Uint8Array
  }
  if (doc.content instanceof Uint8Array) {
    return doc.content
  }
  throw new Error('该资料没有可阅读的内容')
}

export function PdfReader({
  doc,
  onPageCountReady
}: {
  doc: StudyDocument
  onPageCountReady?: (pageCount: number) => void
}): React.JSX.Element {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit')
  const [lastScale, setLastScale] = useState(1)
  const [textStatus, setTextStatus] = useState<TextStatus | null>(null)
  const [containerWidth, setContainerWidth] = useState(800)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null)
  const loadTokenRef = useRef(0)

  // 加载文档
  useEffect(() => {
    const token = ++loadTokenRef.current
    setPdfDoc(null)
    setError(null)
    setTextStatus(null)
    setPageNum(1)
    setNumPages(0)
    loadPdfBytes(doc)
      .then((bytes) => loadPdfDocument(bytes, (message) => setError(message)))
      .then((loaded) => {
        if (token !== loadTokenRef.current) return
        if (loaded) {
          setPdfDoc(loaded)
          setNumPages(loaded.numPages)
          onPageCountReady?.(loaded.numPages)
        } else if (!error) {
          setError((current) => current ?? 'PDF 解析失败')
        }
      })
      .catch((e: unknown) => {
        if (token === loadTokenRef.current) {
          setError(e instanceof Error ? e.message : String(e))
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.sourcePath])

  // 监听容器宽度（适应宽度模式需要）
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(width)
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  const renderPage = useCallback(
    async (docToRender: PDFDocumentProxy, targetPage: number, mode: ZoomMode, width: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const page = await docToRender.getPage(targetPage)
      const base = page.getViewport({ scale: 1 })
      const scale =
        mode === 'fit'
          ? Math.max(0.3, Math.min((width - 48) / base.width, 6))
          : Math.max(0.3, Math.min(mode, 6))
      setLastScale(scale)

      const dpr = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale })

      // pdf.js v6 不会自动调整画布尺寸，需要显式设置（含高分屏适配）
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`

      renderTaskRef.current?.cancel()
      const renderContext = page.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
      })
      renderTaskRef.current = renderContext
      try {
        await renderContext.promise
      } catch (e) {
        const name = (e as { name?: string })?.name ?? ''
        if (name === 'RenderingCancelledException' || name === 'AbortException') return
        throw e
      }

      // 渲染完成后提取当前页文本（保留页码）
      const text = await extractPageText(docToRender, targetPage)
      setTextStatus({ pageNumber: text.pageNumber, chars: text.text.length, empty: text.empty })
    },
    []
  )

  useEffect(() => {
    if (!pdfDoc) return
    let alive = true
    renderPage(pdfDoc, pageNum, zoomMode, containerWidth).catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : String(e))
    })
    return () => {
      alive = false
    }
  }, [pdfDoc, pageNum, zoomMode, containerWidth, renderPage])

  // 卸载时取消渲染任务并释放已加载的页面资源
  useEffect(() => {
    return () => {
      loadTokenRef.current++
      renderTaskRef.current?.cancel()
      pdfDoc?.cleanup().catch(() => {})
    }
  }, [pdfDoc])

  const zoomIn = (): void =>
    setZoomMode(Math.min((zoomMode === 'fit' ? lastScale : zoomMode) * 1.2, 6))
  const zoomOut = (): void =>
    setZoomMode(Math.max((zoomMode === 'fit' ? lastScale : zoomMode) / 1.2, 0.3))

  const handleJump = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const input = new FormData(event.currentTarget).get('page')
    const target = Number(input)
    if (Number.isInteger(target) && target >= 1 && target <= numPages) {
      setPageNum(target)
    }
  }

  if (error) {
    return (
      <div className="panel reader-error-panel">
        <div className="error-block">{error}</div>
        <div className="text-muted" style={{ padding: '0 0 12px 14px', fontSize: 12.5 }}>
          {doc.sourcePath
            ? '文件移动或删除后，可以用「重新选择文件位置」重新关联；原文件不会被知页删除。'
            : '该资料为内置内容，无法通过重新关联修复。'}
        </div>
      </div>
    )
  }

  if (!pdfDoc) {
    return <div className="loading-block">正在加载 PDF…</div>
  }

  return (
    <div className="reader-layout">
      <aside className="reader-toc">
        <div className="toc-title">页面目录（共 {numPages} 页）</div>
        <div className="page-list">
          {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
            <button
              key={page}
              className={`toc-item${pageNum === page ? ' active' : ''}`}
              onClick={() => setPageNum(page)}
            >
              第 {page} 页
            </button>
          ))}
        </div>
      </aside>
      <section className="reader-pane pdf-pane">
        <div className="pdf-toolbar">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPageNum((page) => Math.max(1, page - 1))}
            disabled={pageNum <= 1}
          >
            上一页
          </button>
          <span className="pdf-page-label">
            第 <strong>{pageNum}</strong> / {numPages} 页
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPageNum((page) => Math.min(numPages, page + 1))}
            disabled={pageNum >= numPages}
          >
            下一页
          </button>
          <form className="pdf-jump" onSubmit={handleJump}>
            <input
              className="form-input"
              name="page"
              type="number"
              min={1}
              max={numPages}
              placeholder="页码"
              defaultValue=""
            />
            <button className="btn btn-secondary btn-sm" type="submit">
              跳转
            </button>
          </form>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={zoomOut}>
            缩小
          </button>
          <span className="pdf-zoom-label">
            {zoomMode === 'fit' ? '适应宽度' : `${Math.round(lastScale * 100)}%`}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={zoomIn}>
            放大
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setZoomMode('fit')}
            disabled={zoomMode === 'fit'}
          >
            适应宽度
          </button>
        </div>
        <div className="pdf-canvas-wrap" ref={wrapRef}>
          <canvas ref={canvasRef} className="pdf-canvas" />
        </div>
        <div className="text-status">
          {textStatus === null
            ? '正在提取本页文本…'
            : textStatus.empty
              ? `第 ${textStatus.pageNumber} 页没有可提取的文本——这一页可能是扫描件或图片页。知页暂不支持 OCR，将在后续版本处理。`
              : `已提取第 ${textStatus.pageNumber} 页文本（${textStatus.chars} 字符），可供后续 AI 功能使用`}
        </div>
      </section>
    </div>
  )
}
