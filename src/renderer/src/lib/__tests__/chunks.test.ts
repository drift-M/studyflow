import { describe, it, expect } from 'vitest'
import { buildMarkdownChunks, buildPdfChunks, validateChunksForGeneration, collectScopeText } from '../chunks'

describe('Markdown 分块', () => {
  it('按 1-2 级标题切分章节，标题进入片段文本', () => {
    const md = `# 第一章\n\n这是第一章的内容，讲述了机器学习的基本概念和背景知识。\n\n## 1.1 基础\n\n监督学习是使用有标注数据训练模型的方式。\n\n### 1.1.1 三级标题不算分界\n\n三级标题内容归属上一章节。\n\n# 第二章\n\n第二章的内容。`
    const chunks = buildMarkdownChunks(md)
    const labels = chunks.map((chunk) => chunk.label)
    expect(labels).toEqual(['第一章', '1.1 基础', '第二章'])
    expect(chunks[0].text).toContain('第一章的内容')
    expect(chunks[1].text).toContain('监督学习')
    expect(chunks[1].text).toContain('三级标题内容归属上一章节')
  })

  it('没有标题时回退为单个「全文」片段', () => {
    const chunks = buildMarkdownChunks('这是一段没有标题的普通文本，内容足够长可以用于生成。'.repeat(2))
    expect(chunks).toHaveLength(1)
    expect(chunks[0].label).toBe('全文')
  })
})

describe('PDF 分块', () => {
  it('每页一个片段，label 保留页码', () => {
    const chunks = buildPdfChunks([
      { pageNumber: 1, text: '第一页的文本内容' },
      { pageNumber: 2, text: '' },
      { pageNumber: 3, text: '第三页的文本内容' }
    ])
    expect(chunks.map((chunk) => chunk.label)).toEqual(['第 1 页', '第 3 页'])
  })
})

describe('生成范围校验', () => {
  const longText = '这是一个足够长的句子，用来满足最低字数要求。'.repeat(10)

  it('片段为空时提示扫描件', () => {
    const error = validateChunksForGeneration([{ label: '第 1 页', text: '' }], '全部可提取文本')
    expect(error).toContain('没有可提取的文本')
  })

  it('总文本过短时给出明确提示', () => {
    const error = validateChunksForGeneration([{ label: '全文', text: '太短了' }], '全部可提取文本')
    expect(error).toContain('过短')
  })

  it('所选章节过短时提示扩大范围', () => {
    const error = validateChunksForGeneration(
      [{ label: '第一章', text: longText }, { label: '第二章', text: '短' }],
      '第二章'
    )
    expect(error).toContain('请选择更大的范围')
  })

  it('正常内容返回 null', () => {
    expect(validateChunksForGeneration([{ label: '全文', text: longText }], '全部可提取文本')).toBeNull()
  })

  it('collectScopeText 按范围收集并带上限', () => {
    const text = collectScopeText([{ label: '第一章', text: '甲'.repeat(100) }], '第一章')
    expect(text).toHaveLength(100)
    const joined = collectScopeText(
      [{ label: 'A', text: '甲'.repeat(100) }, { label: 'B', text: '乙'.repeat(100) }],
      '全部可提取文本'
    )
    expect(joined).toContain('【A】')
    expect(joined).toContain('【B】')
  })
})
