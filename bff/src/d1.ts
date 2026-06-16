import type { D1Database } from '@cloudflare/workers-types'

/**
 * 每個 Worker isolate 的 D1 繫結持有者。
 *
 * `env.DB` 只在 fetch/scheduled handler 內可取得，故在每次呼叫起點以 `setD1(env.DB)`
 * 設入，資料層（security/db.ts 的 adapter 與各 store）再經 `getD1()` 取用。同一 isolate
 * 內 env.DB 是同一物件，重設無副作用。
 */
let _db: D1Database | null = null

export function setD1(db: D1Database): void {
  _db = db
}

export function getD1(): D1Database {
  if (!_db) {
    throw new Error(
      'D1 not initialized: setD1(env.DB) must run at the start of each fetch/scheduled invocation'
    )
  }
  return _db
}

export function hasD1(): boolean {
  return _db !== null
}
