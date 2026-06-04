import type { IDKitResult, RpContext } from '@worldcoin/idkit'

// World ID 4.0 (Tier 2, Orb only) — BFF 互動封裝。
// 把與 BFF 的兩段 fetch 抽離 AuthPage，便於單元測試與重用。

export interface WorldIdSignRequest {
  app_id: `app_${string}`
  action: string
  rp_context: RpContext
}

export interface WorldIdTicket {
  bff_sig: string
  expires_at: string
  nullifiers: string[]
  source: number
}

export type WorldIdErrorCode = 'orb_required' | 'config' | 'failed'

export class WorldIdError extends Error {
  code: WorldIdErrorCode
  constructor(code: WorldIdErrorCode, message?: string) {
    super(message || code)
    this.code = code
    this.name = 'WorldIdError'
  }
}

/** Step 1: 向 BFF 取 RP 簽名 context（signing_key 在後端，不會回傳到前端）。 */
export async function fetchWorldIdSignRequest(): Promise<WorldIdSignRequest> {
  const res = await fetch('/auth/worldid/sign-request', { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new WorldIdError('config', data?.error)
  return {
    app_id: data.app_id,
    action: data.action,
    rp_context: data.rp_context as RpContext,
  }
}

/**
 * Step 2: 把 IDKit proof payload 交回 BFF 驗證並換 ticket。
 * 403 → 非 Orb 等級（orb_required）；其餘非 2xx → failed。
 */
export async function submitWorldIdProof(
  owner: string,
  payload: IDKitResult
): Promise<WorldIdTicket> {
  const res = await fetch('/auth/worldid/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, payload }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 403) throw new WorldIdError('orb_required', data?.error)
    throw new WorldIdError('failed', data?.error)
  }
  return data as WorldIdTicket
}
