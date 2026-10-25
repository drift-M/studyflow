import { useEffect, useState } from 'react'

function App(): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const dateText = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(now)
  const timeText = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(now)

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: 32,
        boxSizing: 'border-box',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif'
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 44,
          fontWeight: 700,
          color: '#fff',
          background: 'linear-gradient(135deg, #4f6ef7 0%, #7b5bf2 55%, #a855f7 100%)',
          boxShadow: '0 12px 32px rgba(99, 91, 242, 0.35)'
        }}
      >
        知
      </div>

      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 30, letterSpacing: 1 }}>
          StudyFlow <span style={{ fontWeight: 400 }}>知页</span>
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 15, opacity: 0.65 }}>
          本地优先的 AI 学习助手 · 数据只保存在你的电脑上
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['Electron', 'React', 'TypeScript', 'Vite', '本地优先'].map((tag) => (
          <span
            key={tag}
            style={{
              padding: '5px 14px',
              borderRadius: 999,
              fontSize: 13,
              border: '1px solid rgba(128, 128, 128, 0.35)',
              opacity: 0.85
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div
        style={{
          marginTop: 8,
          padding: '14px 22px',
          borderRadius: 12,
          border: '1px solid rgba(128, 128, 128, 0.25)',
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {dateText} {timeText}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.6 }}>
          阶段 1 已完成：环境检查与项目初始化
        </div>
      </div>
    </div>
  )
}

export default App
