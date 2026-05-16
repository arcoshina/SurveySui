import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'

// recharts 在 jsdom 中無法渲染 SVG，改用輕量 stub
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: vi.fn(),
  useSuiClientQuery: vi.fn(),
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}))

import { useCurrentAccount, useSuiClientQuery } from '@mysten/dapp-kit'

// ── 測試資料 ────────────────────────────────────────────────────────────────

const MOCK_SURVEY = {
  id: 'survey-123',
  creator: '0xcreator',
  status: 'ACTIVE',
  vault_object_id: '0xvault',
  deadline: '2099-12-31T23:59:59Z',
  per_response: 1,
  max_responses: 100,
}

const MOCK_STATS = {
  response_count: 42,
  completion_rate: 0.42,
  distributions: [
    {
      question_id: 'q1',
      question: '色彩偏好',
      data: [
        { label: '紅色', count: 20 },
        { label: '藍色', count: 22 },
      ],
    },
  ],
  vault_balance: '58000000000',
}

const MOCK_VAULT_QUERY = {
  data: {
    content: {
      dataType: 'moveObject',
      fields: { balance: '58000000000' },
    },
  },
}

// ── 輔助函式 ─────────────────────────────────────────────────────────────────

function renderDashboard(surveyId = 'survey-123') {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/${surveyId}`]}>
      <Routes>
        <Route path="/dashboard/:surveyId" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function stubFetchSuccessful(surveyOverride: Partial<typeof MOCK_SURVEY> = {}) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...MOCK_SURVEY, ...surveyOverride }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_STATS,
      }),
  )
}

// ── 測試 ─────────────────────────────────────────────────────────────────────

describe('DashboardPage — T3.4', () => {
  beforeEach(() => {
    vi.mocked(useSuiClientQuery).mockReturnValue(
      MOCK_VAULT_QUERY as ReturnType<typeof useSuiClientQuery>,
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  // ── test_dashboard_renders_stats ────────────────────────────────────────────

  describe('test_dashboard_renders_stats', () => {
    it('從 API 抓取統計並顯示回覆數、完成率、vault 餘額', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: '0xcreator' } as ReturnType<typeof useCurrentAccount>,
      )
      stubFetchSuccessful()

      renderDashboard()

      expect(await screen.findByLabelText('response-count')).toHaveTextContent('42')
      expect(screen.getByLabelText('completion-rate')).toHaveTextContent('42.0%')
      expect(screen.getByLabelText('vault-balance')).toBeInTheDocument()
    })

    it('顯示各題分佈 Recharts BarChart', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(null)
      stubFetchSuccessful()

      renderDashboard()

      expect(await screen.findByTestId('bar-chart')).toBeInTheDocument()
      expect(screen.getByText('色彩偏好')).toBeInTheDocument()
    })

    it('鏈上 vault 餘額以 RWD 單位顯示', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(null)
      stubFetchSuccessful()

      renderDashboard()

      await screen.findByLabelText('vault-balance')
      expect(screen.getByLabelText('vault-balance')).toHaveTextContent('RWD')
    })
  })

  // ── test_close_button_disabled_until_eligible ──────────────────────────────

  describe('test_close_button_disabled_until_eligible', () => {
    it('問卷已結束（CLOSED）時結束按鈕不可點擊', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: '0xcreator' } as ReturnType<typeof useCurrentAccount>,
      )
      stubFetchSuccessful({ status: 'CLOSED' })

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.getByRole('button', { name: /結束活動/ })).toBeDisabled()
    })

    it('當前錢包非建立者時結束按鈕不可點擊', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: '0xother' } as ReturnType<typeof useCurrentAccount>,
      )
      stubFetchSuccessful()

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.getByRole('button', { name: /結束活動/ })).toBeDisabled()
    })

    it('未連線錢包時結束按鈕不可點擊', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(null)
      stubFetchSuccessful()

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.getByRole('button', { name: /結束活動/ })).toBeDisabled()
    })

    it('建立者且問卷進行中時結束按鈕可點擊', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: '0xcreator' } as ReturnType<typeof useCurrentAccount>,
      )
      stubFetchSuccessful()

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.getByRole('button', { name: /結束活動/ })).not.toBeDisabled()
    })

    it('點擊結束按鈕成功後顯示成功狀態', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: '0xcreator' } as ReturnType<typeof useCurrentAccount>,
      )
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => MOCK_SURVEY })
          .mockResolvedValueOnce({ ok: true, json: async () => MOCK_STATS })
          .mockResolvedValueOnce({ ok: true, json: async () => ({}) }),
      )

      renderDashboard()

      await screen.findByLabelText('response-count')
      fireEvent.click(screen.getByRole('button', { name: /結束活動/ }))

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('已成功結束')
      })
    })
  })
})
