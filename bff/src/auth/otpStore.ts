import { getDbClient } from '../security/db.js'

export interface OtpEntry {
  code: string
  expiresAt: number
}

/**
 * Email OTP store，D1-backed（取代原 MemoryOtpStore；Worker 無常駐記憶體）。
 * 方法改為 async。過期以 expires_at 過濾，實體清理由 cron prune。
 */
export class D1OtpStore {
  async set(email: string, code: string, ttlMs: number = 600000): Promise<void> {
    const db = getDbClient()
    await db.execute({
      sql: `INSERT INTO otp (email, code, expires_at) VALUES (?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at`,
      args: [email.toLowerCase().trim(), code, Date.now() + ttlMs],
    })
  }

  async get(email: string): Promise<string | null> {
    const db = getDbClient()
    const key = email.toLowerCase().trim()
    const r = await db.execute({
      sql: `SELECT code, expires_at FROM otp WHERE email = ?`,
      args: [key],
    })
    if (r.rows.length === 0) return null
    const row = r.rows[0] as { code: string; expires_at: number }
    if (Date.now() > Number(row.expires_at)) {
      await this.invalidate(key)
      return null
    }
    return String(row.code)
  }

  async invalidate(email: string): Promise<void> {
    const db = getDbClient()
    await db.execute({
      sql: `DELETE FROM otp WHERE email = ?`,
      args: [email.toLowerCase().trim()],
    })
  }

  async clear(): Promise<void> {
    const db = getDbClient()
    await db.execute(`DELETE FROM otp`)
  }
}

export const otpStore = new D1OtpStore()
