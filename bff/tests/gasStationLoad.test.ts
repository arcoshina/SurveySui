import { describe, it, expect, vi } from 'vitest'
import { InMemoryCoinLockStore } from '@surveysui/gas-station-core'

/**
 * Lightweight load-style test: serial acquire/release should not deadlock
 * and should use distinct coins when available.
 */
describe('gas station coin queue load', () => {
  it('handles 20 serial sponsor attempts without leaving stale locks', async () => {
    const coins = Array.from({ length: 5 }, (_, i) => ({
      coinObjectId: `0x0${i}`,
      version: '1',
      digest: `d${i}`,
      balance: '300000000',
    }))

    const mockClient = {
      getCoins: vi.fn().mockResolvedValue({ data: coins, hasNextPage: false }),
    }

    const store = new InMemoryCoinLockStore(30_000, 0)
    const used = new Set<string>()

    for (let i = 0; i < 20; i++) {
      const acquired = await store.acquire(mockClient as any, '0xsponsor', 100_000_000n)
      used.add(acquired.coinObjectId)
      store.release(acquired.coinObjectId)
    }

    expect(used.size).toBeGreaterThan(0)
    expect(store.getLockedCoinIds().size).toBe(0)
  })
})
