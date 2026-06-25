import { describe, it, expect } from 'vitest'
import { DurableObjectCoinLockStore } from '../src/durableObjectCoinLockStore.js'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Storage 模擬：put() 回傳「延遲解析」的 promise，須手動 flushPuts() 才完成。
 * 用來證明 lock store 的方法在 storage.put 落盤前不會 resolve——
 * 即不依賴 Cloudflare DO output gate 的隱性保證（V4b 次要觀察 1）。
 */
function deferredStorage() {
  const data = new Map<string, unknown>()
  const pending: Array<() => void> = []
  return {
    data,
    flushPuts() {
      while (pending.length) pending.shift()!()
    },
    storage: {
      get: async (key: string) => data.get(key),
      put: (key: string, value: unknown) =>
        new Promise<void>((resolve) => {
          pending.push(() => {
            data.set(key, value)
            resolve()
          })
        }),
      delete: async (key: string) => {
        data.delete(key)
      },
    } as unknown as ConstructorParameters<typeof DurableObjectCoinLockStore>[0],
  }
}

function lockState(store: DurableObjectCoinLockStore): Record<string, { expiresAt: number }> {
  return (store as unknown as { state: { locks: Record<string, { expiresAt: number }> } }).state.locks
}

describe('DurableObjectCoinLockStore 顯式持久化（不依賴 output gate）', () => {
  it('acquire 在鎖落盤前不 resolve', async () => {
    const s = deferredStorage()
    const store = new DurableObjectCoinLockStore(s.storage, 60_000, 0, 5_000)
    const coin = { coinObjectId: '0xcoin', version: '1', digest: 'd', balance: '1000000000' }
    const suiClient = {
      getCoins: async () => ({ data: [coin], hasNextPage: false, nextCursor: null }),
    }

    let resolved = false
    const p = store.acquire(suiClient as never, '0xsponsor', 100_000_000n).then((r) => {
      resolved = true
      return r
    })

    await tick()
    expect(resolved).toBe(false) // 卡在未完成的 put 上

    for (let i = 0; i < 5 && !resolved; i++) {
      s.flushPuts()
      await tick()
    }

    const acquired = await p
    expect(resolved).toBe(true)
    expect(acquired.coinObjectId).toBe('0xcoin')
    expect((s.data.get('coinState') as { locks: Record<string, unknown> }).locks['0xcoin']).toBeDefined()
  })

  it('release 在移除鎖落盤前不 resolve', async () => {
    const s = deferredStorage()
    const store = new DurableObjectCoinLockStore(s.storage, 60_000, 0, 5_000)
    lockState(store)['0xcoin'] = { expiresAt: Date.now() + 999_999 }

    let resolved = false
    const p = store.release('0xcoin').then(() => {
      resolved = true
    })

    await tick()
    expect(resolved).toBe(false)

    s.flushPuts()
    await p
    expect(resolved).toBe(true)
    expect((s.data.get('coinState') as { locks: Record<string, unknown> }).locks['0xcoin']).toBeUndefined()
  })

  it('invalidateCoin 在落盤前不 resolve', async () => {
    const s = deferredStorage()
    const store = new DurableObjectCoinLockStore(s.storage, 60_000, 0, 5_000)
    lockState(store)['0xcoin'] = { expiresAt: Date.now() + 999_999 }

    let resolved = false
    const p = store.invalidateCoin('0xcoin').then(() => {
      resolved = true
    })

    await tick()
    expect(resolved).toBe(false)

    s.flushPuts()
    await p
    expect(resolved).toBe(true)
    expect((s.data.get('coinState') as { locks: Record<string, unknown> }).locks['0xcoin']).toBeUndefined()
  })
})
