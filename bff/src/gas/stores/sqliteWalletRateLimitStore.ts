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

    const result = await db.execute({
      sql: `SELECT count FROM wallet_sponsor_rate WHERE sender_address = ? AND window_start = ?`,
      args: [addr, windowStart],
    })

    const current =
      result.rows.length > 0
        ? Number((result.rows[0] as unknown as { count: number }).count ?? 0)
        : 0

    if (current >= maxPerWindow) {
      return { allowed: false, retryAfterMs: Math.max(0, windowStart + windowMs - now), count: current }
    }

    await db.execute({
      sql: `INSERT INTO wallet_sponsor_rate (sender_address, window_start, count)
            VALUES (?, ?, 1)
            ON CONFLICT(sender_address, window_start) DO UPDATE SET count = count + 1`,
      args: [addr, windowStart],
    })

    return { allowed: true, count: current + 1 }
  }
}

let store: SqliteWalletSponsorRateLimitStore | null = null

export function getWalletSponsorRateLimitStore(): WalletSponsorRateLimitStore {
  if (!store) store = new SqliteWalletSponsorRateLimitStore()
  return store
}
