import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Transaction } from '@mysten/sui/transactions'
import { calcSuiInForRwdOut, estimateSuiCost, buildFundSurveyPtb } from '../lib/ptb'
import FundPage from '../pages/FundPage'

// ── mock @mysten/dapp-kit ──────────────────────────────────────────────────────

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: vi.fn(),
  useSignAndExecuteTransaction: vi.fn(),
  useSuiClientQuery: vi.fn(),
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}))

// ── 保留真實計算函式；buildFundSurveyPtb 以 spy 包裝
// 元件測試中會用 mockImplementationOnce 回傳空 Transaction，
// PTB 結構測試則直接呼叫真實實作（spy 不干預）。

vi.mock('../lib/ptb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ptb')>()
  return {
    ...actual,
    buildFundSurveyPtb: vi.fn(actual.buildFundSurveyPtb),
  }
})

import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientQuery,
} from '@mysten/dapp-kit'

// ── 輔助函式 ──────────────────────────────────────────────────────────────────

interface SurveyState {
  perResponse: number
  maxResponses: number
  deadlineMs: number
}

function renderFundPage(state: SurveyState) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/fund/survey-123', state }]}>
      <Routes>
        <Route path="/fund/:surveyId" element={<FundPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// 儲備量設定夠大（100,000 SUI / RWD），以免小額交易超出池子
const MOCK_POOL_RESPONSE = {
  data: {
    content: {
      dataType: 'moveObject',
      fields: {
        reserve_a: '100000000000000', // RWD reserve (100,000 RWD base units)
        reserve_b: '100000000000000', // SUI reserve (100,000 SUI in MIST)
      },
    },
  },
}

// ── 測試 ──────────────────────────────────────────────────────────────────────

describe('FundPage — T3.3', () => {
  beforeEach(() => {
    vi.mocked(useSuiClientQuery).mockReturnValue({
      data: MOCK_POOL_RESPONSE,
    } as ReturnType<typeof useSuiClientQuery>)

    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useSignAndExecuteTransaction>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── test_estimated_cost_calculation ─────────────────────────────────────────

  describe('test_estimated_cost_calculation', () => {
    it('CPMM 反向計算：1 個 RWD 在等深池中需要 2 MIST SUI（ceiling）', () => {
      // 等深池：reserveSui = reserveRwd = 1000
      // suiIn = ceil(1 × 1000 × 1000 / (997 × (1000 − 1)))
      //       = ceil(1_000_000 / 996_003) = ceil(1.004...) = 2
      const result = calcSuiInForRwdOut(1000n, 1000n, 1n)
      expect(result).toBe(2n)
    })

    it('estimateSuiCost 正確計算多份響應的總 SUI 消耗', () => {
      // perResponseRwd = 1, maxResponses = 10, totalRwd = 10
      // reserveSui = reserveRwd = 100_000
      // suiIn = ceil(10 × 100_000 × 1000 / (997 × (100_000 − 10)))
      //       = ceil(1_000_000_000 / (997 × 99_990))
      //       = ceil(1_000_000_000 / 99_690_030)
      //       = ceil(10.03...) = 11
      const result = estimateSuiCost({
        perResponseRwd: 1n,
        maxResponses: 10,
        reserveSui: 100_000n,
        reserveRwd: 100_000n,
      })
      expect(result).toBe(11n)
    })

    it('rwdOut >= reserveRwd 時拋出錯誤', () => {
      expect(() => calcSuiInForRwdOut(1000n, 500n, 500n)).toThrow('RWD 供應不足')
    })

    it('預估成本顯示於頁面上', () => {
      vi.mocked(useCurrentAccount).mockReturnValue(null)

      renderFundPage({ perResponse: 1, maxResponses: 1, deadlineMs: 9999999999999 })

      // 頁面應顯示預估 SUI 消耗（格式為 x.xxxx SUI）
      expect(screen.getByLabelText('estimated-sui-cost')).toBeInTheDocument()
    })
  })

  // ── test_ptb_constructed_correctly ──────────────────────────────────────────

  describe('test_ptb_constructed_correctly', () => {
    it('buildFundSurveyPtb 建構出含 4 個命令的 Transaction', () => {
      const tx = buildFundSurveyPtb({
        packageId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        poolId: '0x0000000000000000000000000000000000000000000000000000000000000002',
        perResponseMist: 10_000_000_000n,
        maxResponses: 100,
        deadlineMs: 9_999_999_999_999n,
        adminAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
        suiToSpend: 1_010_000_000n,
        minRwdOut: 1_000_000_000_000n,
      })

      const data = tx.getData()
      // 4 個命令：SplitCoins + swap_b_to_a + create + share_vault
      expect(data.commands).toHaveLength(4)
      expect(data.commands[0].$kind).toBe('SplitCoins')
      expect(data.commands[1].$kind).toBe('MoveCall')
      expect(data.commands[2].$kind).toBe('MoveCall')
      expect(data.commands[3].$kind).toBe('MoveCall')
    })

    it('移動呼叫目標函式名稱正確', () => {
      const tx = buildFundSurveyPtb({
        packageId: '0x0000000000000000000000000000000000000000000000000000000000000001',
        poolId: '0x0000000000000000000000000000000000000000000000000000000000000002',
        perResponseMist: 10_000_000_000n,
        maxResponses: 100,
        deadlineMs: 9_999_999_999_999n,
        adminAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
        suiToSpend: 1_010_000_000n,
        minRwdOut: 1_000_000_000_000n,
      })

      const data = tx.getData()
      const moveCalls = data.commands.filter((c) => c.$kind === 'MoveCall')
      expect(moveCalls[0].MoveCall?.function).toBe('swap_b_to_a')
      expect(moveCalls[1].MoveCall?.function).toBe('create')
      expect(moveCalls[2].MoveCall?.function).toBe('share_vault')
    })
  })

  // ── test_wallet_rejection_handled ───────────────────────────────────────────

  describe('test_wallet_rejection_handled', () => {
    it('使用者拒絕簽名時顯示錯誤訊息', async () => {
      // 在元件測試中，buildFundSurveyPtb 用空 Transaction 以避免 env vars 為空的問題
      vi.mocked(buildFundSurveyPtb).mockImplementationOnce(() => new Transaction())

      const mockSignAndExecute = vi.fn(
        (_tx: unknown, callbacks: { onError: (e: Error) => void; onSuccess?: () => void }) => {
          callbacks.onError(new Error('User rejected the request'))
        },
      )

      vi.mocked(useCurrentAccount).mockReturnValue({
        address: '0xtest',
      } as ReturnType<typeof useCurrentAccount>)

      vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
        mutate: mockSignAndExecute,
      } as unknown as ReturnType<typeof useSignAndExecuteTransaction>)

      renderFundPage({ perResponse: 1, maxResponses: 10, deadlineMs: 9999999999999 })

      fireEvent.click(screen.getByRole('button', { name: /一鍵注資/ }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'User rejected the request',
      )
    })

    it('錢包未連線時注資按鈕不可點擊', () => {
      vi.mocked(useCurrentAccount).mockReturnValue(null)

      renderFundPage({ perResponse: 1, maxResponses: 10, deadlineMs: 9999999999999 })

      const btn = screen.getByRole('button', { name: /一鍵注資/ })
      expect(btn).toBeDisabled()
    })

    it('注資成功後顯示 TX digest', async () => {
      vi.mocked(buildFundSurveyPtb).mockImplementationOnce(() => new Transaction())

      const mockSignAndExecute = vi.fn(
        (
          _tx: unknown,
          callbacks: {
            onSuccess: (r: { digest: string }) => void
            onError?: (e: Error) => void
          },
        ) => {
          callbacks.onSuccess({ digest: 'DIGEST_ABC123' })
        },
      )

      vi.mocked(useCurrentAccount).mockReturnValue({
        address: '0xtest',
      } as ReturnType<typeof useCurrentAccount>)

      vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
        mutate: mockSignAndExecute,
      } as unknown as ReturnType<typeof useSignAndExecuteTransaction>)

      renderFundPage({ perResponse: 1, maxResponses: 10, deadlineMs: 9999999999999 })

      fireEvent.click(screen.getByRole('button', { name: /一鍵注資/ }))

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('DIGEST_ABC123')
      })
    })
  })
})
