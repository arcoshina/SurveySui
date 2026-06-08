import type { DurableObjectStorage } from '@cloudflare/workers-types'
import type { SuiClient, CoinStruct } from '@mysten/sui/client'
import type { AcquiredGasCoin, CoinLockStore } from '@surveysui/gas-station-core'

type LockEntry = { expiresAt: number }

type StoredState = {
  locks: Record<string, LockEntry>
  lastInventoryFetch: number
  cachedCoins: CoinStruct[]
}

export class DurableObjectCoinLockStore implements CoinLockStore {
  private state: StoredState = { locks: {}, lastInventoryFetch: 0, cachedCoins: [] }

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly lockTtlMs: number,
    private readonly acquireRetries: number,
    private readonly inventoryRefreshMs: number
  ) {}

  async load(): Promise<void> {
    const stored = await this.storage.get<StoredState>('coinState')
    if (stored) this.state = stored
  }

  private async persist(): Promise<void> {
    await this.storage.put('coinState', this.state)
  }

  isLocked(coinObjectId: string, now = Date.now()): boolean {
    this.pruneExpired(now)
    const entry = this.state.locks[coinObjectId]
    return entry !== undefined && entry.expiresAt > now
  }

  getLockedCoinIds(now = Date.now()): Set<string> {
    this.pruneExpired(now)
    const ids = new Set<string>()
    for (const [id, entry] of Object.entries(this.state.locks)) {
      if (entry.expiresAt > now) ids.add(id)
    }
    return ids
  }

  release(coinObjectId: string): void {
    delete this.state.locks[coinObjectId]
    void this.persist()
  }

  private lock(coinObjectId: string, now = Date.now()): void {
    this.state.locks[coinObjectId] = { expiresAt: now + this.lockTtlMs }
    void this.persist()
  }

  private pruneExpired(now: number): void {
    for (const [id, entry] of Object.entries(this.state.locks)) {
      if (entry.expiresAt <= now) delete this.state.locks[id]
    }
  }

  private async fetchAllCoins(
    suiClient: SuiClient,
    owner: string,
    force = false
  ): Promise<CoinStruct[]> {
    const now = Date.now()
    if (
      !force &&
      this.state.cachedCoins.length > 0 &&
      now - this.state.lastInventoryFetch < this.inventoryRefreshMs
    ) {
      return this.state.cachedCoins
    }
    const all: CoinStruct[] = []
    let cursor: string | null | undefined = undefined
    do {
      const res = await suiClient.getCoins({ owner, coinType: '0x2::sui::SUI', cursor })
      all.push(...res.data)
      cursor = res.hasNextPage ? res.nextCursor : null
    } while (cursor)
    this.state.cachedCoins = all
    this.state.lastInventoryFetch = now
    await this.persist()
    return all
  }

  private pickCoin(coins: CoinStruct[], minBalanceMist: bigint, now: number): CoinStruct | null {
    const eligible = coins
      .filter((c) => !this.isLocked(c.coinObjectId, now))
      .filter((c) => BigInt(c.balance) >= minBalanceMist)
      .sort((a, b) => {
        const balA = BigInt(a.balance)
        const balB = BigInt(b.balance)
        return balA > balB ? -1 : balA < balB ? 1 : 0
      })
    return eligible[0] ?? null
  }

  async acquire(
    suiClient: SuiClient,
    owner: string,
    minBalanceMist: bigint
  ): Promise<AcquiredGasCoin> {
    const backoffMs = 50
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.acquireRetries; attempt++) {
      const now = Date.now()
      this.pruneExpired(now)

      let coins: CoinStruct[]
      try {
        coins = await this.fetchAllCoins(suiClient, owner, attempt > 0)
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (attempt < this.acquireRetries) {
          await sleep(backoffMs * (attempt + 1))
          continue
        }
        throw lastError
      }

      const picked = this.pickCoin(coins, minBalanceMist, now)
      if (!picked) {
        lastError = new Error('sponsor_coin_unavailable')
        if (attempt < this.acquireRetries) {
          await sleep(backoffMs * (attempt + 1))
          continue
        }
        throw lastError
      }

      this.lock(picked.coinObjectId, now)
      return {
        coinObjectId: picked.coinObjectId,
        version: picked.version,
        digest: picked.digest,
        balance: BigInt(picked.balance),
      }
    }

    throw lastError ?? new Error('sponsor_coin_unavailable')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
