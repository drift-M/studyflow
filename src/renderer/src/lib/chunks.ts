import { Marked } from 'marked'

/** 可生成内容的来源片段：label 用于展示与来源追溯（章节标题 / 页码） */
export interface ContentChunk {
  label: string
  text: string
}

/** 参与一次生成的总字符上限，避免超长文档无限制处理 */
export const MAX_GENERATION_CHARS = 100_000
/** 生成内容的最小文本量：低于此值视为内容不足 */
export const MIN_GENERATION_CHARS = 40

/**
 * 将 Markdown 按 1-2 级标题切分为章节片段。
 * 没有任何标题时返回单个「全文」片段。
 */
export function buildMarkdownChunks(markdown: string): ContentChunk[] {
  const tokens = new Marked().lexer(markdown)
  const chunks: ContentChunk[] = []
  let current: ContentChunk | null = null

  const pushCurrent = (): void => {
    if (current && current.text.trim().length > 0) {
      chunks.push(current)
    }
  }

  for (const token of tokens) {
    if (token.type === 'heading' && token.depth <= 2) {
      pushCurrent()
      current = { label: token.text.trim() || '未命名章节', text: `${token.text}\n` }
      continue
    }
    const text = 'text' in token && typeof token.text === 'string' ? token.text : token.raw
    if (!current) {
      current = { label: '全文', text: '' }
    }
    current.text += `${text}\n`
  }
  pushCurrent()

  if (chunks.length === 0) {
    const fallback = markdown.trim()
    if (fallback) chunks.push({ label: '全文', text: fallback })
  }
  return chunks
}

/** 将 PDF 各页文本转为片段，label 为「第 N 页」；空页跳过 */
export function buildPdfChunks(pages: Array<{ pageNumber: number; text: string }>): ContentChunk[] {
  return pages
    .filter((page) => page.text.trim().length > 0)
    .map((page) => ({ label: `第 ${page.pageNumber} 页`, text: page.text }))
}

/**
 * 校验片段是否足够生成内容。
 * 返回错误信息（中文），null 表示通过。
 */
export function validateChunksForGeneration(
  chunks: ContentChunk[],
  scopeLabel: string
): string | null {
  const usable = chunks.filter((chunk) => chunk.text.trim().length > 0)
  if (usable.length === 0) {
    return '这份资料没有可提取的文本内容（可能是扫描件 PDF），无法生成'
  }
  const total = usable.reduce((sum, chunk) => sum + chunk.text.length, 0)
  if (total < MIN_GENERATION_CHARS) {
    return `资料文本过短（仅 ${total} 字），至少需要约 ${MIN_GENERATION_CHARS} 字才能生成，请导入内容更充实的资料`
  }
  const scope = usable.find((chunk) => chunk.label === scopeLabel)
  if (scopeLabel !== '全部可提取文本' && !scope) {
    return '所选章节不存在，请重新选择'
  }
  const scopeText =
    scopeLabel === '全部可提取文本'
      ? total
      : (scope?.text.length ?? 0)
  if (scopeText < MIN_GENERATION_CHARS) {
    return `所选范围文本过短（仅 ${scopeText} 字），请选择更大的范围（如全部文本）`
  }
  return null
}

/** 汇总本次生成实际使用的文本（含截断上限） */
export function collectScopeText(chunks: ContentChunk[], scopeLabel: string): string {
  const usable = chunks.filter((chunk) => chunk.text.trim().length > 0)
  if (scopeLabel === '全部可提取文本') {
    return usable
      .map((chunk) => `【${chunk.label}】\n${chunk.text}`)
      .join('\n')
      .slice(0, MAX_GENERATION_CHARS)
  }
  const scope = usable.find((chunk) => chunk.label === scopeLabel)
  return scope ? scope.text.slice(0, MAX_GENERATION_CHARS) : ''
}
