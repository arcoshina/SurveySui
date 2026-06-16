import type { MiddlewareHandler } from 'hono'
import { getDbClient } from '../security/db.js'

export interface RateLimitOptions {
  /** 視窗內最大請求數。 */
  max: number
  /** 視窗長度（毫秒）。 */
  windowMs: number
  /** bucket 前綴，用以區隔不同端點的計數。 */
  key: string
}

/**
 * D1-backed 端點速率限制（取代 @fastify/rate-limit；Worker 無常駐記憶體）。
 * 以 `key:ip:windowStart` 為 bucket 計數。粗粒度即可，故 increment 與讀取分兩句、
 * 不要求強原子。過期列由 cron prune（http_rate_limit.expires_at）。
 */
export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const ip =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      'unknown'
    const now = Date.now()
    const windowStart = Math.floor(now / opts.windowMs) * opts.windowMs
    const bucket = `${opts.key}:${ip}:${windowStart}`

    const db = getDbClient()
    await db.execute({
      sql: `INSERT INTO http_rate_limit (bucket, expires_at, count) VALUES (?, ?, 1)
            ON CONFLICT(bucket) DO UPDATE SET count = count + 1`,
      args: [bucket, windowStart + opts.windowMs],
    })
    const r = await db.execute({
      sql: `SELECT count FROM http_rate_limit WHERE bucket = ?`,
      args: [bucket],
    })
    const count = r.rows.length ? Number((r.rows[0] as { count: number }).count ?? 0) : 0
    if (count > opts.max) {
      const retryAfterMs = windowStart + opts.windowMs - now
      return c.json(
        {
          error: 'rate_limited',
          message: `Too many requests; retry in ${Math.ceil(retryAfterMs / 1000)} seconds`,
        },
        429
      )
    }
    await next()
  }
}
