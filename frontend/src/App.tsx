import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CreatePage from './pages/CreatePage'
import DashboardPage from './pages/DashboardPage'
import FundPage from './pages/FundPage'
import LandingPage from './pages/LandingPage'
import RedeemPage from './pages/RedeemPage'
import SurveyPage from './pages/SurveyPage'
import AuthPage from './pages/AuthPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/fund/:id" element={<FundPage />} />
      <Route path="/s/:id" element={<SurveyPage />} />
      <Route path="/redeem" element={<RedeemPage />} />
      <Route path="/dashboard/:vaultId" element={<DashboardPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
