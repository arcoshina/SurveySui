import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SponsorCoinQueue } from '../src/gas/sponsorCoinQueue.js'

describe('SponsorCoinQueue', () => {
  let mockSuiClient: { getCoins: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockSuiClient = {
      getCoins: vi.fn(),
    }
  })

  it('acquires the largest eligible unlocked coin', async () => {
    mockSuiClient.getCoins.mockResolvedValue({
      data: [
        {
          coinObjectId: '0x01',
          version: '1',
          digest: 'd1',
          balance: '150000000',
        },
        {
          coinObjectId: '0x02',
          version: '1',
          digest: 'd2',
          balance: '200000000',
        },
      ],
      hasNextPage: false,
    })

    const queue = new SponsorCoinQueue(60_000, 0)
    const coin = await queue.acquire(mockSuiClient as any, '0xsponsor', 100_000_000n)
    expect(coin.coinObjectId).toBe('0x02')
    expect(queue.isLocked('0x02')).toBe(true)
  })

  it('does not hand out the same coin to concurrent acquires', async () => {
    mockSuiClient.getCoins.mockResolvedValue({
      data: [
        {
          coinObjectId: '0x01',
          version: '1',
          digest: 'd1',
          balance: '200000000',
        },
        {
          coinObjectId: '0x02',
          version: '1',
          digest: 'd2',
          balance: '150000000',
        },
      ],
      hasNextPage: false,
    })

    const queue = new SponsorCoinQueue(60_000, 0)
    const [a, b] = await Promise.all([
      queue.acquire(mockSuiClient as any, '0xsponsor', 100_000_000n),
      queue.acquire(mockSuiClient as any, '0xsponsor', 100_000_000n),
    ])
    expect(a.coinObjectId).not.toBe(b.coinObjectId)
  })

  it('releases lock after TTL expires', async () => {
    vi.useFakeTimers()
    mockSuiClient.getCoins.mockResolvedValue({
      data: [
        {
          coinObjectId: '0x01',
          version: '1',
          digest: 'd1',
          balance: '200000000',
        },
      ],
      hasNextPage: false,
    })

    const queue = new SponsorCoinQueue(1000, 0)
    await queue.acquire(mockSuiClient as any, '0xsponsor', 100_000_000n)
    expect(queue.isLocked('0x01')).toBe(true)
    vi.advanceTimersByTime(1001)
    expect(queue.isLocked('0x01')).toBe(false)
    vi.useRealTimers()
  })

  it('release unlocks coin for immediate re-acquire', async () => {
    mockSuiClient.getCoins.mockResolvedValue({
      data: [
        {
          coinObjectId: '0x01',
          version: '1',
          digest: 'd1',
          balance: '200000000',
        },
      ],
      hasNextPage: false,
    })

    const queue = new SponsorCoinQueue(60_000, 0)
    const first = await queue.acquire(mockSuiClient as any, '0xsponsor', 100_000_000n)
    expect(queue.isLocked('0x01')).toBe(true)
    queue.release(first.coinObjectId)
    expect(queue.isLocked('0x01')).toBe(false)

    const second = await queue.acquire(mockSuiClient as any, '0xsponsor', 100_000_000n)
    expect(second.coinObjectId).toBe('0x01')
  })

  it('throws sponsor_coin_unavailable when no coin meets balance', async () => {
    mockSuiClient.getCoins.mockResolvedValue({
      data: [
        {
          coinObjectId: '0x01',
          version: '1',
          digest: 'd1',
          balance: '1000000',
        },
      ],
      hasNextPage: false,
    })

    const queue = new SponsorCoinQueue(60_000, 0)
    await expect(queue.acquire(mockSuiClient as any, '0xsponsor', 100_000_000n)).rejects.toThrow(
      'sponsor_coin_unavailable'
    )
  })
})
