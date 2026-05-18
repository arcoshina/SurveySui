import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../pages/LandingPage', () => ({
  default: () => <div data-testid="page-landing">LANDING</div>,
}))
vi.mock('../pages/CreatePage', () => ({
  default: () => <div data-testid="page-create">CREATE</div>,
}))
vi.mock('../pages/FundPage', () => ({
  default: () => <div data-testid="page-fund">FUND</div>,
}))
vi.mock('../pages/SurveyPage', () => ({
  default: () => <div data-testid="page-survey">SURVEY</div>,
}))
vi.mock('../pages/RedeemPage', () => ({
  default: () => <div data-testid="page-redeem">REDEEM</div>,
}))
vi.mock('../pages/DashboardPage', () => ({
  default: () => <div data-testid="page-dashboard">DASHBOARD</div>,
}))

import { AppRoutes } from '../App'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('AppRoutes — T4.1 六路由對應頁面', () => {
  it('/ 渲染 LandingPage', () => {
    renderAt('/')
    expect(screen.getByTestId('page-landing')).toBeInTheDocument()
  })

  it('/create 渲染 CreatePage', () => {
    renderAt('/create')
    expect(screen.getByTestId('page-create')).toBeInTheDocument()
  })

  it('/fund/:id 渲染 FundPage（帶動態 id）', () => {
    renderAt('/fund/draft-123')
    expect(screen.getByTestId('page-fund')).toBeInTheDocument()
  })

  it('/s/:id 渲染 SurveyPage（帶動態 id）', () => {
    renderAt('/s/survey-abc')
    expect(screen.getByTestId('page-survey')).toBeInTheDocument()
  })

  it('/redeem 渲染 RedeemPage', () => {
    renderAt('/redeem')
    expect(screen.getByTestId('page-redeem')).toBeInTheDocument()
  })

  it('/dashboard/:vaultId 渲染 DashboardPage（帶動態 vaultId）', () => {
    renderAt('/dashboard/vault-xyz')
    expect(screen.getByTestId('page-dashboard')).toBeInTheDocument()
  })

  it('未知路徑 fallback 至 LandingPage', () => {
    renderAt('/this-route-does-not-exist')
    expect(screen.getByTestId('page-landing')).toBeInTheDocument()
  })
})
