import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Transaction } from '@mysten/sui/transactions'
import {
  buildCreateSurveyPtb,
  extractVaultIdFromEffects,
  extractSurveyIdFromEffects,
  estimateFundCost,
} from '../lib/ptb'
import FundPage from '../pages/FundPage'

// ── mock @mysten/dapp-kit ──────────────────────────────────────────────────────

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: vi.fn(),
  useSuiClient: vi.fn(),
  useSignAndExecuteTransaction: vi.fn(),
  useSignPersonalMessage: vi.fn(),
  useSuiClientQuery: vi.fn(),
  ConnectButton: () => <button type="button">Connect Wallet</button>,
}))

vi.mock('../lib/ptb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ptb')>()
  return {
    ...actual,
    buildCreateSurveyPtb: vi.fn(actual.buildCreateSurveyPtb),
  }
})

// 避免在元件測試裡跑真的 X25519 + AES-GCM
vi.mock('../lib/crypto', () => ({
  KEY_DERIVE_MSG: 'SurveySui encryption key',
  deriveCreatorKeyPair: vi.fn().mockResolvedValue({
    publicKeyBytes: new Uint8Array(32),
    privateKey: {} as CryptoKey,
  }),
  encryptSurveyContent: vi.fn().mockResolvedValue({
    encryptedBlob: new Uint8Array([1, 2, 3]),
    contentKey: new Uint8Array(32),
  }),
  bytesToBase64url: vi.fn(() => 'CONTENT_KEY_B64'),
}))

import {
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClientQuery,
} from '@mysten/dapp-kit'

// ── 測試常數 ──────────────────────────────────────────────────────────────────

const PACKAGE_ID = '0x' + '11'.repeat(32)
const POOL_ID = '0x' + '22'.repeat(32)
const SSR_TREASURY_ID = '0x' + '33'.repeat(32)
const SSSR_TREASURY_ID = '0x' + '44'.repeat(32)
const REGISTRY_ID = '0x' + '55'.repeat(32)
const ADMIN_TREASURY = '0x' + '66'.repeat(32)
const VAULT_ID = '0x' + 'aa'.repeat(32)
const SURVEY_ID = '0x' + 'bb'.repeat(32)

const DRAFT_KEY_PREFIX = 'surveysui:draft:'

function writeDraft(draftId: string, contentMd: string) {
  window.localStorage.setItem(
    `${DRAFT_KEY_PREFIX}${draftId}`,
    JSON.stringify({ contentMd, savedAt: Date.now() }),
  )
}

function validDraftMd(): string {
  return `---
title: "測試問卷"
perResponse: 2
maxResponses: 5
deadline: "2099-01-01T00:00:00Z"
---

問卷說明...`
}

