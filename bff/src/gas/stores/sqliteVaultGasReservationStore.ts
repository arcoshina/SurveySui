import { getDbClient } from '../../security/db.js'
import type { VaultGasReservationStore } from './vaultGasReservationStore.js'
import { VAULT_GAS_RESERVATION_TTL_MS } from './vaultGasReservationStore.js'

export class SqliteVaultGasReservationStore implements VaultGasReservationStore {
  async tryReserveSlot(vaultId: string, availableSlots: number, now = Date.now()): Promise<boolean> {
    if (availableSlots <= 0) return false
    const db = getDbClient()
    const minCreated = now - VAULT_GAS_RESERVATION_TTL_MS

    // 單句原子預留：D1/SQLite 全域序列化寫入，整句（含 live-count 子查詢 + 條件）為一個
    // 原子單位（與 SqlitePassReservationStore 同模式）。僅當 未過期預留數 < availableSlots
    // 時才插入；以 created_at > minCreated 過濾過期列（實體清理交給 pruneExpired/cron）。
    const res = await db.execute({
      sql: `INSERT INTO vault_gas_reservation (vault_id, created_at)
            SELECT ?, ?
            WHERE (
              SELECT COUNT(*) FROM vault_gas_reservation
              WHERE vault_id = ? AND created_at > ?
            ) < ?`,
      args: [vaultId, now, vaultId, minCreated, availableSlots],
    })
    return Number(res.rowsAffected ?? 0) > 0
  }

  async release(vaultId: string, n: number, now = Date.now()): Promise<void> {
    if (n <= 0) return
    const db = getDbClient()
    const minCreated = now - VAULT_GAS_RESERVATION_TTL_MS
    // 單句刪除最舊 n 筆未過期預留（消除 N+1）：子查詢以 created_at ASC + LIMIT 選列。
    await db.execute({
      sql: `DELETE FROM vault_gas_reservation
            WHERE rowid IN (
              SELECT rowid FROM vault_gas_reservation
              WHERE vault_id = ? AND created_at > ?
              ORDER BY created_at ASC LIMIT ?
            )`,
      args: [vaultId, minCreated, n],
    })
  }

  async pruneExpired(now = Date.now()): Promise<void> {
    const db = getDbClient()
    await db.execute({
      sql: `DELETE FROM vault_gas_reservation WHERE created_at <= ?`,
      args: [now - VAULT_GAS_RESERVATION_TTL_MS],
    })
  }

  async clearAll(): Promise<void> {
    const db = getDbClient()
    await db.execute(`DELETE FROM vault_gas_reservation`)
  }
}
