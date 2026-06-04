import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { bcs } from '@mysten/sui/bcs'
import { createHash } from 'node:crypto'
import { getIssuerSalt } from '../config.js'

// TicketPayload BCS structure matching the Move contract TicketPayload struct.
// Order of fields and types must strictly match:
// Owner (address) -> Source (u8) -> Nullifiers (vector<vector<u8>>) -> Commitment (vector<u8>) -> ExpiresAt (u64)
export const TicketPayload = bcs.struct('TicketPayload', {
  owner: bcs.Address,
  source: bcs.u8(),
  nullifiers: bcs.vector(bcs.vector(bcs.u8())),
  commitment: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
})

// Source types（與合約 survey_pass.move 一致）
const SRC_EMAIL = 2
const SRC_SOCIAL = 3
const SRC_WORLD_ID = 5
// 社群具體 provider：以不同 source 區分 Google / GitHub，皆視為社群類（tier 1、共用 SOCIAL TTL）
export const SRC_SOCIAL_GOOGLE = 6
export const SRC_SOCIAL_GITHUB = 7

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const ONE_MONTH_MS = 30 * ONE_DAY_MS // 以 30 天計為「一個月」
const DEFAULT_TTL_MS = 7 * ONE_DAY_MS // 未指定來源（如自述）的通用 fallback

// 各來源預設效期（env 未設時生效）：Email / 社群 = 3 個月，World ID = 1 年。
// 具體 provider（Google=6 / GitHub=7）與泛稱社群共用同一預設。
const DEFAULT_TTL_BY_SOURCE: Record<number, number> = {
  [SRC_EMAIL]: 3 * ONE_MONTH_MS,
  [SRC_SOCIAL]: 3 * ONE_MONTH_MS,
  [SRC_SOCIAL_GOOGLE]: 3 * ONE_MONTH_MS,
  [SRC_SOCIAL_GITHUB]: 3 * ONE_MONTH_MS,
  [SRC_WORLD_ID]: 365 * ONE_DAY_MS,
}

/**
 * 依憑證來源回傳 Pass 有效期 TTL（毫秒），支援各來源在 env 設定不同效期。
 * 優先序：來源專屬 env → 全域 BFF_PASS_TTL_MS → 來源預設 → 通用 7 天。
 *   - SRC_EMAIL   → BFF_PASS_TTL_MS_EMAIL   （預設 3 個月）
 *   - SRC_SOCIAL  → BFF_PASS_TTL_MS_SOCIAL  （預設 3 個月）
 *   - SRC_WORLD_ID→ BFF_PASS_TTL_MS_WORLDID （預設 1 年）
 * 各 env 留空 / 非正數則自動 fallback。
 */
export function getPassTtlMs(source: number): number {
  const perSource: Record<number, string | undefined> = {
    [SRC_EMAIL]: process.env.BFF_PASS_TTL_MS_EMAIL,
    [SRC_SOCIAL]: process.env.BFF_PASS_TTL_MS_SOCIAL,
    // 具體 provider 與泛稱社群共用同一 SOCIAL TTL
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

/**
 * Email nullifier: SHA256("email" + email.toLowerCase().trim() + SALT)
 * 與舊版 computeNullifierHash 完全相同（向後相容 alias）
 */
export function computeEmailSecondaryNullifier(email: string): Uint8Array {
  const salt = getIssuerSalt()
  const input = Buffer.concat([
    Buffer.from('email'),
    Buffer.from(email.toLowerCase().trim()),
    Buffer.from(salt),
  ])
  return new Uint8Array(createHash('sha256').update(input).digest())
}

/** Alias for backward compatibility */
export const computeNullifierHash = computeEmailSecondaryNullifier

/**
 * Social primary nullifier: SHA256(provider + ":" + sub + SALT)
 */
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

/**
 * Signs the ticket payload with the issuer's private key.
 * nullifiers: array of Uint8Array — index 0 = primary, 1+ = secondary
 */
export async function signTicket(
  owner: string,
  source: number,
  nullifiers: Uint8Array[],
  commitment: Uint8Array,
  expiresAtMs: number
): Promise<{ bff_sig: string; expires_at: string; nullifiers: string[] }> {
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
    nullifiers: nullifiers.map((n) => Array.from(n)),
    commitment: Array.from(commitment),
    expires_at,
  }).toBytes()

  const signatureBytes = await keypair.sign(payloadBytes)

  return {
    bff_sig: Buffer.from(signatureBytes).toString('hex'),
    expires_at,
    nullifiers: nullifiers.map((n) => Buffer.from(n).toString('hex')),
  }
}
