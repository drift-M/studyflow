import { useState } from 'react'
import { Sidebar, type PageId } from './components/Sidebar'
import { ToastProvider } from './components/ui'
import { HomePage } from './pages/HomePage'
import { DocumentsPage } from './pages/DocumentsPage'
import { CardsPage } from './pages/CardsPage'
import { QuizPage } from './pages/QuizPage'
import { WrongBookPage } from './pages/WrongBookPage'
import { SettingsPage } from './pages/SettingsPage'

function App(): React.JSX.Element {
  const [page, setPage] = useState<PageId>('home')

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar page={page} onNavigate={setPage} />
        <main className="app-main">
          {page === 'home' && <HomePage onNavigate={setPage} />}
          {page === 'documents' && <DocumentsPage />}
          {page === 'cards' && <CardsPage />}
          {page === 'quiz' && <QuizPage />}
          {page === 'wrongbook' && <WrongBookPage onNavigate={setPage} />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </ToastProvider>
  )
}

export default App
