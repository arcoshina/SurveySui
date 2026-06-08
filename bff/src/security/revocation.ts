import { LRUCache } from 'lru-cache'
import { checkIfNullifierRevoked } from './db.js'

const DEFAULT_TTL = 1 * 60 * 60 * 1000
const rateLimitCache = new LRUCache<string, number>({
  max: 10000,
  ttl: Number(process.env.REVOCATION_MINT_TICKET_RATE_LIMIT_HOURS ?? '1') * 60 * 60 * 1000 || DEFAULT_TTL
})

/**
 * Checks if a nullifier has been revoked.
 * Supports string (hex) or Uint8Array.
 */
export async function isNullifierRevoked(
  nullifierHash: Uint8Array | string,
  source: number
): Promise<boolean> {
  const hashStr = typeof nullifierHash === 'string'
    ? nullifierHash
    : Buffer.from(nullifierHash).toString('hex')
  return checkIfNullifierRevoked(hashStr, source)
}

/**
 * Checks if a nullifier is rate limited for ticket minting.
 * Returns true if the nullifier is allowed to mint (NOT rate limited).
 * Returns false if it is rate limited.
 */
export function checkMintRateLimit(
  nullifierHash: Uint8Array | string,
  source: number
): boolean {
  const hashStr = typeof nullifierHash === 'string'
    ? nullifierHash
    : Buffer.from(nullifierHash).toString('hex')
  
  const key = `${hashStr.toLowerCase().trim()}:${source}`
  if (rateLimitCache.has(key)) {
    return false
  }
  return true
}

/**
 * Records a successful ticket minting to trigger rate limiting.
 */
export function recordMintSuccess(
  nullifierHash: Uint8Array | string,
  source: number
): void {
  const hashStr = typeof nullifierHash === 'string'
    ? nullifierHash
    : Buffer.from(nullifierHash).toString('hex')
  
  const key = `${hashStr.toLowerCase().trim()}:${source}`
  rateLimitCache.set(key, Date.now())
}
