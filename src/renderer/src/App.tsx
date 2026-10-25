import { useState } from 'react'
import { Sidebar, type PageId } from './components/Sidebar'
import { ToastProvider } from './components/ui'
import { HomePage } from './pages/HomePage'
import { DocumentsPage } from './pages/DocumentsPage'
import { DocumentDetailPage } from './pages/DocumentDetailPage'
import { CardsPage } from './pages/CardsPage'
import { QuizPage } from './pages/QuizPage'
import { WrongBookPage } from './pages/WrongBookPage'
import { SettingsPage } from './pages/SettingsPage'

/** 视图状态：普通页面或资料详情 */
type View = { kind: 'page'; page: PageId } | { kind: 'docDetail'; docId: string }

function App(): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'page', page: 'home' })
  const sidebarPage: PageId = view.kind === 'docDetail' ? 'documents' : view.page

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar
          page={sidebarPage}
          onNavigate={(page) => setView({ kind: 'page', page })}
        />
        <main className="app-main">
          {view.kind === 'page' && view.page === 'home' && (
            <HomePage onNavigate={(page) => setView({ kind: 'page', page })} />
          )}
          {view.kind === 'page' && view.page === 'documents' && (
            <DocumentsPage
              onOpenDocument={(docId) => setView({ kind: 'docDetail', docId })}
            />
          )}
          {view.kind === 'docDetail' && (
            <DocumentDetailPage
              key={view.docId}
              docId={view.docId}
              onBack={() => setView({ kind: 'page', page: 'documents' })}
              onNavigate={(page) => setView({ kind: 'page', page })}
            />
          )}
          {view.kind === 'page' && view.page === 'cards' && <CardsPage />}
          {view.kind === 'page' && view.page === 'quiz' && <QuizPage />}
          {view.kind === 'page' && view.page === 'wrongbook' && (
            <WrongBookPage onNavigate={(page) => setView({ kind: 'page', page })} />
          )}
          {view.kind === 'page' && view.page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </ToastProvider>
  )
}

export default App
