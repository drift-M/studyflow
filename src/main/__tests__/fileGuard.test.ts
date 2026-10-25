import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadStudyFile, validateFileMeta, MAX_FILE_SIZE } from '../fileGuard'

/**
 * 主进程文件校验的真实文件系统测试：
 * 覆盖白名单、空文件、超限、PDF 文件头、UTF-8/BOM/二进制污染、缺失文件与目录路径。
 */

let tempDir: string

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'studyflow-guard-'))
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

async function makeFile(name: string, content: string | Buffer): Promise<string> {
  const path = join(tempDir, name)
  await writeFile(path, content)
  return path
}

describe('validateFileMeta 路径与元数据校验', () => {
  it('合法 markdown 通过', async () => {
    const path = await makeFile('ok.md', '# 标题\n\n内容足够长'.repeat(3))
    expect(await validateFileMeta(path)).toBeNull()
  })

  it('相对路径被拒绝', async () => {
    expect(await validateFileMeta('relative/file.md')).toContain('绝对路径')
  })

  it('不支持的扩展名被拒绝', async () => {
    const path = await makeFile('evil.exe', 'MZ...')
    expect(await validateFileMeta(path)).toContain('不支持的文件格式')
    const noExt = await makeFile('noext', 'text')
    expect(await validateFileMeta(noExt)).toContain('无扩展名')
  })

  it('空文件被拒绝', async () => {
    const path = await makeFile('empty.md', '')
    expect(await validateFileMeta(path)).toContain('文件为空')
  })

  it('目录路径被拒绝', async () => {
    const dirPath = join(tempDir, 'looks-like-doc.md')
    await mkdir(dirPath)
    expect(await validateFileMeta(dirPath)).toContain('不是普通文件')
  })

  it('不存在的文件给出中文提示（文件移动/删除场景）', async () => {
    expect(await validateFileMeta(join(tempDir, 'moved-away.md'))).toContain('文件不存在或无法访问')
  })

  it('超过大小上限被拒绝', async () => {
    const big = Buffer.alloc(MAX_FILE_SIZE + 1, 97)
    const path = await makeFile('big.md', big)
    expect(await validateFileMeta(path)).toContain('50MB')
  })
})

describe('loadStudyFile 内容校验与读取', () => {
  it('Markdown：正常读取 UTF-8 文本并去除 BOM', async () => {
    const path = await makeFile('bom.md', '\uFEFF# 带有 BOM 的标题\n\n正文内容')
    const result = await loadStudyFile(path)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.fileType).toBe('markdown')
      expect(result.data.content).not.toContain('\uFEFF')
      expect(result.data.content).toContain('正文内容')
    }
  })

  it('Markdown：含二进制字节（NUL）被拒绝', async () => {
    const path = await makeFile('binary.md', Buffer.concat([Buffer.from('text'), Buffer.from([0, 1, 2])]))
    const result = await loadStudyFile(path)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('二进制内容')
  })

  it('Markdown：GBK 编码被拒绝并提示转换', async () => {
    // "标题" 的 GBK 编码字节
    const gbkBytes = Buffer.from([0xb1, 0xea, 0xcc, 0xe2])
    const path = await makeFile('gbk.md', gbkBytes)
    const result = await loadStudyFile(path)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('UTF-8')
  })

  it('Markdown：纯空白内容被拒绝', async () => {
    const path = await makeFile('blank.md', '   \n\n  ')
    const result = await loadStudyFile(path)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('没有可阅读的文本内容')
  })

  it('PDF：合法文件头通过并返回二进制内容', async () => {
    const path = await makeFile('good.pdf', Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(40, 1)]))
    const result = await loadStudyFile(path)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.fileType).toBe('pdf')
      expect(result.data.content).toBeInstanceOf(Uint8Array)
    }
  })

  it('PDF：伪装成 .pdf 的文本文件被拒绝（缺少 %PDF 头）', async () => {
    const path = await makeFile('fake.pdf', 'just some plain text pretending to be pdf')
    const result = await loadStudyFile(path)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('%PDF')
  })
})
