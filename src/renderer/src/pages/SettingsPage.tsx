import { useState } from 'react'
import { Button, ConfirmModal, useToast } from '../components/ui'
import { BackupPanel } from '../components/BackupPanel'
import { AiServicePanel } from '../components/AiServicePanel'
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

      <AiServicePanel />

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
          <div className="panel-title">关于与隐私</div>
        </div>
        <div className="panel-desc">
          StudyFlow 知页 v0.6.1 · Electron + React + TypeScript
          <br />
          <b>数据流说明</b>：学习资料、卡片、错题与复习记录默认保存在本机（IndexedDB），无账号、无云端数据库、无遥测。
          <br />
          <b>AI 数据流</b>：演示模式不联网；使用真实模型时，仅你选择的资料文本会发送给你自己配置的服务商（本地模型如 Ollama 完全不出本机），发送前界面会明确提示。
          <br />
          <b>故障排查</b>：连接失败 → 确认服务已启动（Ollama 默认 http://localhost:11434/v1）；401 → API Key 有误；404 → 地址通常需要以 /v1 结尾；429 → 频率或额度限制，稍后重试；超时 → 本地模型首次加载较慢，可再试一次。
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
