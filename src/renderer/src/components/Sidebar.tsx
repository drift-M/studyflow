import { Icon, type IconName } from './Icon'
import { useAsyncData } from '../hooks/useAsyncData'
import { countUnresolvedWrongAnswers } from '../db'

export type PageId = 'home' | 'documents' | 'cards' | 'quiz' | 'wrongbook' | 'settings'

const NAV_ITEMS: Array<{ id: PageId; label: string; icon: IconName }> = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'documents', label: '我的资料', icon: 'folder' },
  { id: 'cards', label: '知识卡片', icon: 'cards' },
  { id: 'quiz', label: '练习题', icon: 'quiz' },
  { id: 'wrongbook', label: '错题本', icon: 'wrongbook' },
  { id: 'settings', label: '设置', icon: 'settings' }
]

export function Sidebar({
  page,
  onNavigate
}: {
  page: PageId
  onNavigate: (page: PageId) => void
}): React.JSX.Element {
  // 每次切换页面时刷新错题角标
  const wrongCount = useAsyncData(countUnresolvedWrongAnswers, [page])

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">知</div>
        <div>
          <div className="logo-name">StudyFlow</div>
          <div className="logo-sub">知页 · 本地学习</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item${page === item.id ? ' active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.id === 'wrongbook' && wrongCount.data ? (
              <span className="nav-badge">{wrongCount.data}</span>
            ) : null}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">v0.6.1 · 数据仅存本地</div>
    </aside>
  )
}
