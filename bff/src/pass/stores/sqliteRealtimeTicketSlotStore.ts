import { getDbClient } from '../../security/db.js'
import { normalizeAddress } from '@surveysui/gas-station-core'
import type { RealtimeTicketSlotStore } from './realtimeTicketSlotStore.js'

export class SqliteRealtimeTicketSlotStore implements RealtimeTicketSlotStore {
  async tryReserve(
    wallet: string,
    vaultId: string,
    issuedAt: number,
    expiresAt: number,
    now = Date.now()
  ): Promise<boolean> {
    const db = getDbClient()
    // 單句原子預留（沿用既有 PRIMARY KEY (wallet_address, vault_id)，無需遷移）：
    // D1/SQLite 全域序列化寫入，整句為一個原子單位。無列 → 插入(changes=1)；
    // 既有列已過期 → DO UPDATE 覆寫(changes=1)；既有列仍 live → WHERE 為偽，不動(changes=0)。
    // 取代舊 hasLiveTicketSlot + INSERT OR REPLACE 的 check-then-insert 競態（M5）。
    const res = await db.execute({
      sql: `INSERT INTO realtime_ticket_slot (wallet_address, vault_id, issued_at, expires_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(wallet_address, vault_id) DO UPDATE SET
              issued_at = excluded.issued_at,
              expires_at = excluded.expires_at
            WHERE realtime_ticket_slot.expires_at <= ?`,
      args: [normalizeAddress(wallet), normalizeAddress(vaultId), issuedAt, expiresAt, now],
    })
    return Number(res.rowsAffected ?? 0) > 0
  }

  async release(wallet: string, vaultId: string): Promise<void> {
    const db = getDbClient()
    await db.execute({
      sql: `DELETE FROM realtime_ticket_slot WHERE wallet_address = ? AND vault_id = ?`,
      args: [normalizeAddress(wallet), normalizeAddress(vaultId)],
    })
  }

  async pruneExpired(now = Date.now()): Promise<void> {
    const db = getDbClient()
    await db.execute({
      sql: `DELETE FROM realtime_ticket_slot WHERE expires_at <= ?`,
      args: [now],
    })
  }

  async clearAll(): Promise<void> {
    const db = getDbClient()
    await db.execute(`DELETE FROM realtime_ticket_slot`)
  }
}
