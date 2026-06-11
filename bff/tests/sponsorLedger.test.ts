import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  checkSponsorLimit,
  reserveSponsor,
  tryReserveSponsorLimit,
  getSponsorCount,
  countOnChainSponsoredTx,
  __resetSponsorState,
  __resetSponsorProcessState,
  __useInMemoryPassReservationsForTests,
  __useInMemoryPassSponsorOnchainCacheForTests,
} from '../src/gas/sponsorLedger.js'

describe('SponsorLedger Unit Tests', () => {
  let mockSuiClient: any

  const sponsorAddress = '0xabc'

  beforeEach(() => {
    __resetSponsorState()
    __useInMemoryPassReservationsForTests()
    __useInMemoryPassSponsorOnchainCacheForTests()
    mockSuiClient = {
      queryTransactionBlocks: vi.fn(),
    }
  })

  const passTxPage = (
    count: number,
    status: 'success' | 'failure' = 'success',
    opts: { pkg?: string; timestampMs?: string; fn?: string } = {}
  ) => ({
    data: Array.from({ length: count }, () => ({
      timestampMs: opts.timestampMs,
      transaction: {
        data: {
          gasData: { owner: '0xabc' },
          transaction: {
            // Matches real Sui RPC shape: commands live under `transactions`.
            transactions: [
              {
                MoveCall: {
                  module: 'survey_pass',
                  function: opts.fn ?? 'mint_pass',
                  ...(opts.pkg ? { package: opts.pkg } : {}),
                },
              },
            ],
          },
        },
      },
      effects: { status: { status } },
    })),
    hasNextPage: false,
    nextCursor: null,
  })

  it('should allow sponsorship for a new wallet when chain history is empty', async () => {
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(passTxPage(0))

    const res = await checkSponsorLimit({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
      maxLimit: 2,
    })

    expect(res.allowed).toBe(true)
    expect(res.count).toBe(0)
    expect(mockSuiClient.queryTransactionBlocks).toHaveBeenCalledTimes(1)
  })

  it('should be read-only: repeated checks without reservations do not consume quota', async () => {
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(passTxPage(0))
    const params = {
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
      maxLimit: 2,
    }

    const a = await checkSponsorLimit(params)
    const b = await checkSponsorLimit(params)
    expect(a.count).toBe(0)
    expect(b.count).toBe(0)
    expect(a.allowed).toBe(true)
    expect(b.allowed).toBe(true)
    // On-chain count is cached → only one RPC query for repeated checks.
    expect(mockSuiClient.queryTransactionBlocks).toHaveBeenCalledTimes(1)
  })

  it('tryReserveSponsorLimit atomically enforces limit under concurrent attempts', async () => {
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(passTxPage(0))
    const params = {
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
      maxLimit: 2,
    }

    const results = await Promise.all([
      tryReserveSponsorLimit(params),
      tryReserveSponsorLimit(params),
      tryReserveSponsorLimit(params),
    ])
    const allowed = results.filter((r) => r.allowed).length
    expect(allowed).toBe(2)
    expect(results.filter((r) => !r.allowed)).toHaveLength(1)
  })

  it('should enforce the 2-time limit via in-flight reservations', async () => {
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(passTxPage(0))
    const params = {
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
      maxLimit: 2,
    }

    const res1 = await checkSponsorLimit(params)
    expect(res1.allowed).toBe(true)
    expect(res1.count).toBe(0)
    await reserveSponsor('0x123', sponsorAddress)

    const res2 = await checkSponsorLimit(params)
    expect(res2.allowed).toBe(true)
    expect(res2.count).toBe(1)
    await reserveSponsor('0x123', sponsorAddress)

    const res3 = await checkSponsorLimit(params)
    expect(res3.allowed).toBe(false)
    expect(res3.count).toBe(2)
  })

  it('should derive the count from on-chain history (incl. failed txs)', async () => {
    // A previously landed sponsored pass tx that aborted on chain still counts.
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(passTxPage(1, 'failure'))

    const onChainCount = await countOnChainSponsoredTx({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
    })
    expect(onChainCount).toBe(1)

    const res = await checkSponsorLimit({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
      maxLimit: 2,
    })
    expect(res.allowed).toBe(true)
    expect(res.count).toBe(1)

    // With one on-chain tx + one in-flight reservation we hit the limit.
    await reserveSponsor('0x123', sponsorAddress)
    const blockRes = await checkSponsorLimit({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
      maxLimit: 2,
    })
    expect(blockRes.allowed).toBe(false)
    expect(blockRes.count).toBe(2)
  })

  it('should count mint_pass_with_extra_credentials toward sponsor limit', async () => {
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(
      passTxPage(1, 'success', { fn: 'mint_pass_with_extra_credentials' })
    )

    const onChainCount = await countOnChainSponsoredTx({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
    })
    expect(onChainCount).toBe(1)
  })

  it('packageId filter: only counts txs into the matching package', async () => {
    // One tx into pkg 0xAAA, one into 0xBBB (two pages would be ideal, but a
    // single page with mixed packages exercises the per-command filter).
    mockSuiClient.queryTransactionBlocks.mockResolvedValue({
      data: [
        {
          transaction: {
            data: {
              gasData: { owner: '0xabc' },
              transaction: {
                transactions: [
                  { MoveCall: { module: 'survey_pass', function: 'mint_pass', package: '0xaaa' } },
                ],
              },
            },
          },
          effects: { status: { status: 'success' } },
        },
        {
          transaction: {
            data: {
              gasData: { owner: '0xabc' },
              transaction: {
                transactions: [
                  { MoveCall: { module: 'survey_pass', function: 'mint_pass', package: '0xbbb' } },
                ],
              },
            },
          },
          effects: { status: { status: 'success' } },
        },
      ],
      hasNextPage: false,
      nextCursor: null,
    })

    const onlyAaa = await countOnChainSponsoredTx({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
      packageId: '0xaaa',
    })
    expect(onlyAaa).toBe(1)

    const all = await countOnChainSponsoredTx({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
      packageId: null,
    })
    expect(all).toBe(2)
  })

  it('sinceMs filter: drops txs older than the threshold', async () => {
    mockSuiClient.queryTransactionBlocks.mockResolvedValue({
      data: [
        {
          timestampMs: '1000',
          transaction: {
            data: {
              gasData: { owner: '0xabc' },
              transaction: {
                transactions: [{ MoveCall: { module: 'survey_pass', function: 'mint_pass' } }],
              },
            },
          },
          effects: { status: { status: 'success' } },
        },
        {
          timestampMs: '5000',
          transaction: {
            data: {
              gasData: { owner: '0xabc' },
              transaction: {
                transactions: [{ MoveCall: { module: 'survey_pass', function: 'mint_pass' } }],
              },
            },
          },
          effects: { status: { status: 'success' } },
        },
      ],
      hasNextPage: false,
      nextCursor: null,
    })

    const sinceCut = await countOnChainSponsoredTx({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
      sinceMs: 3000,
    })
    expect(sinceCut).toBe(1) // only the timestampMs=5000 tx survives
  })

  it('getSponsorCount reflects on-chain truth plus in-flight reservations', async () => {
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(passTxPage(1))

    const before = await getSponsorCount({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
    })
    expect(before).toBe(1)

    await reserveSponsor('0x123', sponsorAddress)
    const after = await getSponsorCount({
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
    })
    expect(after).toBe(2)
  })

  it('reuses persisted on-chain cache after process-state reset within TTL', async () => {
    mockSuiClient.queryTransactionBlocks.mockResolvedValue(passTxPage(1))
    const params = {
      suiClient: mockSuiClient as any,
      senderAddress: '0x123',
      sponsorAddress: '0xabc',
    }

    expect(await getSponsorCount(params)).toBe(1)
    expect(mockSuiClient.queryTransactionBlocks).toHaveBeenCalledTimes(1)

    __resetSponsorProcessState()

    expect(await getSponsorCount(params)).toBe(1)
    expect(mockSuiClient.queryTransactionBlocks).toHaveBeenCalledTimes(1)
  })

  it('does not double-count a reservation once its tx is reflected on-chain (cache TTL < reservation TTL)', async () => {
    // Regression: a single sponsored mint briefly showed as 2 (quota "used up"),
    // then "recovered" to 1 once the 120s reservation expired — because the
    // 45s-cached on-chain count picked up the landed tx while the reservation was
    // still live, summing the same tx twice.
    vi.useFakeTimers()
    try {
      const params = {
        suiClient: mockSuiClient as any,
        senderAddress: '0x123',
        sponsorAddress: '0xabc',
      }

      // Initial: empty chain history.
      mockSuiClient.queryTransactionBlocks.mockResolvedValue(passTxPage(0))
      expect(await getSponsorCount(params)).toBe(0)

      // Sign + reserve (tx not yet indexed): reservation bridges the gap.
      await reserveSponsor('0x123', sponsorAddress)
      expect(await getSponsorCount(params)).toBe(1)

      // The tx lands on chain, and enough time passes to expire the on-chain
      // cache (45s) but NOT the reservation (120s) — the original bug window.
      mockSuiClient.queryTransactionBlocks.mockResolvedValue(passTxPage(1))
      vi.advanceTimersByTime(50_000)

      // Must stay at 1: the now-indexed tx releases its bridging reservation
      // instead of being counted on top of it.
      expect(await getSponsorCount(params)).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
