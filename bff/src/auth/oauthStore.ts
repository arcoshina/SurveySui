import { getDbClient } from '../security/db.js'

export interface OAuthStateEntry {
  verifier: string   // PKCE code_verifier（base64url random）
  provider: string
  owner: string      // Sui address of the connected wallet
  expiresAt: number
}

/**
 * OAuth PKCE state store，D1-backed（取代原 MemoryOAuthStore；Worker 無常駐記憶體）。
 * 方法改為 async。過期以 expires_at 過濾，實體清理由 cron prune。
 */
export class D1OAuthStore {
  private readonly ttlMs: number

  constructor(ttlMs = 600_000) {
    this.ttlMs = ttlMs
  }

  async set(state: string, entry: Omit<OAuthStateEntry, 'expiresAt'>): Promise<void> {
    const db = getDbClient()
    await db.execute({
      sql: `INSERT INTO oauth_state (state, verifier, provider, owner, expires_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(state) DO UPDATE SET
              verifier = excluded.verifier, provider = excluded.provider,
              owner = excluded.owner, expires_at = excluded.expires_at`,
      args: [state, entry.verifier, entry.provider, entry.owner, Date.now() + this.ttlMs],
    })
  }

  async get(state: string): Promise<OAuthStateEntry | null> {
    const db = getDbClient()
    const r = await db.execute({
      sql: `SELECT verifier, provider, owner, expires_at FROM oauth_state WHERE state = ?`,
      args: [state],
    })
    if (r.rows.length === 0) return null
    const row = r.rows[0] as {
      verifier: string
      provider: string
      owner: string
      expires_at: number
    }
    if (Date.now() > Number(row.expires_at)) {
      await this.invalidate(state)
      return null
    }
    return {
      verifier: String(row.verifier),
      provider: String(row.provider),
      owner: String(row.owner),
      expiresAt: Number(row.expires_at),
    }
  }

  async invalidate(state: string): Promise<void> {
    const db = getDbClient()
    await db.execute({ sql: `DELETE FROM oauth_state WHERE state = ?`, args: [state] })
  }

  async clear(): Promise<void> {
    const db = getDbClient()
    await db.execute(`DELETE FROM oauth_state`)
  }
}

export const oauthStore = new D1OAuthStore()
