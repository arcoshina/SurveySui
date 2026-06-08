import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InMemoryCoinLockStore } from '../src/inMemoryCoinLockStore.js'

describe('InMemoryCoinLockStore', () => {
  let mockSuiClient: { getCoins: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockSuiClient = { getCoins: vi.fn() }
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

    const store = new InMemoryCoinLockStore(60_000, 0)
    const first = await store.acquire(mockSuiClient as any, '0xsponsor', 100_000_000n)
    store.release(first.coinObjectId)
    const second = await store.acquire(mockSuiClient as any, '0xsponsor', 100_000_000n)
    expect(second.coinObjectId).toBe('0x01')
  })
})
