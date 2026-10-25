import { useState } from 'react'
import { Badge, Button, Modal, useToast } from './ui'
import { errorMessage } from '../hooks/useAsyncData'
import { exportAllData, restoreData, type RestoreStrategy } from '../db/backup'
import { buildBackupJson, parseBackupFile, type BackupSummary } from '../lib/backup'

export function BackupPanel(): React.JSX.Element {
  const { push } = useToast()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pending, setPending] = useState<{ summary: BackupSummary; content: string } | null>(null)
  const [strategy, setStrategy] = useState<RestoreStrategy>('merge')

  const handleExport = async (): Promise<void> => {
    if (!window.api) {
      push('备份功能需要在桌面应用中使用', 'error')
      return
    }
    setExporting(true)
    try {
      const data = await exportAllData()
      const json = buildBackupJson(data)
      const result = await window.api.saveBackupFile(json)
      if (result.saved && result.filePath) {
        push(`备份已保存到：${result.filePath}`, 'success')
      } else if (result.error) {
        push(result.error, 'error')
      }
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setExporting(false)
    }
  }

  const handlePickBackup = async (): Promise<void> => {
    if (!window.api) {
      push('备份功能需要在桌面应用中使用', 'error')
      return
    }
    try {
      const result = await window.api.openBackupFile()
      if (result.canceled) return
      if (result.error) {
        push(result.error, 'error')
        return
      }
      const { summary } = parseBackupFile(result.content!)
      setPending({ summary, content: result.content! })
    } catch (error) {
      push(errorMessage(error), 'error')
    }
  }

  const handleRestore = async (): Promise<void> => {
    if (!pending) return
    setImporting(true)
    try {
      const { backup } = parseBackupFile(pending.content)
      const result = await restoreData(backup.data, strategy)
      const parts: string[] = []
      for (const key of ['documents', 'cards', 'questions', 'wrongAnswers', 'sessions', 'attempts'] as const) {
        if (result.imported[key] > 0) parts.push(`${labelOf(key)} ${result.imported[key]}`)
      }
      const kept = Object.values(result.keptExisting).reduce((sum, n) => sum + n, 0)
      const skipped = Object.values(result.skipped).reduce((sum, n) => sum + n, 0)
      let message = parts.length > 0 ? `已导入：${parts.join('、')}` : '没有需要导入的新数据'
      if (kept > 0) message += `；保留现有记录 ${kept} 条`
      if (skipped > 0) message += `；跳过无效/重复记录 ${skipped} 条`
      push(message, 'success')
      setPending(null)
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setImporting(false)
    }
  }

  const s = pending?.summary

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">备份与恢复</div>
        <Badge variant="gray">全程本地执行，不上传任何数据</Badge>
      </div>
      <div className="panel-desc">
        导出完整学习数据（资料元数据、知识卡片与复习计划、练习题、答题记录、错题本、学习记录）为带版本号的 JSON 文件。
        <br />
        <b>注意：备份不包含外部 PDF / Markdown 原始文件本体</b>（只记录本机路径）。恢复到其他电脑后，请在资料详情页重新关联文件；旧版本内置内容会完整备份。
      </div>
      <div className="panel-body-actions">
        <Button variant="primary" icon="import" onClick={handleExport} disabled={exporting}>
          {exporting ? '导出中…' : '导出备份文件'}
        </Button>
        <Button icon="folder" onClick={handlePickBackup}>
          从备份恢复
        </Button>
      </div>

      <Modal
        open={!!pending}
        title="确认恢复备份"
        footer={
          <>
            <Button onClick={() => setPending(null)} disabled={importing}>
              取消
            </Button>
            <Button variant="primary" onClick={handleRestore} disabled={importing}>
              {importing ? '恢复中…' : '开始恢复'}
            </Button>
          </>
        }
      >
        {s ? (
          <>
            <p style={{ marginBottom: 10 }}>备份中包含以下数据（共 {s.documents + s.cards + s.questions + s.wrongAnswers + s.sessions + s.attempts} 条记录）：</p>
            <ul className="restore-counts">
              <li>学习资料：{s.documents} 份（其中 {s.inlineDocuments} 份为内置内容）</li>
              <li>知识卡片（含复习计划）：{s.cards} 张</li>
              <li>练习题：{s.questions} 道</li>
              <li>错题记录：{s.wrongAnswers} 条</li>
              <li>学习记录：{s.sessions} 条</li>
              <li>答题记录：{s.attempts} 条</li>
            </ul>
            <p style={{ margin: '10px 0 6px' }}>请选择恢复方式：</p>
            <div className="gen-count-row" style={{ marginBottom: 10 }}>
              <label className="gen-radio">
                <input
                  type="radio"
                  name="restore-strategy"
                  checked={strategy === 'merge'}
                  onChange={() => setStrategy('merge')}
                />
                合并（推荐）：只导入现有数据中没有的记录，不覆盖任何现有内容
              </label>
              <label className="gen-radio">
                <input
                  type="radio"
                  name="restore-strategy"
                  checked={strategy === 'replace'}
                  onChange={() => setStrategy('replace')}
                />
                替换：清空当前全部数据后写入备份内容
              </label>
            </div>
            {strategy === 'replace' ? (
              <div className="gen-notice">
                「替换」会永久删除当前全部学习数据（不可恢复）。建议先导出一份当前数据的备份。
              </div>
            ) : null}
            <div className="text-muted" style={{ fontSize: 12.5 }}>
              外部 PDF / Markdown 原始文件不在备份中；恢复后如原文件不在原路径，请在资料详情页重新关联。
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  )
}

function labelOf(key: string): string {
  const labels: Record<string, string> = {
    documents: '资料',
    cards: '卡片',
    questions: '题目',
    wrongAnswers: '错题',
    sessions: '学习记录',
    attempts: '答题记录'
  }
  return labels[key] ?? key
}
