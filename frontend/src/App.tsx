import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import CreatePage from './pages/CreatePage'
import DashboardPage from './pages/DashboardPage'
import FundPage from './pages/FundPage'
import LandingPage from './pages/LandingPage'
import SurveyPage from './pages/SurveyPage'
import AuthPage from './pages/AuthPage'
import Navbar from './components/Navbar'

function DashboardPageWrapper() {
  const { vaultId } = useParams<{ vaultId: string }>()
  return <DashboardPage key={vaultId} />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/create/:draftId" element={<CreatePage />} />
      <Route path="/fund/:id" element={<FundPage />} />
      <Route path="/s/:id" element={<SurveyPage />} />
      <Route path="/dashboard" element={<DashboardPage key="list" />} />
      <Route path="/dashboard/:vaultId" element={<DashboardPageWrapper />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <AppRoutes />
    </BrowserRouter>
  )
}
