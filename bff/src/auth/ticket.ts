import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { bcs } from '@mysten/sui/bcs'
import { createHash } from 'node:crypto'
import { getIssuerSalt } from '../config.js'
export const TicketPayload = bcs.struct('TicketPayload', {
  owner: bcs.Address,
  source: bcs.u8(),
  nullifiers: bcs.vector(bcs.vector(bcs.u8())),
  commitment: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
  escape_clawback_mist: bcs.u64(),
})
const SRC_EMAIL = 2
const SRC_SOCIAL = 3
const SRC_WORLD_ID = 5
export const SRC_SOCIAL_GOOGLE = 6
export const SRC_SOCIAL_GITHUB = 7
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_MONTH_MS = 30 * ONE_DAY_MS
const DEFAULT_TTL_MS = 7 * ONE_DAY_MS
const DEFAULT_TTL_BY_SOURCE: Record<number, number> = {
  [SRC_EMAIL]: 3 * ONE_MONTH_MS,
  [SRC_SOCIAL]: 3 * ONE_MONTH_MS,
  [SRC_SOCIAL_GOOGLE]: 3 * ONE_MONTH_MS,
  [SRC_SOCIAL_GITHUB]: 3 * ONE_MONTH_MS,
  [SRC_WORLD_ID]: 365 * ONE_DAY_MS,
}
export function getPassTtlMs(source: number): number {
  const perSource: Record<number, string | undefined> = {
    [SRC_EMAIL]: process.env.BFF_PASS_TTL_MS_EMAIL,
    [SRC_SOCIAL]: process.env.BFF_PASS_TTL_MS_SOCIAL,
    [SRC_SOCIAL_GOOGLE]: process.env.BFF_PASS_TTL_MS_SOCIAL,
    [SRC_SOCIAL_GITHUB]: process.env.BFF_PASS_TTL_MS_SOCIAL,
    [SRC_WORLD_ID]: process.env.BFF_PASS_TTL_MS_WORLDID,
  }
  const perSourceVal = Number(perSource[source])
  if (Number.isFinite(perSourceVal) && perSourceVal > 0) return perSourceVal
  const globalVal = Number(process.env.BFF_PASS_TTL_MS)
  if (Number.isFinite(globalVal) && globalVal > 0) return globalVal
  return DEFAULT_TTL_BY_SOURCE[source] ?? DEFAULT_TTL_MS
}
export function computeEmailSecondaryNullifier(email: string): Uint8Array {
  const salt = getIssuerSalt()
  const input = Buffer.concat([
    Buffer.from('email'),
    Buffer.from(email.toLowerCase().trim()),
    Buffer.from(salt),
  ])
  return new Uint8Array(createHash('sha256').update(input).digest())
}
export const computeNullifierHash = computeEmailSecondaryNullifier
export function computeSocialPrimaryNullifier(provider: string, sub: string): Uint8Array {
  const salt = getIssuerSalt()
  const input = Buffer.concat([
    Buffer.from(provider),
    Buffer.from(':'),
    Buffer.from(sub),
    Buffer.from(salt),
  ])
  return new Uint8Array(createHash('sha256').update(input).digest())
}
// 由 SURVEY_PASS_ISSUER_PRIV 載入發行者 keypair（取前 32 bytes 作為 Ed25519 秘鑰）。
// 供簽票與「驗證既有 bff_sig」共用，避免私鑰解析邏輯重複。
export function loadTicketIssuerKeypair(): Ed25519Keypair {
  const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
  if (!privKeyHex) {
    throw new Error('SURVEY_PASS_ISSUER_PRIV is not set')
  }
  const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
  const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
  return Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(0, 32))
}

export async function signTicket(
  owner: string,
  source: number,
  nullifiers: Uint8Array[],
  commitment: Uint8Array,
  expiresAtMs: number,
  escapeClawbackMist: bigint = 0n
): Promise<{ bff_sig: string; expires_at: string; nullifiers: string[]; escape_clawback_mist: string }> {
  const keypair = loadTicketIssuerKeypair()
  const expires_at = BigInt(expiresAtMs).toString()
  const escape_clawback_mist = escapeClawbackMist.toString()
  const payloadBytes = TicketPayload.serialize({
    owner,
    source,
    nullifiers: nullifiers.map((n) => Array.from(n)),
    commitment: Array.from(commitment),
    expires_at,
    escape_clawback_mist,
  }).toBytes()
  const signatureBytes = await keypair.sign(payloadBytes)
  return {
    bff_sig: Buffer.from(signatureBytes).toString('hex'),
    expires_at,
    nullifiers: nullifiers.map((n) => Buffer.from(n).toString('hex')),
    escape_clawback_mist,
  }
}