function renderFundPage(draftId: string) {
  return render(
    <MemoryRouter initialEntries={[`/fund/${draftId}`]}>
      <Routes>
        <Route path="/fund/:id" element={<FundPage />} />
        <Route path="/dashboard/:vaultId" element={<div data-testid="page-dashboard">DASH</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ── pure-lib 測試 ─────────────────────────────────────────────────────────────

describe('ptb lib — T4.3', () => {
  describe('test_ptb_contains_three_commands', () => {
    it('一鍵 PTB 包含 V2 七步驟相關主要 MoveCall', () => {
      const tx = buildCreateSurveyPtb({
        packageId: PACKAGE_ID,
        poolId: POOL_ID,
        ssrTreasuryId: SSR_TREASURY_ID,
        sssrTreasuryId: SSSR_TREASURY_ID,
        registryId: REGISTRY_ID,
        adminTreasury: ADMIN_TREASURY,
        perResponse: 2n,
        maxResponses: 5,
        deadlineMs: 4102444800000n,
        encryptedContent: new Uint8Array([1, 2, 3, 4]),
        suiToSpend: 10_000_000n, // 0.01 SUI
        contentHash: new Uint8Array(32),
        schemaHash: new Uint8Array(32),
        questions: [],
        offsetIn: 0n,
        creatorSssrCoins: [],
      })

      const data = tx.getData()
      const moveCalls = data.commands.filter((c) => c.$kind === 'MoveCall')

      const targets = moveCalls.map((c) => c.MoveCall?.function)
      expect(targets).toContain('invest_and_mint')
      expect(targets).toContain('create_empty')
      expect(targets).toContain('deposit_existing_sssr')
      expect(targets).toContain('merge_balances')
      expect(targets).toContain('split_fee_to_treasury')
      expect(targets).toContain('register')
    })

    it('MoveCall 目標模組正確（amm_pool / survey_vault / survey_registry）', () => {
      const tx = buildCreateSurveyPtb({
        packageId: PACKAGE_ID,
        poolId: POOL_ID,
        ssrTreasuryId: SSR_TREASURY_ID,
        sssrTreasuryId: SSSR_TREASURY_ID,
        registryId: REGISTRY_ID,
        adminTreasury: ADMIN_TREASURY,
        perResponse: 2n,
        maxResponses: 5,
        deadlineMs: 4102444800000n,
        encryptedContent: new Uint8Array([1, 2, 3, 4]),
        suiToSpend: 10_000_000n,
        contentHash: new Uint8Array(32),
        schemaHash: new Uint8Array(32),
        questions: [],
        offsetIn: 0n,
        creatorSssrCoins: [],
      })

      const data = tx.getData()
      const moveCalls = data.commands
        .filter((c) => c.$kind === 'MoveCall')
        .map((c) => c.MoveCall!)

      const byFn = (fn: string) => moveCalls.find((m) => m.function === fn)
      expect(byFn('invest_and_mint')?.module).toBe('amm_pool')
      expect(byFn('create_empty')?.module).toBe('survey_vault')
      expect(byFn('register')?.module).toBe('survey_registry')
    })
  })

  describe('test_extract_vault_id_from_effects', () => {
    const objectChanges = [
      {
        type: 'created',
        objectId: VAULT_ID,
        objectType: `${PACKAGE_ID}::survey_vault::SurveyVault`,
      },
      {
        type: 'created',
        objectId: SURVEY_ID,
        objectType: `${PACKAGE_ID}::survey_registry::Survey`,
      },
      {
        type: 'mutated',
        objectId: POOL_ID,
        objectType: `${PACKAGE_ID}::amm_pool::Pool`,
      },
    ]

    it('extractVaultIdFromEffects 找到 SurveyVault 物件 ID', () => {
      const vaultId = extractVaultIdFromEffects(objectChanges)
      expect(vaultId).toBe(VAULT_ID)
    })

    it('extractSurveyIdFromEffects 找到 Survey 物件 ID', () => {
      const surveyId = extractSurveyIdFromEffects(objectChanges)
      expect(surveyId).toBe(SURVEY_ID)
    })

    it('找不到時回傳 null', () => {
      expect(extractVaultIdFromEffects([])).toBeNull()
      expect(extractSurveyIdFromEffects([])).toBeNull()
    })

    it('不會把 mutated 的 Pool 誤判為 vault', () => {
      const onlyMutated = [
        {
          type: 'mutated',
          objectId: POOL_ID,
          objectType: `${PACKAGE_ID}::amm_pool::Pool`,
        },
      ]
      expect(extractVaultIdFromEffects(onlyMutated)).toBeNull()
    })
  })

  describe('estimateFundCost', () => {
    it('bonding curve 初始狀態（total_invested = 0）：1 SUI → 1000 sSSR', () => {
      // perResponse=2, max=5 → 需 vault 內持有 10 sSSR（base units 含 9 decimals）
      // 因 vault 抽 0.3% 費用，須先 mint 約 10 / 0.997 = 10.0301 sSSR
      // total_invested=0 時 1 SUI = 1000 sSSR，故 SUI ≈ 0.01003 SUI
      const result = estimateFundCost({
        perResponse: 2n,
        maxResponses: 5,
        totalSuiInvested: 0n,
      })
      // 1 sSSR = 1e9 base units；10 sSSR = 1e10
      // grossSssr = ceil(1e10 * 10000 / 9970) = ceil(10_030_090_270.81...) = 10_030_090_271
      expect(result.grossSssrBase).toBe(10_030_090_271n)
      expect(result.vaultFeeBase).toBe(30_090_270n) // 0.3% of grossSssr
      // 初始狀態 SUI = ceil(grossSssr / 1000) MIST
      // 10_030_090_271 / 1000 = 10_030_090.271 → ceil = 10_030_091 MIST ≈ 0.01003 SUI
      expect(result.suiToInvest).toBe(10_030_091n)
    })

    it('total_invested 增加後，相同 sSSR 需要更多 SUI', () => {
      const r1 = estimateFundCost({
        perResponse: 1n,
        maxResponses: 1,
        totalSuiInvested: 0n,
      })
      const r2 = estimateFundCost({
        perResponse: 1n,
        maxResponses: 1,
        totalSuiInvested: 1_000_000_000_000n, // 1000 SUI
      })
      expect(r2.suiToInvest).toBeGreaterThan(r1.suiToInvest)
    })
  })
})

// ── FundPage 元件測試 ─────────────────────────────────────────────────────────

describe('FundPage — T4.3 注資頁', () => {
  beforeEach(() => {
    window.localStorage.clear()

    vi.mocked(useSuiClient).mockReturnValue({
      getTransactionBlock: vi.fn().mockResolvedValue({
        events: [
          {
            type: '0xpkg::survey_registry::SurveyRegistered',
            parsedJson: { vault_id: VAULT_ID, survey_id: SURVEY_ID },
          },
        ],
        objectChanges: [
          {
            type: 'created',
            objectId: VAULT_ID,
            objectType: `${import.meta.env.VITE_PACKAGE_ID ?? ''}::survey_vault::SurveyVault`,
          },
          {
            type: 'created',
            objectId: SURVEY_ID,
            objectType: `${import.meta.env.VITE_PACKAGE_ID ?? ''}::survey_registry::Survey`,
          },
        ],
        effects: { status: { status: 'success' } },
      }),
    } as unknown as ReturnType<typeof useSuiClient>)

    vi.mocked(useSuiClientQuery).mockImplementation((queryName: string) => {
      if (queryName === 'getObject') {
        return {
          data: {
            data: {
              content: {
                dataType: 'moveObject',
                fields: {
                  total_sui_invested: '0',
                  fee_config: {
                    fields: {
                      total_fee_bps: '2000',
                      discount_bps: '5000',
                    }
                  }
                },
              },
            },
          },
        } as any
      }
      if (queryName === 'getCoins') {
        return {
          data: {
            data: [
              { coinObjectId: '0xcoin1', balance: '10000000000' } // 10 sSSR
            ]
          }
        } as any
      }
      return { data: null } as any
    })

    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useSignAndExecuteTransaction>)

    vi.mocked(useSignPersonalMessage).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        signature:
          'AAAAAA' + // placeholder base64 signature
          'A'.repeat(80),
      }),
    } as unknown as ReturnType<typeof useSignPersonalMessage>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('找不到 draft 顯示錯誤訊息', () => {
    renderFundPage('draft-missing')
    expect(screen.getByText(/找不到問卷草稿/)).toBeInTheDocument()
  })

  it('顯示預估 SUI 消耗 + 平台手續費', () => {
    writeDraft('draft-ok', validDraftMd())
    vi.mocked(useCurrentAccount).mockReturnValue(null)

    renderFundPage('draft-ok')

    expect(screen.getByLabelText('estimated-sui-cost')).toBeInTheDocument()
    expect(screen.getByLabelText('platform-fee')).toBeInTheDocument()
  })

  it('錢包未連線時注資按鈕 disabled', () => {
    writeDraft('draft-ok', validDraftMd())
    vi.mocked(useCurrentAccount).mockReturnValue(null)

    renderFundPage('draft-ok')
    expect(screen.getByRole('button', { name: /步驟一：設定加密金鑰/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).toBeDisabled()
  })

  it('錢包 reject 簽名時顯示錯誤訊息', async () => {
    writeDraft('draft-ok', validDraftMd())
    vi.mocked(buildCreateSurveyPtb).mockImplementationOnce(() => new Transaction())

    const mockSign = vi.fn(
      (_tx: unknown, callbacks: { onError: (e: Error) => void }) => {
        callbacks.onError(new Error('User rejected the request'))
      },
    )

    vi.mocked(useCurrentAccount).mockReturnValue({
      address: '0xtest',
    } as ReturnType<typeof useCurrentAccount>)
    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: mockSign,
    } as unknown as ReturnType<typeof useSignAndExecuteTransaction>)

    renderFundPage('draft-ok')

    fireEvent.click(screen.getByRole('button', { name: /步驟一：設定加密金鑰/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).not.toBeDisabled()
    })
    fireEvent.click(screen.getByRole('button', { name: /步驟二：發布問卷/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /User rejected the request/,
    )
  })

  it('成功後從 objectChanges 抽 vault_id 並導向 /dashboard/:vaultId', async () => {
    writeDraft('draft-ok', validDraftMd())
    vi.mocked(buildCreateSurveyPtb).mockImplementationOnce(() => new Transaction())

    const mockSign = vi.fn(
      (
        _tx: unknown,
        callbacks: {
          onSuccess: (r: {
            digest: string
            objectChanges: Array<{ type: string; objectId: string; objectType: string }>
          }) => void
        },
      ) => {
        callbacks.onSuccess({
          digest: 'DIGEST_OK',
          objectChanges: [
            {
              type: 'created',
              objectId: VAULT_ID,
              objectType: `${import.meta.env.VITE_PACKAGE_ID ?? ''}::survey_vault::SurveyVault`,
            },
            {
              type: 'created',
              objectId: SURVEY_ID,
              objectType: `${import.meta.env.VITE_PACKAGE_ID ?? ''}::survey_registry::Survey`,
            },
          ],
        })
      },
    )

    vi.mocked(useCurrentAccount).mockReturnValue({
      address: '0xtest',
    } as ReturnType<typeof useCurrentAccount>)
    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: mockSign,
    } as unknown as ReturnType<typeof useSignAndExecuteTransaction>)

    renderFundPage('draft-ok')

    fireEvent.click(screen.getByRole('button', { name: /步驟一：設定加密金鑰/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).not.toBeDisabled()
    })
    fireEvent.click(screen.getByRole('button', { name: /步驟二：發布問卷/ }))

    await waitFor(() => {
      expect(screen.getByTestId('page-dashboard')).toBeInTheDocument()
    })
  })

  it('test_fund_page_renders_three_sections — 明確渲染出三個資金流區段', () => {
    writeDraft('draft-ok', validDraftMd())
    vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xtest' } as any)

    renderFundPage('draft-ok')

    expect(screen.getByText(/既有 sSSR 折抵/i)).toBeInTheDocument()
    expect(screen.getByText(/AMM 注資/i)).toBeInTheDocument()
    expect(screen.getByText(/費率分拆/i)).toBeInTheDocument()
  })

  it('test_fund_page_sends_correct_parameters_to_ptb — 送出時傳遞正確參數呼叫 PTB', async () => {
    writeDraft('draft-ok', validDraftMd())
    vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xtest' } as any)
    
    const mockPtb = vi.fn().mockReturnValue(new Transaction())
    vi.mocked(buildCreateSurveyPtb).mockImplementation(mockPtb)

    const mockSign = vi.fn(
      (_tx: unknown, callbacks: { onSuccess: (r: any) => void }) => {
        callbacks.onSuccess({
          digest: 'DIGEST_OK',
          objectChanges: [],
        })
      }
    )
    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: mockSign,
    } as any)

    renderFundPage('draft-ok')

    fireEvent.click(screen.getByRole('button', { name: /步驟一：設定加密金鑰/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).not.toBeDisabled()
    })
    fireEvent.click(screen.getByRole('button', { name: /步驟二：發布問卷/ }))

    await waitFor(() => {
      expect(mockPtb).toHaveBeenCalled()
      const args = mockPtb.mock.calls[0][0]
      expect(args).toHaveProperty('contentHash')
      expect(args).toHaveProperty('schemaHash')
      expect(args).toHaveProperty('questions')
      expect(args).toHaveProperty('offsetIn')
      expect(args).toHaveProperty('creatorSssrCoins')
    })
  })

  // ── S4.1 兩步驟簽名發起流程 ──────────────────────────────────────────────────

  describe('S4.1 兩步驟簽名發起流程', () => {
    it('test_key_setup_button_derives_keypair — 點擊步驟一 → signPersonalMessage 呼叫一次 → 步驟二 enabled', async () => {
      writeDraft('draft-ok', validDraftMd())
      vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xtest' } as any)

      const mockSignMsg = vi.fn().mockResolvedValue({ signature: 'AAAAAA' + 'A'.repeat(80) })
      vi.mocked(useSignPersonalMessage).mockReturnValue({
        mutateAsync: mockSignMsg,
      } as any)

      renderFundPage('draft-ok')

      expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: /步驟一：設定加密金鑰/ }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).not.toBeDisabled()
      })

      expect(mockSignMsg).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: /✓ 加密金鑰已設定/ })).toBeInTheDocument()
    })

    it('test_publish_button_disabled_before_key_setup — 步驟一完成前步驟二按鈕為 disabled', () => {
      writeDraft('draft-ok', validDraftMd())
      vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xtest' } as any)

      renderFundPage('draft-ok')

      expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).toBeDisabled()
    })

    it('test_keypair_cleared_on_wallet_change — 步驟一後切換錢包 → 步驟二回到 disabled', async () => {
      writeDraft('draft-ok', validDraftMd())
      vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xwallet_a' } as any)

      const { rerender } = render(
        <MemoryRouter initialEntries={['/fund/draft-ok']}>
          <Routes>
            <Route path="/fund/:id" element={<FundPage />} />
          </Routes>
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByRole('button', { name: /步驟一：設定加密金鑰/ }))
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).not.toBeDisabled()
      })

      vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xwallet_b' } as any)
      rerender(
        <MemoryRouter initialEntries={['/fund/draft-ok']}>
          <Routes>
            <Route path="/fund/:id" element={<FundPage />} />
          </Routes>
        </MemoryRouter>,
      )

      expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).toBeDisabled()
    })
  })

  it('test_create_page_breakdown_matches_move_after_submit — submit 前 UI 顯示的數值 == 實際打到鏈上的 PTB 參數', async () => {
    writeDraft('draft-ok', validDraftMd())
    vi.mocked(useCurrentAccount).mockReturnValue({ address: '0xtest' } as any)

    const mockPtb = vi.fn().mockReturnValue(new Transaction())
    vi.mocked(buildCreateSurveyPtb).mockImplementation(mockPtb)

    const mockSign = vi.fn(
      (_tx: unknown, callbacks: { onSuccess: (r: any) => void }) => {
        callbacks.onSuccess({
          digest: 'DIGEST_OK',
          objectChanges: [],
        })
      }
    )
    vi.mocked(useSignAndExecuteTransaction).mockReturnValue({
      mutate: mockSign,
    } as any)

    renderFundPage('draft-ok')

    // Wait for cost estimation to populate in UI
    await waitFor(() => {
      expect(screen.getByText(/抵扣數額: 10.0000 sSSR/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/新購數額: 1.1111 sSSR/i)).toBeInTheDocument()
    expect(screen.getByText(/分拆手續費 \(fee\): 1.1111 sSSR/i)).toBeInTheDocument()
    expect(screen.getByText(/0.0011 SUI/i)).toBeInTheDocument()

    // Step 1: setup key, then step 2: fund
    fireEvent.click(screen.getByRole('button', { name: /步驟一：設定加密金鑰/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /步驟二：發布問卷/ })).not.toBeDisabled()
    })
    fireEvent.click(screen.getByRole('button', { name: /步驟二：發布問卷/ }))

    await waitFor(() => {
      expect(mockPtb).toHaveBeenCalled()
      const args = mockPtb.mock.calls[0][0]
      // Matches: offsetIn = 10_000_000_000n, suiToSpend = 1_122_223n
      expect(args.offsetIn).toBe(10_000_000_000n)
      expect(args.suiToSpend).toBe(1_122_223n)
    })
  })
})

