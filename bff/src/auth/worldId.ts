import { createHash } from 'node:crypto'
import { signRequest } from '@worldcoin/idkit-core/signing'
import { getIssuerSalt } from '../config.js'

/**
 * World ID 4.0 issuer schema id for the Orb-issued "proof_of_human" credential.
 * 只有此憑證(Orb 虹膜驗證)才給 Tier 2;其餘(selfie=11、passport=9303、mnc=9310)一律拒絕。
 */
export const ORB_ISSUER_SCHEMA_ID = 1
const DEFAULT_WORLD_API_BASE = 'https://developer.world.org'

/**
 * World ID primary nullifier: SHA256("worldid" + worldNullifier + SALT)
 * 與 ticket.ts 既有 nullifier 慣例對齊(同樣加 SALT、輸出 32-byte)。
 */
export function computeWorldIdPrimaryNullifier(worldNullifier: string): Uint8Array {
  const salt = getIssuerSalt()
  const input = Buffer.concat([
    Buffer.from('worldid'),
    Buffer.from(worldNullifier.toLowerCase().trim()),
    Buffer.from(salt),
  ])
  return new Uint8Array(createHash('sha256').update(input).digest())
}

/**
 * RP context (snake_case) 直接交給前端 IDKit 的 IDKitRequestConfig.rp_context。
 * 對齊 @worldcoin/idkit-core 的 RpContext 型別。
 */
export interface WorldIdRpContext {
  rp_id: string
  nonce: string
  created_at: number
  expires_at: number
  signature: string
}

/**
 * 用 signing_key + action 產生 RP 簽名 context(防冒名)。
 * signing_key 絕不離開後端;缺任何環境變數則丟錯(由路由轉 503)。
 */
export function signWorldIdRequest(): WorldIdRpContext {
  const signingKeyHex = process.env.WORLDCOIN_SIGNING_KEY
  const rpId = process.env.WORLDCOIN_RP_ID
  const action = process.env.WORLDCOIN_ACTION
  if (!signingKeyHex || !rpId || !action) {
    throw new Error('World ID environment not configured (WORLDCOIN_SIGNING_KEY/RP_ID/ACTION)')
  }

  const sig = signRequest({ signingKeyHex, action })
  return {
    rp_id: rpId,
    nonce: sig.nonce,
    created_at: sig.createdAt,
    expires_at: sig.expiresAt,
    signature: sig.sig,
  }
}

export interface WorldIdVerifyResult {
  ok: boolean
  status: number
  isOrb: boolean
  nullifier: string | null
  error?: string
}

/** IDKit v4 payload.responses 單筆(僅取用判定 Orb 所需欄位)。 */
interface WorldIdResponse {
  issuer_schema_id?: number
  identifier?: string
  nullifier?: unknown
}

/**
 * 驗證 IDKit v4 proof payload:
 *  1. 強制 Orb:payload.responses 中需有 proof_of_human(issuer_schema_id === 1),否則 403。
 *  2. 轉發至 World API 確認密碼學有效性,失敗則 401。
 * 兩者皆通過才回 nullifier。
 */
export async function verifyWorldIdProof(payload: unknown): Promise<WorldIdVerifyResult> {
  const rpId = process.env.WORLDCOIN_RP_ID
  if (!rpId) {
    return { ok: false, status: 503, isOrb: false, nullifier: null, error: 'World ID rp_id not configured' }
  }

  // 1. Orb 強制(由 typed payload 判定,不可只靠前端 preset)
  const responsesRaw = (payload as { responses?: unknown } | null)?.responses
  const responses: WorldIdResponse[] = Array.isArray(responsesRaw) ? responsesRaw : []
  const orbResp = responses.find(
    (r) => r?.issuer_schema_id === ORB_ISSUER_SCHEMA_ID || r?.identifier === 'proof_of_human'
  )
  if (!orbResp || typeof orbResp.nullifier !== 'string' || orbResp.nullifier.length === 0) {
    return { ok: false, status: 403, isOrb: false, nullifier: null, error: 'Orb verification required' }
  }

  // 2. 向 World API 確認密碼學有效性
  const base = process.env.WORLDCOIN_API_BASE || DEFAULT_WORLD_API_BASE
  let res: Response
  try {
    res = await fetch(`${base}/api/v4/verify/${rpId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 502, isOrb: true, nullifier: null, error: `World verify unreachable: ${message}` }
  }

  if (!res.ok) {
    return { ok: false, status: 401, isOrb: true, nullifier: null, error: `World verify failed: ${res.status}` }
  }

  const data = (await res.json().catch(() => ({}))) as { success?: boolean }

  if (data && data.success === false) {
    return { ok: false, status: 401, isOrb: true, nullifier: null, error: 'World verify rejected' }
  }

  return { ok: true, status: 200, isOrb: true, nullifier: orbResp.nullifier as string }
}
