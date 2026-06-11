import type { WalletSponsorRateLimitStore } from '@surveysui/gas-station-core'
import { getDbClient } from '../../security/db.js'

export class SqliteWalletSponsorRateLimitStore implements WalletSponsorRateLimitStore {
  async checkAndIncrement(
    senderAddress: string,
    maxPerWindow: number,
    windowMs: number,
    now = Date.now()
  ) {
    const db = getDbClient()
    const addr = senderAddress.toLowerCase()
    const windowStart = Math.floor(now / windowMs) * windowMs

    await db.execute({
      sql: `INSERT INTO wallet_sponsor_rate (sender_address, window_start, count) VALUES (?, ?, 0)
            ON CONFLICT(sender_address, window_start) DO NOTHING`,
      args: [addr, windowStart],
    })

    const updated = await db.execute({
      sql: `UPDATE wallet_sponsor_rate SET count = count + 1
            WHERE sender_address = ? AND window_start = ? AND count < ?`,
      args: [addr, windowStart, maxPerWindow],
    })

    const result = await db.execute({
      sql: `SELECT count FROM wallet_sponsor_rate WHERE sender_address = ? AND window_start = ?`,
      args: [addr, windowStart],
    })
    const count =
      result.rows.length > 0
        ? Number((result.rows[0] as unknown as { count: number }).count ?? 0)
        : 0

    if (Number(updated.rowsAffected ?? 0) === 0) {
      return { allowed: false, retryAfterMs: Math.max(0, windowStart + windowMs - now), count }
    }

    return { allowed: true, count }
  }
}

let store: SqliteWalletSponsorRateLimitStore | null = null

export function getWalletSponsorRateLimitStore(): WalletSponsorRateLimitStore {
  if (!store) store = new SqliteWalletSponsorRateLimitStore()
  return store
}
