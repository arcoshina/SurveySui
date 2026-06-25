// 即時票券槽預留（一次性票券 / 匿名投票預留機制）。
// 此機制目前 fail-closed、/api/ticket/issue 未掛載（見 app.ts）；保留並維護其原子預留，
// 使未來匿名投票方案啟用時無 M5 併發超賣競態。
import { normalizeAddress } from '@surveysui/gas-station-core'
import { SqliteRealtimeTicketSlotStore } from './sqliteRealtimeTicketSlotStore.js'
import { hasD1 } from '../../d1.js'

export interface RealtimeTicketSlotStore {
  /**
   * 原子預留 slot：當 (wallet, vaultId) 無未過期 slot（或既有 slot 已過期可回收）時寫入並回 true，
   * 否則回 false（已有 live slot → 視為已簽發）。單句寫入即原子單位，杜絕 check-then-insert 競態（M5）。
   */
  tryReserve(wallet: string, vaultId: string, issuedAt: number, expiresAt: number, now?: number): Promise<boolean>
  /** 簽票失敗時釋放預留（依 PK 刪除），讓使用者可立即重試。 */
  release(wallet: string, vaultId: string): Promise<void>
  pruneExpired(now?: number): Promise<void>
  clearAll(): Promise<void>
}

export class InMemoryRealtimeTicketSlotStore implements RealtimeTicketSlotStore {
  private rows = new Map<string, { issuedAt: number; expiresAt: number }>()

  private key(wallet: string, vaultId: string): string {
    return `${normalizeAddress(wallet)}|${normalizeAddress(vaultId)}`
  }

  async tryReserve(
    wallet: string,
    vaultId: string,
    issuedAt: number,
    expiresAt: number,
    now = Date.now()
  ): Promise<boolean> {
    const key = this.key(wallet, vaultId)
    const existing = this.rows.get(key)
    // 既有且仍未過期 → 已有 live slot，拒絕。
    if (existing && existing.expiresAt > now) return false
    this.rows.set(key, { issuedAt, expiresAt })
    return true
  }

  async release(wallet: string, vaultId: string): Promise<void> {
    this.rows.delete(this.key(wallet, vaultId))
  }

  async pruneExpired(now = Date.now()): Promise<void> {
    for (const [key, row] of this.rows) {
      if (row.expiresAt <= now) this.rows.delete(key)
    }
  }

  async clearAll(): Promise<void> {
    this.rows.clear()
  }
}

let store: RealtimeTicketSlotStore | null = null
let testStore: InMemoryRealtimeTicketSlotStore | null = null

export function setRealtimeTicketSlotStoreForTests(memory: InMemoryRealtimeTicketSlotStore): void {
  testStore = memory
  store = memory
}

export function getRealtimeTicketSlotStore(): RealtimeTicketSlotStore {
  if (!store) store = new SqliteRealtimeTicketSlotStore()
  return store
}

export function __resetRealtimeTicketSlotStore(): void {
  if (testStore) {
    void testStore.clearAll()
    return
  }
  // 純測試 helper：D1 未綁定時無資料可清，略過以免 floating rejection。
  if (hasD1()) void getRealtimeTicketSlotStore().clearAll().catch(() => {})
}
