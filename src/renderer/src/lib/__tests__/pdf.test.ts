import { beforeAll, describe, expect, it } from 'vitest'
import { loadPdfDocument, extractPageText, describePdfError } from '../pdf'
import { samplePdfBytes } from '../samplePdfBase64'

let doc: Awaited<ReturnType<typeof loadPdfDocument>> = null

beforeAll(async () => {
  doc = await loadPdfDocument(samplePdfBytes())
})

describe('PDF 解析与文本提取', () => {
  it('加载两页示例 PDF 并报告总页数', () => {
    expect(doc).not.toBeNull()
    expect(doc!.numPages).toBe(2)
  })

  it('提取第 1 页文本并保留页码信息', async () => {
    const result = await extractPageText(doc!, 1)
    expect(result.pageNumber).toBe(1)
    expect(result.empty).toBe(false)
    expect(result.text).toContain('StudyFlow PDF Reader Sample')
  })

  it('提取第 2 页文本', async () => {
    const result = await extractPageText(doc!, 2)
    expect(result.pageNumber).toBe(2)
    expect(result.text).toContain('Second Page')
  })

  it('损坏的 PDF 返回 null 而不是抛出异常', async () => {
    let message = ''
    const result = await loadPdfDocument(new Uint8Array([1, 2, 3, 4]), (m) => {
      message = m
    })
    expect(result).toBeNull()
    expect(message.length).toBeGreaterThan(0)
  })

  it('错误映射函数区分损坏与加密', () => {
    const invalidError = Object.assign(new Error('bad'), { name: 'InvalidPDFException' })
    expect(describePdfError(invalidError)).toContain('损坏')
    const passwordError = Object.assign(new Error('pwd'), { name: 'PasswordException' })
    expect(describePdfError(passwordError)).toContain('加密')
  })
})
