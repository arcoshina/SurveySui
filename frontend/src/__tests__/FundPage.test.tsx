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
    it('一鍵 PTB 包含 invest_and_mint / survey_vault::create / survey_registry::register 三個主要 MoveCall', () => {
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
      })

      const data = tx.getData()
      const moveCalls = data.commands.filter((c) => c.$kind === 'MoveCall')

      const targets = moveCalls.map((c) => c.MoveCall?.function)
      expect(targets).toContain('invest_and_mint')
      expect(targets).toContain('create')
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
      })

      const data = tx.getData()
      const moveCalls = data.commands
        .filter((c) => c.$kind === 'MoveCall')
        .map((c) => c.MoveCall!)

      const byFn = (fn: string) => moveCalls.find((m) => m.function === fn)
      expect(byFn('invest_and_mint')?.module).toBe('amm_pool')
      expect(byFn('create')?.module).toBe('survey_vault')
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

    vi.mocked(useSuiClientQuery).mockReturnValue({
      data: {
        data: {
          content: {
            dataType: 'moveObject',
            fields: { total_sui_invested: '0' },
          },
        },
      },
    } as ReturnType<typeof useSuiClientQuery>)

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
    expect(screen.getByRole('button', { name: /一鍵注資/ })).toBeDisabled()
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
    fireEvent.click(screen.getByRole('button', { name: /一鍵注資/ }))

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
    fireEvent.click(screen.getByRole('button', { name: /一鍵注資/ }))

    await waitFor(() => {
      expect(screen.getByTestId('page-dashboard')).toBeInTheDocument()
    })
  })
})
