import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RedeemPage from '../pages/RedeemPage'

// ── mock @mysten/dapp-kit ──────────────────────────────────────────────────────

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: vi.fn(),
  useSignAndExecuteTransaction: vi.fn(),
  useSuiClientQuery: vi.fn(),
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}))

vi.mock('../lib/ptb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ptb')>()
  return {
    ...actual,
    buildRedeemPtb: vi.fn(),
  }
})

import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { buildRedeemPtb } from '../lib/ptb'

// Mock environment variables
vi.stubEnv('VITE_PACKAGE_ID', '0xpackage')
vi.stubEnv('VITE_AMM_POOL_ID', '0xpool')
vi.stubEnv('VITE_SSSR_TREASURY_ID', '0xsssrtreasury')

const MOCK_COINS = {
  data: [
    {
      coinObjectId: '0xcoin1',
      balance: '5000000000', // 5.0 sSSR
    },
    {
      coinObjectId: '0xcoin2',
      balance: '10000000000', // 10.0 sSSR
    },
  ],
}

function renderRedeemPage() {
  return render(
    <MemoryRouter>
      <RedeemPage />
    </MemoryRouter>,
  )
}

describe('RedeemPage — T4.5 兌換頁', () => {
  beforeEach(() => {
    vi.mocked(useCurrentAccount).mockReturnValue(null)
    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: vi.fn(),
    } as any)
    vi.mocked(useSuiClientQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      refetch: vi.fn(),
    } as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('未連接錢包時顯示請連接錢包的提示', () => {
    vi.mocked(useCurrentAccount).mockReturnValue(null)

    renderRedeemPage()

    expect(screen.getByText(/請先連接錢包/i)).toBeInTheDocument()
  })

  it('載入憑證中時顯示 loading 指示器', () => {
    vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xuser' } as any)
    vi.mocked(useSuiClientQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: vi.fn(),
    } as any)

    renderRedeemPage()

    expect(screen.getByText(/載入中/)).toBeInTheDocument()
  })

  it('沒有持有 sSSR 憑證時顯示無憑證的友善提示', () => {
    vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xuser' } as any)
    vi.mocked(useSuiClientQuery).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as any)

    renderRedeemPage()

    expect(screen.getByText(/您目前沒有可兌換的 sSSR 憑證/)).toBeInTheDocument()
  })

  it('test_lists_user_receipts — 正確列出使用者持有的所有 sSSR 憑證', () => {
    vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xuser' } as any)
    vi.mocked(useSuiClientQuery).mockReturnValue({
      data: MOCK_COINS,
      isLoading: false,
      refetch: vi.fn(),
    } as any)

    renderRedeemPage()

    expect(screen.getByText(/5\.0000/)).toBeInTheDocument()
    expect(screen.getByText(/10\.0000/)).toBeInTheDocument()
    expect(screen.getByText(/0xcoin1/)).toBeInTheDocument()
    expect(screen.getByText(/0xcoin2/)).toBeInTheDocument()
  })

  it('test_redeem_returns_ssr — 選擇憑證點擊兌換，發送交易並顯示成功及 TX Hash', async () => {
    vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xuser' } as any)
    const mockRefetch = vi.fn()
    vi.mocked(useSuiClientQuery).mockReturnValue({
      data: MOCK_COINS,
      isLoading: false,
      refetch: mockRefetch,
    } as any)

    const mockMutate = vi.fn()
    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: mockMutate,
    } as any)

    vi.mocked(buildRedeemPtb).mockReturnValue({} as any)

    renderRedeemPage()

    const redeemBtns = screen.getAllByRole('button', { name: /兌換/ })
    expect(redeemBtns).toHaveLength(2)

    fireEvent.click(redeemBtns[0])

    expect(buildRedeemPtb).toHaveBeenCalledWith({
      packageId: '0xpackage',
      poolId: '0xpool',
      sssrTreasuryId: '0xsssrtreasury',
      sssrCoinId: '0xcoin1',
      senderAddress: '0xuser',
    })

    expect(mockMutate).toHaveBeenCalled()

    const successCallback = mockMutate.mock.calls[0][1].onSuccess
    successCallback({ digest: '0xredeemtxhash' })

    await waitFor(() => {
      expect(screen.getByText(/兌換成功/)).toBeInTheDocument()
      expect(screen.getByText(/0xredeemtxhash/)).toBeInTheDocument()
    })

    expect(mockRefetch).toHaveBeenCalled()
  })
})
