import type { SuiClient, CoinStruct } from '@mysten/sui/client'
import type { AcquiredGasCoin, CoinLockStore } from './types.js'
import type { GasConfig } from './gasConfig.js'

type LockEntry = { expiresAt: number }

/**
 * In-memory per-coin lock for sponsor gas payment selection.
 * Used for local BFF dev; production serializes via Durable Object.
 */
export class InMemoryCoinLockStore implements CoinLockStore {
  private readonly locks = new Map<string, LockEntry>()
  private lastInventoryFetch = 0
  private cachedCoins: CoinStruct[] = []

  constructor(
    private readonly lockTtlMs: number,
    private readonly acquireRetries: number,
    private readonly inventoryRefreshMs: number = 5_000
  ) {}

  static fromGasConfig(config: GasConfig): InMemoryCoinLockStore {
    return new InMemoryCoinLockStore(
      config.coinQueueLockTtlMs,
      config.coinQueueAcquireRetries,
      config.coinInventoryRefreshMs
    )
  }

  isLocked(coinObjectId: string, now = Date.now()): boolean {
    this.pruneExpired(now)
    const entry = this.locks.get(coinObjectId)
    return entry !== undefined && entry.expiresAt > now
  }

  getLockedCoinIds(now = Date.now()): Set<string> {
    this.pruneExpired(now)
    const ids = new Set<string>()
    for (const [id, entry] of this.locks) {
      if (entry.expiresAt > now) ids.add(id)
    }
    return ids
  }

  release(coinObjectId: string): void {
    this.locks.delete(coinObjectId)
  }

  private lock(coinObjectId: string, now = Date.now()): void {
    this.locks.set(coinObjectId, { expiresAt: now + this.lockTtlMs })
  }

  private pruneExpired(now: number): void {
    for (const [id, entry] of this.locks) {
      if (entry.expiresAt <= now) this.locks.delete(id)
    }
  }

  async fetchAllCoins(suiClient: SuiClient, owner: string, force = false): Promise<CoinStruct[]> {
    const now = Date.now()
    if (!force && this.cachedCoins.length > 0 && now - this.lastInventoryFetch < this.inventoryRefreshMs) {
      return this.cachedCoins
    }
    const all: CoinStruct[] = []
    let cursor: string | null | undefined = undefined
    do {
      const res = await suiClient.getCoins({
        owner,
        coinType: '0x2::sui::SUI',
        cursor,
      })
      all.push(...res.data)
      cursor = res.hasNextPage ? res.nextCursor : null
    } while (cursor)
    this.cachedCoins = all
    this.lastInventoryFetch = now
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
        lastError = new Error(
          `No unlocked SUI coin with balance >= ${minBalanceMist} MIST for sponsor ${owner}`
        )
        if (attempt < this.acquireRetries) {
          await sleep(backoffMs * (attempt + 1))
          continue
        }
        const err = new Error('sponsor_coin_unavailable')
        ;(err as Error & { cause?: Error }).cause = lastError
        throw err
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

/** @deprecated Use InMemoryCoinLockStore */
export const SponsorCoinQueue = InMemoryCoinLockStore

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
