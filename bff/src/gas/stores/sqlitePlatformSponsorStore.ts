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
    const db = getDbClient()
    const addr = senderAddress.toLowerCase()
    await db.execute({
      sql: `INSERT INTO platform_sponsor_daily (sender_address, day, count)
            VALUES (?, ?, 1)
            ON CONFLICT(sender_address, day) DO UPDATE SET count = count + 1`,
      args: [addr, day],
    })
    return this.getCount(addr, day)
  }
}

let store: SqlitePlatformSponsorStore | null = null

export function getPlatformSponsorStore(): PlatformSponsorStore {
  if (!store) store = new SqlitePlatformSponsorStore()
  return store
}
