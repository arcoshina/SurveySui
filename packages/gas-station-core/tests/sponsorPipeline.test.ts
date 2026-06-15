import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@mysten/sui/transactions', () => {
  const tx = {
    setSender: vi.fn(),
    setGasOwner: vi.fn(),
    setGasPayment: vi.fn(),
    setGasBudget: vi.fn(),
    build: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  }
  return { Transaction: { fromKind: vi.fn(() => tx) } }
})

import { InMemoryCoinLockStore, runSponsorPipeline, loadGasConfig } from '../src/index.js'

describe('runSponsorPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('releases coin after dry-run failure', async () => {
    const mockClient = {
      getCoins: vi.fn().mockResolvedValue({
        data: [
          {
            coinObjectId: '0x01',
            version: '1',
            digest: 'd1',
            balance: '500000000',
          },
        ],
        hasNextPage: false,
      }),
      dryRunTransactionBlock: vi.fn().mockResolvedValue({
        effects: { status: { status: 'failure', error: 'move abort' }, gasUsed: {} },
      }),
    }

    const signer = {
      getSponsorAddress: () => '0xsponsor',
      signTransaction: vi.fn(),
      asTransactionSigner: () => ({
        getPublicKey: () => ({ toSuiAddress: () => '0xsponsor' }),
        signTransaction: vi.fn(),
      }),
    }

    const store = new InMemoryCoinLockStore(30_000, 0)
    const outcome = await runSponsorPipeline({
      txBytes: Buffer.from('dGVzdA==').toString('base64'),
      senderAddress: '0xsender',
      suiClient: mockClient as any,
      signer: signer as any,
      sponsorAddress: '0xsponsor',
      coinStore: store,
      gasConfig: loadGasConfig({}),
      context: {
        isPassSponsor: true,
        isPlatformSponsor: false,
        claimGasCompensationAmount: null,
      },
    })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toBe('dry_run_failed')
    expect(store.isLocked('0x01')).toBe(false)
  })

  it('keeps coin locked after successful sign', async () => {
    const mockClient = {
      getCoins: vi.fn().mockResolvedValue({
        data: [
          {
            coinObjectId: '0x01',
            version: '1',
            digest: 'd1',
            balance: '500000000',
          },
        ],
        hasNextPage: false,
      }),
      dryRunTransactionBlock: vi.fn().mockResolvedValue({
        effects: {
          status: { status: 'success' },
          gasUsed: {
            computationCost: '1000',
            storageCost: '100',
            storageRebate: '0',
          },
        },
      }),
    }

    const signer = {
      getSponsorAddress: () => '0xsponsor',
      signTransaction: vi.fn().mockResolvedValue({ signature: 'sig' }),
      asTransactionSigner: () => ({
        getPublicKey: () => ({ toSuiAddress: () => '0xsponsor' }),
        signTransaction: vi.fn(),
      }),
    }

    const store = new InMemoryCoinLockStore(30_000, 0)
    const outcome = await runSponsorPipeline({
      txBytes: Buffer.from('dGVzdA==').toString('base64'),
      senderAddress: '0xsender',
      suiClient: mockClient as any,
      signer: signer as any,
      sponsorAddress: '0xsponsor',
      coinStore: store,
      gasConfig: loadGasConfig({}),
      context: {
        isPassSponsor: false,
        isPlatformSponsor: false,
        claimGasCompensationAmount: null,
      },
    })

    expect(outcome.ok).toBe(true)
    expect(store.isLocked('0x01')).toBe(true)
  })
})
