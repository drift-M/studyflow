import { useEffect, useMemo, useRef, useState } from 'react'
import { renderMarkdown, type TocItem } from '../../lib/markdown'
import type { StudyDocument } from '../../db'

/** 加载 Markdown 内容：优先从原始文件读取，旧数据回退到内联内容 */
export async function loadDocumentText(doc: StudyDocument): Promise<string> {
  if (doc.sourcePath) {
    if (!window.api) {
      throw new Error('读取原始文件需要桌面应用环境（preload 未加载）')
    }
    const result = await window.api.readStudyFile(doc.sourcePath)
    if (!result.ok) {
      throw new Error(result.error)
    }
    if (result.data.fileType !== 'markdown') {
      throw new Error('文件类型与资料记录不一致')
    }
    return result.data.content as string
  }
  if (typeof doc.content === 'string' && doc.content.trim()) {
    return doc.content
  }
  throw new Error('该资料没有可阅读的文本内容')
}

export function MarkdownReader({
  content,
  onTocReady
}: {
  content: string
  onTocReady?: (toc: TocItem[]) => void
}): React.JSX.Element {
  const { html, toc } = useMemo(() => renderMarkdown(content), [content])
  const paneRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string>(toc[0]?.id ?? '')

  useEffect(() => {
    onTocReady?.(toc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toc])

  // 内容变化后回到顶部
  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 })
  }, [html])

  /** 外部链接交由系统浏览器打开；目录锚点平滑滚动 */
  const handleClick = (event: React.MouseEvent): void => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href') ?? ''
    event.preventDefault()
    if (href.startsWith('#')) {
      const target = paneRef.current?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (/^https?:/i.test(href)) {
      // 主进程 setWindowOpenHandler 会转交系统浏览器并拒绝应用内导航
      window.open(href)
    }
  }

  // 滚动时高亮当前章节
  const handleScroll = (): void => {
    const pane = paneRef.current
    if (!pane || toc.length === 0) return
    let current = toc[0].id
    for (const item of toc) {
      const el = pane.querySelector(`[id="${CSS.escape(item.id)}"]`)
      if (el && el.getBoundingClientRect().top <= 120) {
        current = item.id
      }
    }
    setActiveId(current)
  }

  const jumpTo = (id: string): void => {
    setActiveId(id)
    const target = paneRef.current?.querySelector(`[id="${CSS.escape(id)}"]`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="reader-layout">
      <aside className="reader-toc">
        <div className="toc-title">章节目录</div>
        {toc.length === 0 ? (
          <div className="toc-empty">本文档没有可识别的章节标题</div>
        ) : (
          toc.map((item) => (
            <button
              key={item.id}
              className={`toc-item toc-l${item.level}${activeId === item.id ? ' active' : ''}`}
              onClick={() => jumpTo(item.id)}
              title={item.text}
            >
              {item.text}
            </button>
          ))
        )}
      </aside>
      <section
        ref={paneRef}
        className="reader-pane markdown-body"
        onClick={handleClick}
        onScroll={handleScroll}
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    </div>
  )
}
