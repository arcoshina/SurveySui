import { getDbClient } from '../../security/db.js'
import type { PassReservationStore } from './passReservationStore.js'
import { RESERVATION_TTL_MS } from './passReservationStore.js'
import { normalizeAddress } from '@surveysui/gas-station-core'

export class SqlitePassReservationStore implements PassReservationStore {
  async countLive(senderAddress: string, sponsorAddress: string, now = Date.now()): Promise<number> {
    const db = getDbClient()
    const minCreated = now - RESERVATION_TTL_MS
    const result = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM pass_sponsor_reservation
            WHERE sender_address = ? AND sponsor_address = ? AND created_at > ?`,
      args: [normalizeAddress(senderAddress), normalizeAddress(sponsorAddress), minCreated],
    })
    const row = result.rows[0] as unknown as { c: number | bigint }
    return Number(row?.c ?? 0)
  }

  async add(senderAddress: string, sponsorAddress: string, now = Date.now()): Promise<void> {
    const db = getDbClient()
    await db.execute({
      sql: `INSERT INTO pass_sponsor_reservation (sender_address, sponsor_address, created_at)
            VALUES (?, ?, ?)`,
      args: [normalizeAddress(senderAddress), normalizeAddress(sponsorAddress), now],
    })
  }

  async tryReserveIfUnderLimit(
    senderAddress: string,
    sponsorAddress: string,
    onChainBaseline: number,
    maxLimit: number,
    now = Date.now()
  ): Promise<boolean> {
    const db = getDbClient()
    const sender = normalizeAddress(senderAddress)
    const sponsor = normalizeAddress(sponsorAddress)
    const minCreated = now - RESERVATION_TTL_MS

    // 單句原子預留：D1/SQLite 全域序列化寫入，整句（含 live-count 子查詢 + 條件）為一個
    // 原子單位，無需 app 級鎖或 BEGIN IMMEDIATE（原 SQLite 版兩者都要，是因 Node 事件迴圈
    // 會在 await 間交錯；Workers 多 isolate 並發下，正確性改由 D1 的寫入序列化保證）。
    // 僅當 onChainBaseline + 未過期預留數 < maxLimit 時才插入；以 created_at > minCreated
    // 過濾過期列（實體清理交給 pruneExpired，由 cron 觸發）。
    const res = await db.execute({
      sql: `INSERT INTO pass_sponsor_reservation (sender_address, sponsor_address, created_at)
            SELECT ?, ?, ?
            WHERE ? + (
              SELECT COUNT(*) FROM pass_sponsor_reservation
              WHERE sender_address = ? AND sponsor_address = ? AND created_at > ?
            ) < ?`,
      args: [sender, sponsor, now, onChainBaseline, sender, sponsor, minCreated, maxLimit],
    })
    return Number(res.rowsAffected ?? 0) > 0
  }

  async releaseOldest(
    senderAddress: string,
    sponsorAddress: string,
    n: number,
    now = Date.now()
  ): Promise<void> {
    if (n <= 0) return
    const db = getDbClient()
    const sender = normalizeAddress(senderAddress)
    const sponsor = normalizeAddress(sponsorAddress)
    const minCreated = now - RESERVATION_TTL_MS
    const rows = await db.execute({
      sql: `SELECT rowid FROM pass_sponsor_reservation
            WHERE sender_address = ? AND sponsor_address = ? AND created_at > ?
            ORDER BY created_at ASC LIMIT ?`,
      args: [sender, sponsor, minCreated, n],
    })
    for (const row of rows.rows) {
      const rowid = (row as unknown as { rowid: number }).rowid
      await db.execute({
        sql: `DELETE FROM pass_sponsor_reservation WHERE rowid = ?`,
        args: [rowid],
      })
    }
  }

  async pruneExpired(now = Date.now()): Promise<void> {
    const db = getDbClient()
    await db.execute({
      sql: `DELETE FROM pass_sponsor_reservation WHERE created_at <= ?`,
      args: [now - RESERVATION_TTL_MS],
    })
  }

  async clearAll(): Promise<void> {
    const db = getDbClient()
    await db.execute(`DELETE FROM pass_sponsor_reservation`)
  }
}
