import type { D1Database } from '@cloudflare/workers-types'
import { getD1 } from '../d1.js'

/**
 * D1 取代原本的本地 SQLite（@libsql/client，file:./data/surveysui.db）。
 *
 * 為了把稽核過的資料層改動面降到最小，這裡用一個 **adapter** 把 D1 包成與舊
 * libsql client 相同的 `execute({ sql, args })` / `execute('<raw>')` 介面，讓各
 * store 的 SQL 字串原樣保留。唯一例外是 pass 預留的原子交易——D1 無互動式
 * `BEGIN IMMEDIATE`，已在 SqlitePassReservationStore 改寫成單句條件 INSERT
 * （D1/SQLite 全域序列化寫入，單句即原子），故此 adapter 對 BEGIN/COMMIT/ROLLBACK
 * 一律 no-op。
 */

export interface D1ExecParams {
  sql: string
  args?: Array<string | number | null>
}

export interface D1ExecResult {
  rows: Array<Record<string, unknown>>
  /** 對齊舊 libsql 的 result.rowsAffected（映射 D1 meta.changes）。 */
  rowsAffected: number
}

class D1ClientAdapter {
  constructor(private readonly db: D1Database) {}

  async execute(input: D1ExecParams | string): Promise<D1ExecResult> {
    if (typeof input === 'string') {
      const trimmed = input.trimStart()
      if (/^(begin|commit|rollback)/i.test(trimmed)) {
        // D1 無互動式交易；唯一用戶（pass 預留）已改單句原子，故 no-op。
        return { rows: [], rowsAffected: 0 }
      }
      const r = await this.db.prepare(input).run()
      return { rows: [], rowsAffected: Number(r.meta?.changes ?? 0) }
    }
    const stmt =
      input.args && input.args.length
        ? this.db.prepare(input.sql).bind(...input.args)
        : this.db.prepare(input.sql)
    if (/^\s*select/i.test(input.sql)) {
      const r = await stmt.all<Record<string, unknown>>()
      return { rows: r.results ?? [], rowsAffected: 0 }
    }
    const r = await stmt.run()
    return { rows: [], rowsAffected: Number(r.meta?.changes ?? 0) }
  }
}

/** 回傳包裹當前 isolate D1 繫結的 client adapter（與舊 getDbClient 介面相容）。 */
export function getDbClient(): D1ClientAdapter {
  return new D1ClientAdapter(getD1())
}

const SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS revoked_nullifiers (
    nullifier_hash TEXT PRIMARY KEY,
    source INTEGER NOT NULL,
    revoked_at INTEGER NOT NULL,
    pass_id TEXT,
    reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS platform_sponsor_daily (
    sender_address TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sender_address, day)
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_sponsor_rate (
    sender_address TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sender_address, window_start)
  )`,
  `CREATE TABLE IF NOT EXISTS pass_sponsor_reservation (
    sender_address TEXT NOT NULL,
    sponsor_address TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pass_sponsor_reservation_lookup
    ON pass_sponsor_reservation (sender_address, sponsor_address, created_at)`,
  `CREATE TABLE IF NOT EXISTS vault_gas_reservation (
    vault_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_vault_gas_reservation_lookup
    ON vault_gas_reservation (vault_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS realtime_ticket_slot (
    wallet_address TEXT NOT NULL,
    vault_id TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (wallet_address, vault_id)
  )`,
  `CREATE TABLE IF NOT EXISTS pass_sponsor_onchain_cache (
    sender_address TEXT NOT NULL,
    sponsor_address TEXT NOT NULL,
    package_scope TEXT NOT NULL,
    since_ms INTEGER NOT NULL,
    count INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (sender_address, sponsor_address, package_scope, since_ms)
  )`,
  `CREATE TABLE IF NOT EXISTS task_cursor (
    task TEXT PRIMARY KEY,
    cursor TEXT,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS otp (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_state (
    state TEXT PRIMARY KEY,
    verifier TEXT NOT NULL,
    provider TEXT NOT NULL,
    owner TEXT NOT NULL,
    sid_hash TEXT,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mint_rate_limit (
    key TEXT PRIMARY KEY,
    recorded_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS http_rate_limit (
    bucket TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
  )`,
]

let schemaReady = false

/**
 * 兜底建表（與 migrations/0001_init.sql 同步）。每個 isolate 首次請求時呼叫一次，
 * 防止忘了套 migration 時整個服務不可用；正式 schema 仍以 migration 為準。
 */
export async function ensureBffSchema(): Promise<void> {
  if (schemaReady) return
  const db = getD1()
  await db.batch(SCHEMA_DDL.map((sql) => db.prepare(sql)))
  schemaReady = true
}

/** @deprecated Worker 改用 ensureBffSchema()（async）；保留空殼避免舊呼叫點編譯失敗。 */
export function initializeDb(): void {
  /* no-op：schema 由 migration / ensureBffSchema 處理 */
}

/** 測試用：重置 schema 兜底快取（每測試換新 D1 時需重建表）。 */
export function __resetBffSchemaCache(): void {
  schemaReady = false
}

/**
 * Inserts a new revoked nullifier record.
 */
export async function insertRevokedNullifier(
  nullifier: string,
  source: number,
  passId?: string,
  reason?: string
): Promise<void> {
  const db = getDbClient()
  const revokedAt = Date.now()
  await db.execute({
    sql: `INSERT OR REPLACE INTO revoked_nullifiers (nullifier_hash, source, revoked_at, pass_id, reason)
          VALUES (?, ?, ?, ?, ?)`,
    args: [nullifier.toLowerCase().trim(), source, revokedAt, passId ?? null, reason ?? null],
  })
}

/**
 * Deletes a revoked nullifier record (unrevoke).
 */
export async function deleteRevokedNullifier(nullifier: string, source: number): Promise<void> {
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM revoked_nullifiers WHERE LOWER(nullifier_hash) = ? AND source = ?`,
    args: [nullifier.toLowerCase().trim(), source],
  })
}

/**
 * Checks if a nullifier is marked as revoked.
 */
export async function checkIfNullifierRevoked(nullifier: string, source: number): Promise<boolean> {
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT 1 FROM revoked_nullifiers WHERE LOWER(nullifier_hash) = ? AND source = ? LIMIT 1`,
    args: [nullifier.toLowerCase().trim(), source],
  })
  return result.rows.length > 0
}
