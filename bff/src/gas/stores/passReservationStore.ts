import { SqlitePassReservationStore } from './sqlitePassReservationStore.js'
import { normalizeAddress } from '@surveysui/gas-station-core'

export const RESERVATION_TTL_MS = 300_000

export interface PassReservationStore {
  countLive(senderAddress: string, sponsorAddress: string, now?: number): Promise<number>
  add(senderAddress: string, sponsorAddress: string, now?: number): Promise<void>
  /** Atomically reserve one slot if onChainBaseline + live pending < maxLimit. */
  tryReserveIfUnderLimit(
    senderAddress: string,
    sponsorAddress: string,
    onChainBaseline: number,
    maxLimit: number,
    now?: number
  ): Promise<boolean>
  releaseOldest(senderAddress: string, sponsorAddress: string, n: number, now?: number): Promise<void>
  pruneExpired(now?: number): Promise<void>
  clearAll(): Promise<void>
}

export class InMemoryPassReservationStore implements PassReservationStore {
  private rows: Array<{ sender: string; sponsor: string; createdAt: number }> = []

  async countLive(senderAddress: string, sponsorAddress: string, now = Date.now()): Promise<number> {
    await this.pruneExpired(now)
    const sender = normalizeAddress(senderAddress)
    const sponsor = normalizeAddress(sponsorAddress)
    return this.rows.filter(
      (r) => r.sender === sender && r.sponsor === sponsor && now - r.createdAt < RESERVATION_TTL_MS
    ).length
  }

  async add(senderAddress: string, sponsorAddress: string, now = Date.now()): Promise<void> {
    this.rows.push({
      sender: normalizeAddress(senderAddress),
      sponsor: normalizeAddress(sponsorAddress),
      createdAt: now,
    })
  }

  async tryReserveIfUnderLimit(
    senderAddress: string,
    sponsorAddress: string,
    onChainBaseline: number,
    maxLimit: number,
    now = Date.now()
  ): Promise<boolean> {
    await this.pruneExpired(now)
    const sender = normalizeAddress(senderAddress)
    const sponsor = normalizeAddress(sponsorAddress)
    const pending = this.rows.filter(
      (r) => r.sender === sender && r.sponsor === sponsor && now - r.createdAt < RESERVATION_TTL_MS
    ).length
    if (onChainBaseline + pending >= maxLimit) return false
    this.rows.push({ sender, sponsor, createdAt: now })
    return true
  }

  async releaseOldest(
    senderAddress: string,
    sponsorAddress: string,
    n: number,
    now = Date.now()
  ): Promise<void> {
    if (n <= 0) return
    const sender = normalizeAddress(senderAddress)
    const sponsor = normalizeAddress(sponsorAddress)
    const live = this.rows
      .filter(
        (r) => r.sender === sender && r.sponsor === sponsor && now - r.createdAt < RESERVATION_TTL_MS
      )
      .sort((a, b) => a.createdAt - b.createdAt)
    // 以物件參照當刪除鍵，避免 createdAt 毫秒碰撞時誤刪多筆（CodeReview_R0P1 M5）
    const drop = new Set(live.slice(0, n))
    this.rows = this.rows.filter((r) => !drop.has(r))
  }

  async pruneExpired(now = Date.now()): Promise<void> {
    this.rows = this.rows.filter((r) => now - r.createdAt < RESERVATION_TTL_MS)
  }

  async clearAll(): Promise<void> {
    this.rows = []
  }
}

let store: PassReservationStore | null = null
let testStore: InMemoryPassReservationStore | null = null

export function setPassReservationStoreForTests(memory: InMemoryPassReservationStore): void {
  testStore = memory
  store = memory
}

export function getPassReservationStore(): PassReservationStore {
  if (!store) store = new SqlitePassReservationStore()
  return store
}

export function __resetPassReservationStore(): void {
  if (testStore) {
    void testStore.clearAll()
    return
  }
  void getPassReservationStore().clearAll()
}
