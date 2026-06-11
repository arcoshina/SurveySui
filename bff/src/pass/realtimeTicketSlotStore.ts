import { getDbClient } from '../security/db.js'
import { normalizeAddress } from '@surveysui/gas-station-core'

export async function pruneExpiredTicketSlots(now = Date.now()): Promise<void> {
  const db = getDbClient()
  await db.execute({
    sql: `DELETE FROM realtime_ticket_slot WHERE expires_at <= ?`,
    args: [now],
  })
}

export async function hasLiveTicketSlot(wallet: string, vaultId: string, now = Date.now()): Promise<boolean> {
  await pruneExpiredTicketSlots(now)
  const db = getDbClient()
  const result = await db.execute({
    sql: `SELECT 1 FROM realtime_ticket_slot
          WHERE wallet_address = ? AND vault_id = ? AND expires_at > ? LIMIT 1`,
    args: [normalizeAddress(wallet), normalizeAddress(vaultId), now],
  })
  return result.rows.length > 0
}

export async function insertTicketSlot(
  wallet: string,
  vaultId: string,
  issuedAt: number,
  expiresAt: number
): Promise<void> {
  const db = getDbClient()
  await db.execute({
    sql: `INSERT OR REPLACE INTO realtime_ticket_slot (wallet_address, vault_id, issued_at, expires_at)
          VALUES (?, ?, ?, ?)`,
    args: [normalizeAddress(wallet), normalizeAddress(vaultId), issuedAt, expiresAt],
  })
}

export async function __clearTicketSlots(): Promise<void> {
  const db = getDbClient()
  await db.execute(`DELETE FROM realtime_ticket_slot`)
}
