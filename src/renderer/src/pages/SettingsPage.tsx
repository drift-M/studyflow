import { useState } from 'react'
import { Button, ConfirmModal, useToast } from '../components/ui'
import { BackupPanel } from '../components/BackupPanel'
import { useAsyncData, errorMessage } from '../hooks/useAsyncData'
import {
  countDocuments,
  countCards,
  countQuestions,
  countSessions,
  countUnresolvedWrongAnswers,
  countAttempts,
  clearAllData,
  seedSampleData
} from '../db'

interface Overview {
  documents: number
  cards: number
  questions: number
  wrongAnswers: number
  sessions: number
  attempts: number
}

export function SettingsPage(): React.JSX.Element {
  const overview = useAsyncData<Overview>(
    async () => {
      const [documents, cards, questions, wrongAnswers, sessions, attempts] = await Promise.all([
        countDocuments(),
        countCards(),
        countQuestions(),
        countUnresolvedWrongAnswers(),
        countSessions(),
        countAttempts()
      ])
      return { documents, cards, questions, wrongAnswers, sessions, attempts }
    },
    []
  )
  const { push } = useToast()
  const [seeding, setSeeding] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const handleSeed = async (): Promise<void> => {
    setSeeding(true)
    try {
      const { seeded } = await seedSampleData()
      push(seeded ? '示例数据已写入' : '已存在学习资料，跳过示例数据', seeded ? 'success' : 'info')
      overview.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setSeeding(false)
    }
  }

  const handleClear = async (): Promise<void> => {
    setClearing(true)
    try {
      await clearAllData()
      push('全部本地数据已清空', 'success')
      overview.reload()
    } catch (error) {
      push(errorMessage(error), 'error')
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-subtitle">数据统计、存放位置说明与本地数据管理</p>
        </div>
      </div>

      <div className="settings-grid">
        {[
          { label: '学习资料', value: overview.data?.documents },
          { label: '知识卡片', value: overview.data?.cards },
          { label: '练习题', value: overview.data?.questions },
          { label: '待巩固错题', value: overview.data?.wrongAnswers },
          { label: '学习记录', value: overview.data?.sessions },
          { label: '答题记录', value: overview.data?.attempts }
        ].map((item) => (
          <div className="stat-card" key={item.label}>
            <div className="stat-value">{item.value ?? '—'}</div>
            <div className="stat-label">{item.label}</div>
          </div>
        ))}
      </div>

      <BackupPanel />

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">数据存放位置</div>
        </div>
        <div className="panel-desc">
          知页是本地优先应用：所有数据保存在本机浏览器级存储 IndexedDB 中，不上传任何服务器。
          <br />
          开发模式位于 <code>%APPDATA%\studyflow\IndexedDB</code>，安装版位于{' '}
          <code>%APPDATA%\StudyFlow\IndexedDB</code>。
          <br />
          备份方法：优先使用上方「备份与恢复」导出 JSON 备份文件；也可整份复制上述文件夹。清空这些文件夹会导致学习数据永久丢失。
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">示例数据</div>
        </div>
        <div className="panel-desc">
          第一次使用时，可以写入一套示例资料、卡片、题目与错题，快速体验完整功能。已有学习资料时不会写入。
        </div>
        <div className="panel-body-actions">
          <Button icon="seed" onClick={handleSeed} disabled={seeding}>
            {seeding ? '写入中…' : '写入示例数据'}
          </Button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">清空数据（危险操作）</div>
        </div>
        <div className="panel-desc">
          将删除本机上的全部学习资料、知识卡片、练习题、错题记录与学习记录，且无法恢复。
        </div>
        <div className="panel-body-actions">
          <Button variant="danger" icon="trash" onClick={() => setConfirmClear(true)}>
            清空全部数据
          </Button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">关于</div>
        </div>
        <div className="panel-desc">
          StudyFlow 知页 v0.2.0 · Electron + React + TypeScript
          <br />
          无账号、无云端、无遥测，学习数据完全属于你。
        </div>
      </div>

      <ConfirmModal
        open={confirmClear}
        title="清空全部数据"
        desc={
          <>
            这将删除全部本地数据且<b>无法恢复</b>。建议先备份 IndexedDB 文件夹。
            <br />
            确定继续吗？
          </>
        }
        confirmText="全部删除"
        danger
        busy={clearing}
        onConfirm={handleClear}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  )
}
