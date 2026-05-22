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
  decryptSurveyContent: vi.fn().mockResolvedValue({
    markdown: '---\ntitle: "測試問卷"\nperResponse: 1\nmaxResponses: 100\ndeadline: "2030-01-01T00:00:00Z"\nminTier: 0\n---\n\n```yaml\nquestions:\n  - id: q1\n    type: SHORT_ANSWER\n    prompt: "選擇題"\n    required: true\n```\n'
  }),
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
const SURVEY_ID = '0x' + 'ee'.repeat(32)
const CREATOR_2 = '0x' + 'ff'.repeat(32)
const VAULT_ID_2 = '0x' + '11'.repeat(32)

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
            balance: '58000000000', // 58 SSR
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

function mockSuiClientWithEvents(events: { parsedJson: Record<string, string> }[]) {
  vi.mocked(useSuiClient).mockReturnValue({
    queryEvents: vi.fn().mockResolvedValue({ data: events }),
    getObject: vi.fn().mockResolvedValue({ data: null }),
    multiGetObjects: vi.fn().mockImplementation(({ ids }) => {
      return Promise.resolve(
        ids.map((id: string) => ({
          data: {
            content: {
              dataType: 'moveObject',
              fields: {
                status: 0,
                encrypted_content: Array.from(new Uint8Array(64)),
                claimed_count: '0',
                max_responses: '100',
              }
            }
          }
        }))
      )
    })
  } as unknown as ReturnType<typeof useSuiClient>)
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
    vi.mocked(useSuiClient).mockReturnValue({
      queryEvents: vi.fn().mockResolvedValue({ data: [] }),
      getObject: vi.fn().mockResolvedValue({ data: null }),
      multiGetObjects: vi.fn().mockImplementation(({ ids }) => {
        return Promise.resolve(
          ids.map((id: string) => ({
            data: {
              content: {
                dataType: 'moveObject',
                fields: {
                  status: 0,
                  encrypted_content: Array.from(new Uint8Array(64)),
                  claimed_count: '0',
                  max_responses: '100',
                }
              }
            }
          }))
        )
      })
    } as unknown as ReturnType<typeof useSuiClient>)
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
      // 58 SSR
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

    it('當前錢包非 creator 時，結束活動按鈕不在 DOM', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: OTHER } as ReturnType<typeof useCurrentAccount>,
      )

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.queryByRole('button', { name: /結束活動/ })).not.toBeInTheDocument()
    })

    it('未連線錢包時結束活動按鈕不在 DOM', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(null)

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.queryByRole('button', { name: /結束活動/ })).not.toBeInTheDocument()
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
      // CLOSED 狀態下 button 文字會從「結束活動」轉為「已結束」
      expect(screen.getByRole('button', { name: /已結束|結束活動/ })).toBeDisabled()
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

  // ── S3.3：三個 TDD 規格測試 ───────────────────────────────────────────────

  describe('test_close_button_visible_for_creator', () => {
    it('creator 連線且 vault ACTIVE 時按鈕可見', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.getByRole('button', { name: /結束活動/ })).toBeInTheDocument()
    })
  })

  describe('test_close_button_hidden_for_non_creator', () => {
    it('非 creator 時按鈕完全不在 DOM', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: OTHER } as ReturnType<typeof useCurrentAccount>,
      )

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.queryByRole('button', { name: /結束活動/ })).not.toBeInTheDocument()
    })
  })

  describe('test_close_button_hidden_when_wallet_disconnected', () => {
    it('未連錢包時按鈕完全不在 DOM', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(null)

      renderDashboard()

      await screen.findByLabelText('response-count')
      expect(screen.queryByRole('button', { name: /結束活動/ })).not.toBeInTheDocument()
    })
  })

  // ── S3.4：分享連結、問卷列表、回覆進度格式 ───────────────────────────────────

  describe('test_dashboard_shows_share_link', () => {
    it('surveyId 解析後顯示分享連結', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )
      mockSuiClientWithEvents([
        { parsedJson: { vault_id: VAULT_ID, survey_id: SURVEY_ID, creator: CREATOR } },
      ])

      renderDashboard()

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /填答連結|分享/ })
        expect(link).toHaveAttribute('href', `/s/${SURVEY_ID}`)
      })
      expect(screen.getByRole('button', { name: /複製/ })).toBeInTheDocument()
    })
  })

  describe('test_dashboard_copy_share_link', () => {
    it('點擊複製按鈕後 clipboard 收到含 survey_id 的 URL', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true,
      })

      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )
      mockSuiClientWithEvents([
        { parsedJson: { vault_id: VAULT_ID, survey_id: SURVEY_ID, creator: CREATOR } },
      ])

      renderDashboard()

      const copyBtn = await screen.findByRole('button', { name: /複製/ })
      fireEvent.click(copyBtn)

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`/s/${SURVEY_ID}`))
      })
      expect(screen.getByRole('button', { name: /已複製/ })).toBeInTheDocument()
    })
  })

  describe('test_dashboard_shows_qrcode_modal', () => {
    it('點擊 QR Code 按鈕後彈出 Modal 視窗並可關閉', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )
      mockSuiClientWithEvents([
        { parsedJson: { vault_id: VAULT_ID, survey_id: SURVEY_ID, creator: CREATOR } },
      ])

      renderDashboard()

      const qrBtn = await screen.findByRole('button', { name: /顯示二維碼/ })
      fireEvent.click(qrBtn)

      expect(screen.getByText('問卷填答 QR Code')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '下載 PNG' })).toBeInTheDocument()
      
      const closeBtn = screen.getByRole('button', { name: '關閉' })
      fireEvent.click(closeBtn)
      
      await waitFor(() => {
        expect(screen.queryByText('問卷填答 QR Code')).not.toBeInTheDocument()
      })
    })
  })

  describe('test_dashboard_lists_all_creator_surveys', () => {
    it('mock RPC 回 3 份 creator 名下 vault → render 顯示 3 列', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )
      mockSuiClientWithEvents([
        { parsedJson: { vault_id: '0x' + 'a1'.repeat(32), survey_id: '0x01', creator: CREATOR } },
        { parsedJson: { vault_id: '0x' + 'a2'.repeat(32), survey_id: '0x02', creator: CREATOR } },
        { parsedJson: { vault_id: '0x' + 'a3'.repeat(32), survey_id: '0x03', creator: CREATOR } },
      ])

      renderDashboard()

      await waitFor(() => {
        expect(screen.getAllByRole('row')).toHaveLength(3)
      })
    })
  })

  describe('test_dashboard_filters_by_wallet_address', () => {
    it('切換錢包地址後列表跟著更新', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )
      mockSuiClientWithEvents([
        { parsedJson: { vault_id: VAULT_ID, survey_id: SURVEY_ID, creator: CREATOR } },
        { parsedJson: { vault_id: VAULT_ID_2, survey_id: '0x02', creator: CREATOR_2 } },
      ])

      const { rerender } = render(
        <MemoryRouter initialEntries={[`/dashboard/${VAULT_ID}`]}>
          <Routes>
            <Route path="/dashboard/:vaultId" element={<DashboardPage />} />
          </Routes>
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(screen.getAllByRole('row')).toHaveLength(1)
      })

      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR_2 } as ReturnType<typeof useCurrentAccount>,
      )
      rerender(
        <MemoryRouter initialEntries={[`/dashboard/${VAULT_ID}`]}>
          <Routes>
            <Route path="/dashboard/:vaultId" element={<DashboardPage />} />
          </Routes>
        </MemoryRouter>,
      )

      await waitFor(() => {
        expect(screen.getAllByRole('row')).toHaveLength(1)
      })
    })
  })

  describe('test_dashboard_received_over_max_display', () => {
    it('vault received=3, max=10 → 顯示 "3 / 10"', async () => {
      vi.mocked(useCurrentAccount).mockReturnValue(
        { address: CREATOR } as ReturnType<typeof useCurrentAccount>,
      )
      vi.mocked(fetchClaimedEvents).mockResolvedValue([
        { vault_id: VAULT_ID, sub_hash: [1], respondent: '0x1', encrypted_answers: [1], claimed_at_ms: 0 },
        { vault_id: VAULT_ID, sub_hash: [2], respondent: '0x2', encrypted_answers: [2], claimed_at_ms: 0 },
        { vault_id: VAULT_ID, sub_hash: [3], respondent: '0x3', encrypted_answers: [3], claimed_at_ms: 0 },
      ])
      vi.mocked(useSuiClientQuery).mockReturnValue(
        mockVaultObject({ max_responses: '10' }) as unknown as ReturnType<typeof useSuiClientQuery>,
      )

      renderDashboard()

      await waitFor(() => {
        expect(screen.getByLabelText('received-over-max')).toHaveTextContent('3 / 10')
      })
    })
  })

  // ── test_decrypt_aggregates_stats（附加 sanity） ──────────────────────────

  describe('解密 + 統計流程', () => {
    it('有事件時 creator 可點解密按鈕，並在解密後顯示答卷明文數據與下載 CSV 按鈕', async () => {
      vi.mocked(useSuiClient).mockReturnValue({
        queryEvents: vi.fn().mockResolvedValue({
          data: [
            {
              parsedJson: {
                vault_id: VAULT_ID,
                survey_id: SURVEY_ID,
                creator: CREATOR,
              },
            },
          ],
        }),
        getObject: vi.fn().mockResolvedValue({
          data: {
            content: {
              fields: {
                schema_hash: [1, 2, 3],
                encrypted_content: Array.from(new Uint8Array(64)),
              },
            },
          },
        }),
        multiGetObjects: vi.fn().mockImplementation(({ ids }) => {
          return Promise.resolve(
            ids.map((id: string) => ({
              data: {
                content: {
                  dataType: 'moveObject',
                  fields: {
                    status: 0,
                    encrypted_content: Array.from(new Uint8Array(64)),
                    claimed_count: '0',
                    max_responses: '100',
                  }
                }
              }
            }))
          )
        })
      } as unknown as ReturnType<typeof useSuiClient>)

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
      vi.mocked(decryptAllResponses).mockResolvedValue({
        responses: [
          {
            respondent: '0xrespondent',
            sub_hash: [1, 2, 3],
            claimed_at_ms: 1716290000000,
            answers: { q1: '紅色' },
          },
        ],
        failed: 0,
      })
      vi.mocked(aggregateStats).mockReturnValue({
        total_responses: 1,
        decrypted_count: 1,
        failed_count: 0,
        questions: {
          q1: { counts: { 紅色: 1 } },
        },
      })

      renderDashboard(VAULT_ID, 'AAAA') // 帶 contentKey hash 才啟用解密

      // 先確保 surveyId 解析完成並渲染填答連結，代表 async 的 metadata 載入程序已完成
      await screen.findByRole('link', { name: /填答連結/ })

      await waitFor(() => {
        expect(screen.getByLabelText('response-count')).toHaveTextContent('1')
      })

      fireEvent.click(screen.getByRole('button', { name: /解密回覆|解密並查看/ }))

      await waitFor(() => {
        expect(decryptAllResponses).toHaveBeenCalled()
        expect(aggregateStats).toHaveBeenCalled()
        expect(screen.getByText('答卷明文數據')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /下載 CSV/ })).toBeInTheDocument()
      })
    })
  })
})
