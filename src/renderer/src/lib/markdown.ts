import { Marked } from 'marked'
import DOMPurify from 'dompurify'

export interface TocItem {
  /** 与正文标题元素对应的锚点 id */
  id: string
  /** 标题纯文本 */
  text: string
  /** 标题级别 1-3 */
  level: number
}

/** 生成目录锚点 id：保留中英文与数字，重复标题追加序号保证唯一 */
function slugify(text: string, used: Map<string, number>): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-') || 'section'
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

/**
 * 从 Markdown 提取 1-3 级标题生成章节目录。
 * 代码块里的 # 不会被误识别（由 marked 词法分析保证）。
 */
export function buildToc(markdown: string): TocItem[] {
  const used = new Map<string, number>()
  const toc: TocItem[] = []
  for (const token of new Marked().lexer(markdown)) {
    if (token.type === 'heading' && token.depth >= 1 && token.depth <= 3) {
      toc.push({ id: slugify(token.text, used), text: token.text, level: token.depth })
    }
  }
  return toc
}

/**
 * 渲染 Markdown 为安全的 HTML：
 * - marked 解析（GFM 表格、代码块等）
 * - 标题注入与目录一致的锚点 id
 * - DOMPurify 净化，移除脚本与事件属性
 */
export function renderMarkdown(markdown: string): { html: string; toc: TocItem[] } {
  const used = new Map<string, number>()
  const instance = new Marked({ gfm: true })
  instance.use({
    renderer: {
      heading(token) {
        const id = slugify(token.text, used)
        const inner = this.parser.parseInline(token.tokens)
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`
      }
    }
  })
  const rawHtml = instance.parse(markdown, { async: false })
  const html = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['id'] })
  return { html, toc: buildToc(markdown) }
}
