import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { buildClaimPtb, estimateSelfPaidGasMist, executeTxWithFallback } from './sponsoredTx.js'

describe('Frontend Sponsored Transaction Fallback Tests', () => {
  let mockSuiClient: any
  let mockSignAndExecute: any
  let originalFetch: any

  beforeEach(() => {
    mockSuiClient = {
      dryRunTransactionBlock: vi.fn().mockResolvedValue({
        effects: {
          status: { status: 'success' },
          gasUsed: { computationCost: '1000000', storageCost: '2000000', storageRebate: '500000' },
        },
      }),
    }

    mockSignAndExecute = vi.fn().mockResolvedValue({ digest: 'self_paid_digest_mock' })
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // 1. 當限流達到 3 次時，應攔截 PLATFORM_SPONSOR_LIMIT_REACHED 並正確走 self-paid fallback
  it('should catch PLATFORM_SPONSOR_LIMIT_REACHED and trigger self-paid fallback popup', async () => {
    // Mock fetch returning 403 PLATFORM_SPONSOR_LIMIT_REACHED
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
        message: 'Daily platform sponsorship limit reached for this wallet address',
      }),
    })

    const tx = new Transaction()
    // 我們使用一個 mock build 實作來防止真實 build 呼叫聯網
    tx.build = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))

    let fallbackCalled = false
    let gasEstimate: bigint = 0n

    const onSelfPaidFallback = async (estimate: bigint) => {
      fallbackCalled = true
      gasEstimate = estimate
      return true // 使用者同意
    }

    const result = await executeTxWithFallback({
      tx,
      senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
      client: mockSuiClient,
      backendUrl: 'http://localhost:3100',
      signAndExecute: mockSignAndExecute,
      onSelfPaidFallback,
    })

    expect(fallbackCalled).toBe(true)
    // 1000000 (computation) + 2000000 (storage) - 500000 (rebate) = 2500000
    expect(gasEstimate).toBe(2500000n)
    expect(result.mode).toBe('self_paid')
    expect(result).toHaveProperty('digest', 'self_paid_digest_mock')
    expect(mockSignAndExecute).toHaveBeenCalledWith(tx)
  })

  it('should route vault_gas_insufficient to self-paid fallback with VAULT_GAS_INSUFFICIENT reason', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'vault_gas_insufficient',
        message: 'Survey gas pool is insufficient; sponsorship unavailable for this claim',
      }),
    })

    const tx = new Transaction()
    tx.build = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))

    let fallbackCalled = false
    let seenError: Error | undefined
    const result = await executeTxWithFallback({
      tx,
      senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
      client: mockSuiClient,
      backendUrl: 'http://localhost:3100',
      signAndExecute: mockSignAndExecute,
      onSelfPaidFallback: async (_est, bffError) => {
        fallbackCalled = true
        seenError = bffError
        return true
      },
    })

    expect(fallbackCalled).toBe(true)
    expect(seenError?.message?.startsWith('VAULT_GAS_INSUFFICIENT')).toBe(true)
    expect(result.mode).toBe('self_paid')
  })

  it('should fall back to self-paid when gas_exceeds_compensation', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'gas_exceeds_compensation',
        message: 'Estimated gas exceeds vault compensation',
      }),
    })

    const tx = new Transaction()
    tx.build = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))

    let fallbackCalled = false
    const result = await executeTxWithFallback({
      tx,
      senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
      client: mockSuiClient,
      backendUrl: 'http://localhost:3100',
      signAndExecute: mockSignAndExecute,
      onSelfPaidFallback: async () => {
        fallbackCalled = true
        return true
      },
    })

    expect(fallbackCalled).toBe(true)
    expect(result.mode).toBe('self_paid')
  })

  it('forceSelfPaid skips sponsorship entirely and goes straight to self-paid', async () => {
    // Any sponsor call would be a failure: fetch must not be hit.
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy

    const tx = new Transaction()
    tx.build = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))

    const result = await executeTxWithFallback({
      tx,
      senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
      client: mockSuiClient,
      backendUrl: 'http://localhost:3100',
      signAndExecute: mockSignAndExecute,
      forceSelfPaid: true,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.mode).toBe('self_paid')
    expect(result).toHaveProperty('digest', 'self_paid_digest_mock')
    expect(mockSignAndExecute).toHaveBeenCalledWith(tx)
  })

  it('estimateSelfPaidGasMist returns computation + storage - rebate', async () => {
    const tx = new Transaction()
    tx.build = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))

    const est = await estimateSelfPaidGasMist({
      tx,
      client: mockSuiClient,
      senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
    })

    // 1000000 + 2000000 - 500000 = 2500000
    expect(est).toBe(2500000n)
  })

  it('estimateSelfPaidGasMist throws when pre-flight dry run fails', async () => {
    const failingClient = {
      dryRunTransactionBlock: vi.fn().mockResolvedValue({
        effects: { status: { status: 'failure', error: 'MoveAbort(...)' } },
      }),
    } as any
    const tx = new Transaction()
    tx.build = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))

    await expect(
      estimateSelfPaidGasMist({
        tx,
        client: failingClient,
        senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
      })
    ).rejects.toThrow()
  })
})

