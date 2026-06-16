import { createClient, type Client, type InValue } from '@libsql/client'
import type { D1Database } from '@cloudflare/workers-types'
import { setD1 } from '../../src/d1.js'
import { ensureBffSchema, __resetBffSchemaCache } from '../../src/security/db.js'

/**
 * 測試用 Fake D1：以 @libsql/client 的 `:memory:` SQLite 實作 D1Database 介面
 * （prepare/bind/all/run/first/batch）。libsql 即 SQLite，行為與正式 D1 等價，
 * 讓既有 node-pool 測試無須搬到 workerd 即可覆蓋 D1 邏輯（含 §4 原子預留）。
 */

class FakeStatement {
  constructor(
    private readonly client: Client,
    private readonly sql: string,
    private readonly args: InValue[] = []
  ) {}

  bind(...args: unknown[]): FakeStatement {
    return new FakeStatement(this.client, this.sql, args as InValue[])
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta: { changes: number } }> {
    const r = await this.client.execute({ sql: this.sql, args: this.args })
    return {
      results: r.rows.map((row) => ({ ...row }) as T),
      meta: { changes: Number(r.rowsAffected ?? 0) },
    }
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const r = await this.client.execute({ sql: this.sql, args: this.args })
    return { meta: { changes: Number(r.rowsAffected ?? 0) } }
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const r = await this.client.execute({ sql: this.sql, args: this.args })
    return r.rows.length ? ({ ...r.rows[0] } as T) : null
  }
}

class FakeD1 {
  constructor(private readonly client: Client) {}

  prepare(sql: string): FakeStatement {
    return new FakeStatement(this.client, sql)
  }

  async batch(stmts: FakeStatement[]): Promise<unknown[]> {
    const out: unknown[] = []
    for (const s of stmts) out.push(await s.run())
    return out
  }
}

export function makeFakeD1(): D1Database {
  return new FakeD1(createClient({ url: ':memory:' })) as unknown as D1Database
}

/** beforeEach 便利函式：掛上全新 Fake D1 並建表。 */
export async function setupFakeD1(): Promise<void> {
  setD1(makeFakeD1())
  __resetBffSchemaCache()
  await ensureBffSchema()
}
