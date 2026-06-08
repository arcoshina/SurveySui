import { describe, it, expect } from 'vitest'
import { InMemoryCoinLockStore } from '@surveysui/gas-station-core'

describe('Gas station serialization (in-memory stand-in)', () => {
  it('serial acquire picks different coins when run sequentially', async () => {
    const mockClient = {
      getCoins: async () => ({
        data: [
          { coinObjectId: '0x01', version: '1', digest: 'd1', balance: '200000000' },
          { coinObjectId: '0x02', version: '1', digest: 'd2', balance: '180000000' },
        ],
        hasNextPage: false,
      }),
    }

    const store = new InMemoryCoinLockStore(30_000, 0)
    const first = await store.acquire(mockClient as any, '0xsponsor', 100_000_000n)
    const second = await store.acquire(mockClient as any, '0xsponsor', 100_000_000n)
    expect(first.coinObjectId).not.toBe(second.coinObjectId)
    store.release(first.coinObjectId)
    store.release(second.coinObjectId)
  })
})
