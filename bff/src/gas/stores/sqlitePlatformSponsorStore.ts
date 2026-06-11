import type { PlatformSponsorStore } from '@surveysui/gas-station-core'
import { getDbClient } from '../../security/db.js'
import { getGasConfig } from '../gasConfig.js'

export class SqlitePlatformSponsorStore implements PlatformSponsorStore {
  getDailyLimit(): number {
    return getGasConfig().platformSponsorDailyLimit
  }

  async getCount(senderAddress: string, day: string): Promise<number> {
    const db = getDbClient()
    const result = await db.execute({
      sql: `SELECT count FROM platform_sponsor_daily WHERE sender_address = ? AND day = ?`,
      args: [senderAddress.toLowerCase(), day],
    })
    if (result.rows.length === 0) return 0
    const row = result.rows[0] as unknown as { count: number | bigint | string }
    return Number(row.count ?? 0)
  }

  async increment(senderAddress: string, day: string): Promise<number> {
    const result = await this.tryIncrement(senderAddress, day, Number.MAX_SAFE_INTEGER)
    return result.count
  }

  async tryIncrement(
    senderAddress: string,
    day: string,
    limit: number
  ): Promise<{ ok: boolean; count: number }> {
    const db = getDbClient()
    const addr = senderAddress.toLowerCase()

    await db.execute({
      sql: `INSERT INTO platform_sponsor_daily (sender_address, day, count) VALUES (?, ?, 0)
            ON CONFLICT(sender_address, day) DO NOTHING`,
      args: [addr, day],
    })

    const updated = await db.execute({
      sql: `UPDATE platform_sponsor_daily SET count = count + 1
            WHERE sender_address = ? AND day = ? AND count < ?`,
      args: [addr, day, limit],
    })

    const count = await this.getCount(addr, day)
    const ok = Number(updated.rowsAffected ?? 0) > 0
    return { ok, count }
  }
}

let store: SqlitePlatformSponsorStore | null = null

export function getPlatformSponsorStore(): PlatformSponsorStore & {
  tryIncrement(senderAddress: string, day: string, limit: number): Promise<{ ok: boolean; count: number }>
} {
  if (!store) store = new SqlitePlatformSponsorStore()
  return store
}
