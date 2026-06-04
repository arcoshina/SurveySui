import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import Navbar from './components/Navbar'
import { LanguageProvider } from './context/LanguageContext'

const CreatePage = lazy(() => import('./pages/CreatePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))
const FundPage = lazy(() => import('./pages/FundPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const SurveyPage = lazy(() => import('./pages/SurveyPage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const StyleGuidePage = lazy(() => import('./pages/StyleGuidePage'))
const GuidePage = lazy(() => import('./pages/GuidePage'))

function DashboardPageWrapper() {
  const { vaultId } = useParams<{ vaultId: string }>()
  return <DashboardPage key={vaultId} />
}

function ResultsPageWrapper() {
  const { vaultId } = useParams<{ vaultId: string }>()
  return <ResultsPage key={vaultId} />
}

export function AppRoutes() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/create/:draftId" element={<CreatePage />} />
        <Route path="/fund/:id" element={<FundPage />} />
        <Route path="/s/:id" element={<SurveyPage />} />
        <Route path="/dashboard" element={<DashboardPage key="list" />} />
        <Route path="/dashboard/:vaultId" element={<DashboardPageWrapper />} />
        <Route path="/results/:vaultId" element={<ResultsPageWrapper />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/style-guide" element={<StyleGuidePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <Navbar />
        <AppRoutes />
      </LanguageProvider>
    </BrowserRouter>
  )
}
