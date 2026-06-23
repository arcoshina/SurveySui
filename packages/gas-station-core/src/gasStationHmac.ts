import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const GAS_STATION_MAX_SKEW_MS = 5 * 60 * 1000

/** 產生 per-request nonce（128-bit hex），供簽署端帶入並由 DO 去重防重放。 */
export function generateGasStationNonce(): string {
  return randomBytes(16).toString('hex')
}

export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  // 略過值為 undefined 的 key（對齊 JSON.stringify 語意），否則會產出字面
  // `"k":undefined` 這種非法 JSON，導致接收端 JSON.parse 失敗。
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`).join(',')}}`
}

export function signGasStationBody(
  secret: string,
  timestamp: string,
  nonce: string,
  bodyJson: string
): string {
  const payload = `${timestamp}.${nonce}.${bodyJson}`
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function verifyGasStationSignature(
  secret: string,
  timestamp: string,
  nonce: string,
  bodyJson: string,
  signatureHex: string,
  nowMs = Date.now(),
  maxSkewMs = GAS_STATION_MAX_SKEW_MS
): boolean {
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(nowMs - ts) > maxSkewMs) return false
  const expected = signGasStationBody(secret, timestamp, nonce, bodyJson)
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(signatureHex, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
