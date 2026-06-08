import type { D1Database } from '@cloudflare/workers-types'
import type { PlatformSponsorStore, WalletSponsorRateLimitStore } from '@surveysui/gas-station-core'

export class D1PlatformSponsorStore implements PlatformSponsorStore {
  constructor(
    private readonly db: D1Database,
    private readonly dailyLimit: number
  ) {}

  getDailyLimit(): number {
    return this.dailyLimit
  }

  async getCount(senderAddress: string, day: string): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT count FROM platform_sponsor_daily WHERE sender_address = ? AND day = ?`
      )
      .bind(senderAddress.toLowerCase(), day)
      .first<{ count: number }>()
    return row?.count ?? 0
  }

  async increment(senderAddress: string, day: string): Promise<number> {
    const addr = senderAddress.toLowerCase()
    await this.db
      .prepare(
        `INSERT INTO platform_sponsor_daily (sender_address, day, count)
         VALUES (?, ?, 1)
         ON CONFLICT(sender_address, day) DO UPDATE SET count = count + 1`
      )
      .bind(addr, day)
      .run()
    return this.getCount(addr, day)
  }
}

export class D1WalletSponsorRateLimitStore implements WalletSponsorRateLimitStore {
  constructor(private readonly db: D1Database) {}

  async checkAndIncrement(
    senderAddress: string,
    maxPerWindow: number,
    windowMs: number,
    now = Date.now()
  ) {
    const addr = senderAddress.toLowerCase()
    const windowStart = Math.floor(now / windowMs) * windowMs

    const row = await this.db
      .prepare(
        `SELECT count FROM wallet_sponsor_rate WHERE sender_address = ? AND window_start = ?`
      )
      .bind(addr, windowStart)
      .first<{ count: number }>()

    const current = row?.count ?? 0
    if (current >= maxPerWindow) {
      const retryAfterMs = windowStart + windowMs - now
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs), count: current }
    }

    await this.db
      .prepare(
        `INSERT INTO wallet_sponsor_rate (sender_address, window_start, count)
         VALUES (?, ?, 1)
         ON CONFLICT(sender_address, window_start) DO UPDATE SET count = count + 1`
      )
      .bind(addr, windowStart)
      .run()

    return { allowed: true, count: current + 1 }
  }
}

export async function ensureD1Schema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS platform_sponsor_daily (
        sender_address TEXT NOT NULL,
        day TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (sender_address, day)
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS wallet_sponsor_rate (
        sender_address TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (sender_address, window_start)
      )
    `),
  ])
}
