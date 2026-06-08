import fs from 'node:fs'
import path from 'node:path'
import { createClient, type Client } from '@libsql/client'

let client: Client | null = null

/**
 * Initializes the database connection.
 * Creates the required folder and sqlite file if they do not exist.
 */
export function initializeDb(): void {
  if (client) return

  const dbDir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  const dbPath = path.join(dbDir, 'surveysui.db')
  const url = `file:${dbPath}`
  
  console.log(`[DB] Initializing local SQLite database at: ${dbPath}`)
  client = createClient({ url })

  // Create table for revoked nullifiers
  client.execute(`
    CREATE TABLE IF NOT EXISTS revoked_nullifiers (
      nullifier_hash TEXT PRIMARY KEY,
      source INTEGER NOT NULL,
      revoked_at INTEGER NOT NULL,
      pass_id TEXT,
      reason TEXT
    );
  `).then(() => {
    console.log('[DB] Table "revoked_nullifiers" is ready')
  }).catch((err) => {
    console.error('[DB] Failed to create tables:', err)
  })

  client.execute(`
    CREATE TABLE IF NOT EXISTS platform_sponsor_daily (
      sender_address TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sender_address, day)
    );
  `).then(() => {
    console.log('[DB] Table "platform_sponsor_daily" is ready')
  }).catch((err) => {
    console.error('[DB] Failed to create platform_sponsor_daily:', err)
  })

  client.execute(`
    CREATE TABLE IF NOT EXISTS wallet_sponsor_rate (
      sender_address TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sender_address, window_start)
    );
  `).then(() => {
    console.log('[DB] Table "wallet_sponsor_rate" is ready')
  }).catch((err) => {
    console.error('[DB] Failed to create wallet_sponsor_rate:', err)
  })
}

/**
 * Returns the active database client instance.
 */
export function getDbClient(): Client {
  if (!client) {
    initializeDb()
  }
  return client!
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
    args: [
      nullifier.toLowerCase().trim(),
      source,
      revokedAt,
      passId ?? null,
      reason ?? null
    ]
  })
}

/**
 * Deletes a revoked nullifier record (unrevoke).
 */
export async function deleteRevokedNullifier(nullifier: string, source: number): Promise<void> {
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM revoked_nullifiers WHERE LOWER(nullifier_hash) = ? AND source = ?`,
    args: [nullifier.toLowerCase().trim(), source]
  })
}

/**
 * Checks if a nullifier is marked as revoked.
 */
export async function checkIfNullifierRevoked(nullifier: string, source: number): Promise<boolean> {
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT 1 FROM revoked_nullifiers WHERE LOWER(nullifier_hash) = ? AND source = ? LIMIT 1`,
    args: [nullifier.toLowerCase().trim(), source]
  })
  return result.rows.length > 0
}
