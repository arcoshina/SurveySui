import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { calcAmountOut, calcPriceImpact } from '../lib/swap'
import SwapPage from '../pages/SwapPage'

// ── mock @mysten/dapp-kit ──────────────────────────────────────────────────────

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: vi.fn(),
  useSignAndExecuteTransaction: vi.fn(),
  useSuiClientQuery: vi.fn(),
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}))

vi.mock('../lib/swap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/swap')>()
  return {
    ...actual,
    buildSwapPtb: vi.fn(actual.buildSwapPtb),
  }
})

import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientQuery,
} from '@mysten/dapp-kit'

// ── 測試資料 ──────────────────────────────────────────────────────────────────

// 深池：各 1000 RWD / SUI（以 base unit 計）
const MOCK_POOL_DEEP = {
  data: {
    content: {
      dataType: 'moveObject',
      fields: {
        reserve_a: '1000000000000', // 1000 RWD (9 decimals)
        reserve_b: '1000000000000', // 1000 SUI (9 decimals)
      },
    },
  },
}

// 淺池：各 10 RWD / SUI，小額 swap 即可產生 > 5% 的價格影響
const MOCK_POOL_SHALLOW = {
  data: {
    content: {
      dataType: 'moveObject',
      fields: {
        reserve_a: '10000000000', // 10 RWD
        reserve_b: '10000000000', // 10 SUI
      },
    },
  },
}

function renderSwapPage() {
  return render(
    <MemoryRouter>
      <SwapPage />
    </MemoryRouter>,
  )
}

// ── 測試 ──────────────────────────────────────────────────────────────────────

describe('SwapPage — T3.7', () => {
  beforeEach(() => {
    vi.mocked(useCurrentAccount).mockReturnValue(null)
    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useSignAndExecuteTransaction>)
    vi.mocked(useSuiClientQuery).mockReturnValue({
      data: MOCK_POOL_DEEP,
      isLoading: false,
    } as unknown as ReturnType<typeof useSuiClientQuery>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── test_amount_out_matches_contract_simulation ──────────────────────────────

  describe('test_amount_out_matches_contract_simulation', () => {
    it('等深池：calcAmountOut 結果與合約公式 compute_amount_out 一致', () => {
      // reserve_in = reserve_out = 1000, amount_in = 100
      // numerator = 1000 × 100 × 997 = 99700000
      // denominator = 1000 × 1000 + 100 × 997 = 1099700
      // amount_out = floor(99700000 / 1099700) = 90
      expect(calcAmountOut(100n, 1000n, 1000n)).toBe(90n)
    })

    it('不對稱池：calcAmountOut 結果與合約公式一致', () => {
      // reserve_in = 500, reserve_out = 2000, amount_in = 50
      // numerator = 2000 × 50 × 997 = 99700000
      // denominator = 500 × 1000 + 50 × 997 = 549850
      // amount_out = floor(99700000 / 549850) = 181
      expect(calcAmountOut(50n, 500n, 2000n)).toBe(181n)
    })

    it('amountIn = 0 時拋出錯誤', () => {
      expect(() => calcAmountOut(0n, 1000n, 1000n)).toThrow('amountIn 須大於 0')
    })

    it('儲備量為零時拋出錯誤', () => {
      expect(() => calcAmountOut(100n, 0n, 1000n)).toThrow('儲備量不能為零')
    })

    it('頁面 amount-out 欄位顯示正確計算結果（深池 SUI→RWD）', () => {
      renderSwapPage()

      // 1 SUI = 10^9 base units；深池 reserve = 10^12；price impact ≈ 0.1%
      const input = screen.getByLabelText('amount-in-SUI')
      fireEvent.change(input, { target: { value: '1' } })

      const output = screen.getByLabelText('amount-out-RWD')
      // amount_out 應接近 1（因為等深池 + 0.3% fee），格式為 x.xxxxxx
      expect(output).not.toHaveValue('')
      const val = parseFloat((output as HTMLInputElement).value)
      expect(val).toBeGreaterThan(0.99)
      expect(val).toBeLessThan(1)
    })
  })

  // ── test_pool_object_fetch_handles_stale_data ────────────────────────────────

  describe('test_pool_object_fetch_handles_stale_data', () => {
    it('池子資料載入中時顯示 pool-loading 指示器', () => {
      vi.mocked(useSuiClientQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as unknown as ReturnType<typeof useSuiClientQuery>)

      renderSwapPage()
      expect(screen.getByLabelText('pool-loading')).toBeInTheDocument()
    })

    it('池子資料為 null 時不崩潰，且 output 欄位為空', () => {
      vi.mocked(useSuiClientQuery).mockReturnValue({
        data: null,
        isLoading: false,
      } as unknown as ReturnType<typeof useSuiClientQuery>)

      renderSwapPage()

      const input = screen.getByLabelText('amount-in-SUI')
      fireEvent.change(input, { target: { value: '1' } })

      const output = screen.getByLabelText('amount-out-RWD')
      expect(output).toHaveValue('')
    })

    it('池子 content 型別非 moveObject 時不崩潰', () => {
      vi.mocked(useSuiClientQuery).mockReturnValue({
        data: { data: { content: { dataType: 'package' } } },
        isLoading: false,
      } as unknown as ReturnType<typeof useSuiClientQuery>)

      expect(() => renderSwapPage()).not.toThrow()
    })

    it('正常取得池子資料後不顯示載入指示器', () => {
      renderSwapPage()
      expect(screen.queryByLabelText('pool-loading')).not.toBeInTheDocument()
    })
  })

  // ── test_slippage_warning_above_5pct ────────────────────────────────────────

  describe('test_slippage_warning_above_5pct', () => {
    it('calcPriceImpact：等深池投入 10% 儲備量時影響超過 5%', () => {
      // amount_in = 100, reserve = 1000（10% of pool）
      // amount_out = 90, ratio = 0.9 → impact = 10%
      const impact = calcPriceImpact(100n, 1000n, 1000n)
      expect(impact).toBeGreaterThan(5)
      expect(impact).toBeCloseTo(10, 0)
    })

    it('淺池中 swap 1 SUI 時顯示滑點警告', async () => {
      vi.mocked(useSuiClientQuery).mockReturnValue({
        data: MOCK_POOL_SHALLOW,
        isLoading: false,
      } as unknown as ReturnType<typeof useSuiClientQuery>)

      renderSwapPage()

      // 淺池 reserve = 10 SUI / 10 RWD；swap 1 SUI（10% of pool）→ price impact ≈ 9.34%
      const input = screen.getByLabelText('amount-in-SUI')
      fireEvent.change(input, { target: { value: '1' } })

      await waitFor(() => {
        expect(screen.getByLabelText('slippage-warning')).toBeInTheDocument()
      })
    })

    it('深池中 swap 小額時不顯示滑點警告', () => {
      renderSwapPage() // 使用 beforeEach 中的 MOCK_POOL_DEEP

      // 深池 reserve = 1000 SUI / 1000 RWD；swap 0.001 SUI（0.0001% of pool）→ impact ≈ 0.3%
      const input = screen.getByLabelText('amount-in-SUI')
      fireEvent.change(input, { target: { value: '0.001' } })

      expect(screen.queryByLabelText('slippage-warning')).not.toBeInTheDocument()
    })

    it('輸入為空時不顯示滑點警告', () => {
      renderSwapPage()
      expect(screen.queryByLabelText('slippage-warning')).not.toBeInTheDocument()
    })
  })
})
