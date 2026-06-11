import { getDbClient } from '../../security/db.js'
import { normalizeAddress } from '@surveysui/gas-station-core'

export interface PassSponsorOnchainCacheEntry {
  count: number
  fetchedAt: number
}

export interface PassSponsorOnchainCacheKey {
  senderAddress: string
  sponsorAddress: string
  packageId?: string | null
  sinceMs?: number
}

export interface PassSponsorOnchainCacheStore {
  get(key: PassSponsorOnchainCacheKey): Promise<PassSponsorOnchainCacheEntry | null>
  upsert(key: PassSponsorOnchainCacheKey, count: number, fetchedAt: number): Promise<void>
  clearAll(): Promise<void>
}

function packageScope(packageId?: string | null): string {
  return packageId ? normalizeAddress(packageId) : 'all'
}

function sinceMsValue(sinceMs?: number): number {
  return sinceMs && sinceMs > 0 ? sinceMs : 0
}

function rowKey(key: PassSponsorOnchainCacheKey) {
  return {
    sender: normalizeAddress(key.senderAddress),
    sponsor: normalizeAddress(key.sponsorAddress),
    packageScope: packageScope(key.packageId),
    sinceMs: sinceMsValue(key.sinceMs),
  }
}

export class SqlitePassSponsorOnchainCacheStore implements PassSponsorOnchainCacheStore {
  async get(key: PassSponsorOnchainCacheKey): Promise<PassSponsorOnchainCacheEntry | null> {
    const db = getDbClient()
    const { sender, sponsor, packageScope: pkg, sinceMs } = rowKey(key)
    const result = await db.execute({
      sql: `SELECT count, fetched_at FROM pass_sponsor_onchain_cache
            WHERE sender_address = ? AND sponsor_address = ? AND package_scope = ? AND since_ms = ?`,
      args: [sender, sponsor, pkg, sinceMs],
    })
    if (result.rows.length === 0) return null
    const row = result.rows[0] as unknown as { count: number | bigint | string; fetched_at: number | bigint | string }
    return {
      count: Number(row.count ?? 0),
      fetchedAt: Number(row.fetched_at ?? 0),
    }
  }

  async upsert(key: PassSponsorOnchainCacheKey, count: number, fetchedAt: number): Promise<void> {
    const db = getDbClient()
    const { sender, sponsor, packageScope: pkg, sinceMs } = rowKey(key)
    await db.execute({
      sql: `INSERT INTO pass_sponsor_onchain_cache
            (sender_address, sponsor_address, package_scope, since_ms, count, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(sender_address, sponsor_address, package_scope, since_ms)
            DO UPDATE SET count = excluded.count, fetched_at = excluded.fetched_at`,
      args: [sender, sponsor, pkg, sinceMs, count, fetchedAt],
    })
  }

  async clearAll(): Promise<void> {
    const db = getDbClient()
    await db.execute(`DELETE FROM pass_sponsor_onchain_cache`)
  }
}

export class InMemoryPassSponsorOnchainCacheStore implements PassSponsorOnchainCacheStore {
  private entries = new Map<string, PassSponsorOnchainCacheEntry>()

  private storageKey(key: PassSponsorOnchainCacheKey): string {
    const { sender, sponsor, packageScope: pkg, sinceMs } = rowKey(key)
    return `${sender}|${sponsor}|${pkg}|${sinceMs}`
  }

  async get(key: PassSponsorOnchainCacheKey): Promise<PassSponsorOnchainCacheEntry | null> {
    return this.entries.get(this.storageKey(key)) ?? null
  }

  async upsert(key: PassSponsorOnchainCacheKey, count: number, fetchedAt: number): Promise<void> {
    this.entries.set(this.storageKey(key), { count, fetchedAt })
  }

  async clearAll(): Promise<void> {
    this.entries.clear()
  }
}

let store: PassSponsorOnchainCacheStore | null = null
let testStore: InMemoryPassSponsorOnchainCacheStore | null = null

export function setPassSponsorOnchainCacheStoreForTests(
  memory: InMemoryPassSponsorOnchainCacheStore
): void {
  testStore = memory
  store = memory
}

export function getPassSponsorOnchainCacheStore(): PassSponsorOnchainCacheStore {
  if (!store) store = new SqlitePassSponsorOnchainCacheStore()
  return store
}

export function __resetPassSponsorOnchainCacheStore(): void {
  if (testStore) {
    void testStore.clearAll()
    return
  }
  void getPassSponsorOnchainCacheStore().clearAll()
}
