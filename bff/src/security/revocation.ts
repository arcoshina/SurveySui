import { checkIfNullifierRevoked, getDbClient } from './db.js'

const DEFAULT_TTL = 1 * 60 * 60 * 1000

function mintRateLimitTtlMs(): number {
  const hours = Number(process.env.REVOCATION_MINT_TICKET_RATE_LIMIT_HOURS ?? '1')
  return hours * 60 * 60 * 1000 || DEFAULT_TTL
}

function toHex(nullifierHash: Uint8Array | string): string {
  return typeof nullifierHash === 'string'
    ? nullifierHash
    : Buffer.from(nullifierHash).toString('hex')
}

/**
 * Checks if a nullifier has been revoked.
 * Supports string (hex) or Uint8Array.
 */
export async function isNullifierRevoked(
  nullifierHash: Uint8Array | string,
  source: number
): Promise<boolean> {
  return checkIfNullifierRevoked(toHex(nullifierHash), source)
}

/**
 * Checks if a nullifier is rate limited for ticket minting.
 * Returns true if the nullifier is allowed to mint (NOT rate limited).
 * Returns false if it is rate limited.
 *
 * D1-backed（取代原 LRUCache；Worker 無常駐記憶體）。改為 async。
 */
export async function checkMintRateLimit(
  nullifierHash: Uint8Array | string,
  source: number
): Promise<boolean> {
  const key = `${toHex(nullifierHash).toLowerCase().trim()}:${source}`
  const db = getDbClient()
  const r = await db.execute({
    sql: `SELECT 1 FROM mint_rate_limit WHERE key = ? AND expires_at > ? LIMIT 1`,
    args: [key, Date.now()],
  })
  return r.rows.length === 0
}

/**
 * Records a successful ticket minting to trigger rate limiting.
 */
export async function recordMintSuccess(
  nullifierHash: Uint8Array | string,
  source: number
): Promise<void> {
  const key = `${toHex(nullifierHash).toLowerCase().trim()}:${source}`
  const now = Date.now()
  const db = getDbClient()
  await db.execute({
    sql: `INSERT INTO mint_rate_limit (key, recorded_at, expires_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET recorded_at = excluded.recorded_at, expires_at = excluded.expires_at`,
    args: [key, now, now + mintRateLimitTtlMs()],
  })
}
