import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { bcs } from '@mysten/sui/bcs'
import { createHash } from 'node:crypto'

// TicketPayload BCS structure matching the Move contract TicketPayload struct.
// Order of fields and types must strictly match:
// Owner (address) -> Source (u8) -> Nullifier (vector<u8>) -> Commitment (vector<u8>) -> ExpiresAt (u64)
export const TicketPayload = bcs.struct('TicketPayload', {
  owner: bcs.Address,
  source: bcs.u8(),
  nullifier_hash: bcs.vector(bcs.u8()),
  commitment: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
})

/**
 * Calculates a salted, irreversible sha256 hash for the nullifier to prevent rainbow table attacks.
 */
export function computeNullifierHash(email: string): Uint8Array {
  const salt = process.env.SURVEY_PASS_ISSUER_SALT || 'default_salt'
  const input = Buffer.concat([
    Buffer.from('email'),
    Buffer.from(email.toLowerCase().trim()),
    Buffer.from(salt),
  ])
  return new Uint8Array(createHash('sha256').update(input).digest())
}

/**
 * Signs the ticket payload with the issuer's private key.
 */
export async function signTicket(
  owner: string,
  source: number,
  nullifier_hash: Uint8Array,
  commitment: Uint8Array,
  expiresAtMs: number
): Promise<{ bff_sig: string; expires_at: string; nullifier_hash: string }> {
  const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
  if (!privKeyHex) {
    throw new Error('SURVEY_PASS_ISSUER_PRIV is not set')
  }

  const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
  const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
  const keypairBytes = privateKeyBytes.slice(0, 32)
  const keypair = Ed25519Keypair.fromSecretKey(keypairBytes)

  const expires_at = BigInt(expiresAtMs).toString()

  const payloadBytes = TicketPayload.serialize({
    owner,
    source,
    nullifier_hash: Array.from(nullifier_hash),
    commitment: Array.from(commitment),
    expires_at,
  }).toBytes()

  const signatureBytes = await keypair.sign(payloadBytes)

  return {
    bff_sig: Buffer.from(signatureBytes).toString('hex'),
    expires_at,
    nullifier_hash: Buffer.from(nullifier_hash).toString('hex'),
  }
}
