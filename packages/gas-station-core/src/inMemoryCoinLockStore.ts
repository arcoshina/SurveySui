import type { SuiClient, CoinStruct } from '@mysten/sui/client'
import type { AcquiredGasCoin, CoinLockStore } from './types.js'
import type { GasConfig } from './gasConfig.js'
import { pickCoin, fetchSuiCoins } from './coinSelection.js'

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

  // 介面為 async（DO 版需 await persist）；InMemory 單程序記憶體變更同步立即生效、無持久化。
  async release(coinObjectId: string): Promise<void> {
    this.locks.delete(coinObjectId)
  }

  async invalidateCoin(coinObjectId: string): Promise<void> {
    this.locks.delete(coinObjectId)
    this.cachedCoins = this.cachedCoins.filter((c) => c.coinObjectId !== coinObjectId)
    this.lastInventoryFetch = 0
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
    const all = await fetchSuiCoins(suiClient, owner)
    this.cachedCoins = all
    this.lastInventoryFetch = now
    return all
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

      const picked = pickCoin(coins, (id, n) => this.isLocked(id, n), minBalanceMist, now)
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
