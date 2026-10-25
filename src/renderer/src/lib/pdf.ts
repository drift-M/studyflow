import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// 浏览器环境启用 worker（Node 测试环境由 pdfjs 自动回退到主线程解析）
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
}

/** 将 PDF.js 的加载错误映射为用户能看懂的中文提示 */
export function describePdfError(error: unknown): string {
  const name = (error as { name?: string })?.name ?? ''
  if (name === 'PasswordException') {
    return '该 PDF 已加密，知页暂时无法打开加密文档'
  }
  if (name === 'InvalidPDFException') {
    return 'PDF 文件已损坏或格式无效，无法解析'
  }
  if (name === 'MissingPDFException') {
    return '找不到 PDF 文件'
  }
  const detail = error instanceof Error ? error.message : String(error)
  return `PDF 解析失败：${detail}`
}

/** 打开 PDF 文档 */
export async function loadPdfDocument(
  bytes: Uint8Array,
  onError?: (message: string) => void
): Promise<PDFDocumentProxy | null> {
  try {
    // 浏览器通过自定义协议读取本地字体/cmaps；Node 测试环境直接用相对路径
    const isNode = typeof window === 'undefined'
    const task = pdfjsLib.getDocument({
      // pdf.js 会转移（detach）传入的缓冲区；传拷贝避免同一份内联数据二次加载时报错
      data: new Uint8Array(bytes),
      cMapUrl: isNode ? 'node_modules/pdfjs-dist/cmaps/' : 'pdfassets://cmaps/',
      cMapPacked: true,
      standardFontDataUrl: isNode
        ? 'node_modules/pdfjs-dist/standard_fonts/'
        : 'pdfassets://standard_fonts/'
    })
    return await task.promise
  } catch (error) {
    onError?.(describePdfError(error))
    return null
  }
}

export interface PageTextResult {
  pageNumber: number
  text: string
  /** 无法提取文本时为 true（通常是扫描件 / 图片页） */
  empty: boolean
}

/** 提取指定页的文本并保留页码信息 */
export async function extractPageText(
  doc: PDFDocumentProxy,
  pageNumber: number
): Promise<PageTextResult> {
  const page = await doc.getPage(pageNumber)
  const content = await page.getTextContent()
  const text = content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { pageNumber, text, empty: text.length === 0 }
}
