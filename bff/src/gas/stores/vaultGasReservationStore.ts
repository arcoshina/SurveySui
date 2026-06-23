import { SqliteVaultGasReservationStore } from './sqliteVaultGasReservationStore.js'
import { hasD1 } from '../../d1.js'

/** vault 補償槽預留 TTL，與 pass 預留一致（涵蓋 /execute 廣播到鏈上反映的窗口）。 */
export const VAULT_GAS_RESERVATION_TTL_MS = 300_000

export interface VaultGasReservationStore {
  /**
   * 原子預留一個 vault 補償槽：當 在途未過期預留數 < availableSlots 時插入並回 true，
   * 否則回 false（vault 預算已被鏈上扣款 + 在途併發佔滿 → 該筆改走平台代付）。
   * availableSlots = floor(gas_balance / gas_compensation_amount)，已含鏈上已扣款。
   */
  tryReserveSlot(vaultId: string, availableSlots: number, now?: number): Promise<boolean>
  /** 廣播確認後釋放在途預留，讓鏈上 gas_balance 的下降接手計數。 */
  release(vaultId: string, n: number, now?: number): Promise<void>
  pruneExpired(now?: number): Promise<void>
  clearAll(): Promise<void>
}

export class InMemoryVaultGasReservationStore implements VaultGasReservationStore {
  private rows: Array<{ vaultId: string; createdAt: number }> = []

  async tryReserveSlot(vaultId: string, availableSlots: number, now = Date.now()): Promise<boolean> {
    await this.pruneExpired(now)
    if (availableSlots <= 0) return false
    const pending = this.rows.filter(
      (r) => r.vaultId === vaultId && now - r.createdAt < VAULT_GAS_RESERVATION_TTL_MS
    ).length
    if (pending >= availableSlots) return false
    this.rows.push({ vaultId, createdAt: now })
    return true
  }

  async release(vaultId: string, n: number, now = Date.now()): Promise<void> {
    if (n <= 0) return
    const live = this.rows
      .filter((r) => r.vaultId === vaultId && now - r.createdAt < VAULT_GAS_RESERVATION_TTL_MS)
      .sort((a, b) => a.createdAt - b.createdAt)
    // 以物件參照當刪除鍵，避免 createdAt 毫秒碰撞時誤刪多筆（同 passReservationStore）。
    const drop = new Set(live.slice(0, n))
    this.rows = this.rows.filter((r) => !drop.has(r))
  }

  async pruneExpired(now = Date.now()): Promise<void> {
    this.rows = this.rows.filter((r) => now - r.createdAt < VAULT_GAS_RESERVATION_TTL_MS)
  }

  async clearAll(): Promise<void> {
    this.rows = []
  }
}

let store: VaultGasReservationStore | null = null
let testStore: InMemoryVaultGasReservationStore | null = null

export function setVaultGasReservationStoreForTests(memory: InMemoryVaultGasReservationStore): void {
  testStore = memory
  store = memory
}

export function getVaultGasReservationStore(): VaultGasReservationStore {
  if (!store) store = new SqliteVaultGasReservationStore()
  return store
}

export function __resetVaultGasReservationStore(): void {
  if (testStore) {
    void testStore.clearAll()
    return
  }
  // 純測試 helper：D1 未綁定時無資料可清，略過以免 floating rejection。
  if (hasD1()) void getVaultGasReservationStore().clearAll().catch(() => {})
}
