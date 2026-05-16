import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CreatePage from './pages/CreatePage'
import DashboardPage from './pages/DashboardPage'
import FundPage from './pages/FundPage'
import LoginCallbackPage from './pages/LoginCallbackPage'
import LoginPage from './pages/LoginPage'
import SurveyPage from './pages/SurveyPage'
import SwapPage from './pages/SwapPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/callback" element={<LoginCallbackPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/fund/:surveyId" element={<FundPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/dashboard/:surveyId" element={<DashboardPage />} />
        <Route path="/s/:id" element={<SurveyPage />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/" element={<Navigate to="/create" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
