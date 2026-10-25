import { describe, it, expect } from 'vitest'
import { buildToc } from '../markdown'

describe('Markdown 章节目录', () => {
  it('提取 1-3 级标题并生成目录', () => {
    const md = `# 第一章\n\n正文\n\n## 1.1 小节\n\n内容\n\n### 1.1.1 细节\n\n#### 四级标题不应出现\n\n## 1.2 另一小节\n`
    const toc = buildToc(md)
    expect(toc.map((item) => item.text)).toEqual(['第一章', '1.1 小节', '1.1.1 细节', '1.2 另一小节'])
    expect(toc.map((item) => item.level)).toEqual([1, 2, 3, 2])
  })

  it('代码块内的 # 不会被识别为标题', () => {
    const md = '# 真标题\n\n```md\n# 代码块里不是标题\n```\n'
    const toc = buildToc(md)
    expect(toc).toHaveLength(1)
    expect(toc[0].text).toBe('真标题')
  })

  it('重复标题生成唯一锚点 id', () => {
    const md = '## 重复\n\n内容\n\n## 重复\n\n## 重复\n'
    const toc = buildToc(md)
    const ids = toc.map((item) => item.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids[0]).toBe('重复')
    expect(ids[1]).toBe('重复-1')
    expect(ids[2]).toBe('重复-2')
  })

  it('纯符号标题回退为 section 锚点', () => {
    const toc = buildToc('## !!!\n')
    expect(toc[0].id).toBe('section')
  })
})
