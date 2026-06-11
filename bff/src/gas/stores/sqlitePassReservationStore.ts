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
    const expireBefore = now - RESERVATION_TTL_MS

    await db.execute('BEGIN IMMEDIATE')
    try {
      await db.execute({
        sql: `DELETE FROM pass_sponsor_reservation WHERE created_at <= ?`,
        args: [expireBefore],
      })
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) AS c FROM pass_sponsor_reservation
              WHERE sender_address = ? AND sponsor_address = ? AND created_at > ?`,
        args: [sender, sponsor, minCreated],
      })
      const row = countResult.rows[0] as unknown as { c: number | bigint }
      const pending = Number(row?.c ?? 0)
      if (onChainBaseline + pending >= maxLimit) {
        await db.execute('ROLLBACK')
        return false
      }
      await db.execute({
        sql: `INSERT INTO pass_sponsor_reservation (sender_address, sponsor_address, created_at)
              VALUES (?, ?, ?)`,
        args: [sender, sponsor, now],
      })
      await db.execute('COMMIT')
      return true
    } catch (err) {
      try {
        await db.execute('ROLLBACK')
      } catch {
        /* ignore rollback failure */
      }
      throw err
    }
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