describe('buildClaimPtb sentinel padding (ADR unified claim)', () => {
  const id = (n: string) => `0x${n.padStart(64, '0')}`
  const PKG = id('aa')
  const VAULT = id('1')
  const SURVEY = id('2')
  const PASS = id('3')
  const ISSUER = id('4')
  const NFT = id('5')
  const VOID_NFT = id('6')
  const PASS_SENTINEL = id('7')
  const NFT_TYPE = `${PKG}::some_collection::Member`

  const base = {
    packageId: PKG,
    vaultId: VAULT,
    surveyId: SURVEY,
    issuerConfigId: ISSUER,
  }

  function claimCallOf(tx: Transaction) {
    const data = tx.getData()
    const call = data.commands.find(
      (c) => c.$kind === 'MoveCall' && c.MoveCall?.function === 'claim'
    )
    expect(call?.MoveCall).toBeDefined()
    const inputObjectIds = data.inputs
      .map((i) => (i.$kind === 'UnresolvedObject' ? i.UnresolvedObject.objectId : null))
      .filter((v): v is string => !!v)
    return { moveCall: call!.MoveCall!, inputObjectIds }
  }

  it('Pass-only claim pads NFT side with VoidNft sentinel', () => {
    const tx = buildClaimPtb({ ...base, passId: PASS, voidNftId: VOID_NFT })
    const { moveCall, inputObjectIds } = claimCallOf(tx)
    expect(moveCall.package).toBe(PKG)
    expect(moveCall.module).toBe('survey_vault')
    expect(moveCall.typeArguments).toEqual([`${PKG}::claim_sentinel::VoidNft`])
    expect(inputObjectIds).toContain(PASS)
    expect(inputObjectIds).toContain(VOID_NFT)
  })

  it('NFT-only claim pads Pass side with shared pass sentinel', () => {
    const tx = buildClaimPtb({
      ...base,
      nftId: NFT,
      nftType: NFT_TYPE,
      claimPassSentinelId: PASS_SENTINEL,
    })
    const { moveCall, inputObjectIds } = claimCallOf(tx)
    expect(moveCall.typeArguments).toEqual([NFT_TYPE])
    expect(inputObjectIds).toContain(NFT)
    expect(inputObjectIds).toContain(PASS_SENTINEL)
  })

  it('Pass + NFT claim carries both real objects without sentinels', () => {
    const tx = buildClaimPtb({
      ...base,
      passId: PASS,
      nftId: NFT,
      nftType: NFT_TYPE,
      voidNftId: '',
      claimPassSentinelId: '',
    })
    const { moveCall, inputObjectIds } = claimCallOf(tx)
    expect(moveCall.typeArguments).toEqual([NFT_TYPE])
    expect(inputObjectIds).toContain(PASS)
    expect(inputObjectIds).toContain(NFT)
  })

  // 明確傳 ''(覆寫 import.meta.env),確保缺 sentinel 設定時 fail-fast 路徑穩定可測
  it('throws when Pass-only claim lacks VITE_VOID_NFT_ID', () => {
    expect(() => buildClaimPtb({ ...base, passId: PASS, voidNftId: '' })).toThrow(
      'VITE_VOID_NFT_ID required for Pass-only claim'
    )
  })

  it('throws when NFT-only claim lacks VITE_CLAIM_PASS_SENTINEL_ID', () => {
    expect(() =>
      buildClaimPtb({ ...base, nftId: NFT, nftType: NFT_TYPE, claimPassSentinelId: '' })
    ).toThrow('VITE_CLAIM_PASS_SENTINEL_ID required for NFT-only claim')
  })

  it('throws when neither Pass nor NFT eligibility is provided', () => {
    expect(() => buildClaimPtb({ ...base })).toThrow(
      'Claim requires SurveyPass or NFT eligibility'
    )
  })
})
