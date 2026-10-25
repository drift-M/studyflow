import { Button, EmptyState } from '../components/ui'
import { Icon } from '../components/Icon'
import { useAsyncData } from '../hooks/useAsyncData'
import { useImportDocument } from '../hooks/useImport'
import { countDocuments, countCards, countDueCards, listRecentSessions } from '../db'
import { formatRelative, formatDuration } from '../format'
import type { PageId } from '../components/Sidebar'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

interface HomeStats {
  documents: number
  cards: number
  dueCards: number
  sessions: Awaited<ReturnType<typeof listRecentSessions>>
}

export function HomePage({ onNavigate }: { onNavigate: (page: PageId) => void }): React.JSX.Element {
  const stats = useAsyncData<HomeStats>(
    async () => {
      const [documents, cards, dueCards, sessions] = await Promise.all([
        countDocuments(),
        countCards(),
        countDueCards(),
        listRecentSessions(5)
      ])
      return { documents, cards, dueCards, sessions }
    },
    []
  )
  const { importDocument, importing } = useImportDocument()

  const handleImport = async (): Promise<void> => {
    if (await importDocument()) {
      stats.reload()
    }
  }

  return (
    <div className="page">
      <div className="home-hero">
        <div className="home-greeting">{greeting()}，欢迎来到知页</div>
        <div className="home-intro">
          本地优先的 AI 学习助手 —— 资料导入、知识卡片、练习与错题，数据全部保存在这台电脑上。
        </div>
      </div>

      {stats.error ? <div className="error-block">{stats.error}</div> : null}

      <div className="stat-grid">
        <button className="stat-card" onClick={() => onNavigate('documents')}>
          <div className="stat-value">{stats.data?.documents ?? '—'}</div>
          <div className="stat-label">学习资料</div>
        </button>
        <button className="stat-card" onClick={() => onNavigate('cards')}>
          <div className="stat-value">{stats.data?.cards ?? '—'}</div>
          <div className="stat-label">知识卡片</div>
        </button>
        <button className="stat-card" onClick={() => onNavigate('cards')}>
          <div className="stat-value">{stats.data?.dueCards ?? '—'}</div>
          <div className="stat-label">待复习</div>
        </button>
      </div>

      {stats.data && stats.data.documents === 0 ? (
        <div className="panel">
          <EmptyState
            icon="import"
            title="导入第一份学习资料，开始你的学习流"
            desc={
              <>
                支持 PDF 与 Markdown 文件。三步开始：
                <br />
                1. 点击下方按钮选择文件 　2. 知页会读取并保存在本地
                　3. 后续版本将自动生成知识卡片与练习题
              </>
            }
            actions={
              <Button variant="primary" icon="import" onClick={handleImport} disabled={importing}>
                {importing ? '导入中…' : '导入学习资料'}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">最近学习</div>
            <Button small onClick={() => onNavigate('documents')}>
              查看全部资料
            </Button>
          </div>
          {stats.loading ? (
            <div className="loading-block">加载中…</div>
          ) : stats.data && stats.data.sessions.length > 0 ? (
            stats.data.sessions.map((session) => (
              <div className="list-row" key={session.id}>
                <div className="session-icon">
                  <Icon name={session.type === 'quiz' ? 'quiz' : 'cards'} size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="session-summary">{session.summary}</div>
                  <div className="session-meta">
                    {formatRelative(session.startedAt)} · 时长 {formatDuration(session.durationSec)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon="clock"
              title="还没有学习记录"
              desc="在知识卡片或练习题页面停留超过 15 秒，就会自动记录一条学习足迹。"
              actions={
                <Button onClick={() => onNavigate('cards')}>去知识卡片</Button>
              }
            />
          )}
        </div>
      )}

      {stats.data && stats.data.documents > 0 ? (
        <div style={{ marginTop: 18 }}>
          <Button variant="primary" icon="import" onClick={handleImport} disabled={importing}>
            {importing ? '导入中…' : '导入学习资料'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
