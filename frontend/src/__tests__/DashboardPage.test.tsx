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
  useSuiClient: vi.fn(),
  useSuiClientQuery: vi.fn(),
  useSignAndExecuteTransaction: vi.fn(),
  useSignPersonalMessage: vi.fn(),
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}))

vi.mock('../lib/dashboardDecrypt', () => ({
  fetchClaimedEvents: vi.fn(),
  decryptAllResponses: vi.fn(),
  aggregateStats: vi.fn(),
}))

vi.mock('../lib/ptb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ptb')>()
  return {
    ...actual,
    buildClosePtb: vi.fn(actual.buildClosePtb),
  }
})

// 避免在元件測試裡跑真的 X25519 簽名
vi.mock('../lib/crypto', () => ({
  KEY_DERIVE_MSG: 'SurveySui encryption key',
  deriveCreatorKeyPair: vi.fn().mockResolvedValue({
    publicKeyBytes: new Uint8Array(32),
    privateKey: {} as CryptoKey,
  }),
  base64urlToBytes: vi.fn(() => new Uint8Array(32)),
}))

import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
} from '@mysten/dapp-kit'
import { fetchClaimedEvents, decryptAllResponses, aggregateStats } from '../lib/dashboardDecrypt'
import { buildClosePtb } from '../lib/ptb'

// ── 測試常數 ──────────────────────────────────────────────────────────────────

const PACKAGE_ID = '0x' + 'aa'.repeat(32)
const VAULT_ID = '0x' + 'bb'.repeat(32)
const CREATOR = '0x' + 'cc'.repeat(32)
const OTHER = '0x' + 'dd'.repeat(32)

vi.stubEnv('VITE_PACKAGE_ID', PACKAGE_ID)

// ── 工具 ─────────────────────────────────────────────────────────────────────

function mockVaultObject(overrides: Partial<{
  creator: string
  balance: string
  status: number
  claimed_count: string
  max_responses: string
}> = {}) {
  return {
    data: {
      data: {
        content: {
          dataType: 'moveObject',
          fields: {
            creator: CREATOR,
            balance: '58000000000', // 58 sSSR
            status: 0, // STATUS_OPEN
            claimed_count: '0',
            max_responses: '100',
            ...overrides,
          },
        },
      },
    },
    refetch: vi.fn(),
  }
}

function renderDashboard(vaultId = VAULT_ID, hash = '') {
  const path = `/dashboard/${vaultId}${hash ? `#${hash}` : ''}`
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard/:vaultId" element={<DashboardPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ── 測試 ─────────────────────────────────────────────────────────────────────

describe('DashboardPage — T4.6 /dashboard/:vaultId', () => {
  beforeEach(() => {
    vi.mocked(useSuiClient).mockReturnValue({} as ReturnType<typeof useSuiClient>)
    vi.mocked(useSuiClientQuery).mockReturnValue(
      mockVaultObject() as unknown as ReturnType<typeof useSuiClientQuery>,
    )
    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useSignAndExecuteTransaction>)
    vi.mocked(useSignPersonalMessage).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ signature: 'AAAA' }),
    } as unknown as ReturnType<typeof useSignPersonalMessage>)
    vi.mocked(fetchClaimedEvents).mockResolvedValue([])
    vi.mocked(decryptAllResponses).mockResolvedValue({ responses: [], failed: 0 })
    vi.mocked(aggregateStats).mockReturnValue({
      total_responses: 0,
      decrypted_count: 0,
      failed_count: 0,
      questions: {},
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── test_stats_render_with_zero_responses ─────────────────────────────────

  describe('test_stats_render_with_zero_responses', () => {
    it('沒有任何回覆事件時頁面仍正常渲染、顯示 0 回覆數', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )

      renderDashboard()

      // 等待事件 fetch 完成
      await waitFor(() => {
        expect(fetchClaimedEvents).toHaveBeenCalledWith(
          expect.anything(),
          VAULT_ID,
          PACKAGE_ID,
        )
      })

      // 回覆數顯示 0
      expect(await screen.findByLabelText('response-count')).toHaveTextContent('0')

      // 沒有資料時不渲染長條圖
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()

      // 友善提示
      expect(screen.getByText(/尚無回覆|尚未有任何回覆/)).toBeInTheDocument()
    })

    it('zero responses 仍可顯示 vault 鏈上餘額', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(null)

      renderDashboard()

      const balance = await screen.findByLabelText('vault-balance')
      // 58 sSSR
      expect(balance).toHaveTextContent('58')
    })
  })

  // ── test_close_button_only_for_creator ────────────────────────────────────

  describe('test_close_button_only_for_creator', () => {
    it('當前錢包為 creator 且活動 ACTIVE 時，結束活動按鈕可點擊', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )

      renderDashboard()

      await screen.findByLabelText('response-count')
      const btn = screen.getByRole('button', { name: /結束活動/ })
      expect(btn).not.toBeDisabled()
    })

    it('當前錢包非 creator 時，結束活動按鈕 disabled', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: OTHER } as ReturnType<typeof useCurrentAccount>,
      )

      renderDashboard()

      await screen.findByLabelText('response-count')
      const btn = screen.getByRole('button', { name: /結束活動/ })
      expect(btn).toBeDisabled()
    })

    it('未連線錢包時結束活動按鈕 disabled', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(null)

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.getByRole('button', { name: /結束活動/ })).toBeDisabled()
    })

    it('vault 已 CLOSED 時即便是 creator 也 disabled', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )
      vi.mocked(useSuiClientQuery).mockReturnValue(
        mockVaultObject({ status: 1 }) as unknown as ReturnType<typeof useSuiClientQuery>,
      )

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.getByRole('button', { name: /結束活動/ })).toBeDisabled()
    })

    it('creator 點擊結束活動按鈕觸發 buildClosePtb + signAndExecute', async () => {
      const mutate = vi.fn()
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )
      vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
        mutate,
      } as unknown as ReturnType<typeof useSignAndExecuteTransaction>)

      renderDashboard()

      await screen.findByLabelText('response-count')
      fireEvent.click(screen.getByRole('button', { name: /結束活動/ }))

      await waitFor(() => {
        expect(buildClosePtb).toHaveBeenCalledWith({
          packageId: PACKAGE_ID,
          vaultId: VAULT_ID,
        })
        expect(mutate).toHaveBeenCalled()
      })
    })
  })

  // ── test_decrypt_aggregates_stats（附加 sanity） ──────────────────────────

  describe('解密 + 統計流程', () => {
    it('有事件時 creator 可點解密按鈕，aggregateStats 後渲染長條圖', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )
      vi.mocked(fetchClaimedEvents).mockResolvedValue([
        {
          vault_id: VAULT_ID,
          sub_hash: [1, 2, 3],
          respondent: '0xrespondent',
          encrypted_answers: [9, 8, 7],
          claimed_at_ms: 0,
        },
      ])
      vi.mocked(aggregateStats).mockReturnValue({
        total_responses: 1,
        decrypted_count: 1,
        failed_count: 0,
        questions: {
          q1: { counts: { 紅色: 1 } },
        },
      })

      renderDashboard(VAULT_ID, 'AAAA') // 帶 contentKey hash 才啟用解密

      await waitFor(() => {
        expect(screen.getByLabelText('response-count')).toHaveTextContent('1')
      })

      fireEvent.click(screen.getByRole('button', { name: /解密回覆|解密並查看/ }))

      await waitFor(() => {
        expect(decryptAllResponses).toHaveBeenCalled()
        expect(aggregateStats).toHaveBeenCalled()
        expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
      })
    })
  })
})
