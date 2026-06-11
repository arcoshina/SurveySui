import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000

export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`).join(',')}}`
}

export function signGasStationBody(secret: string, timestamp: string, bodyJson: string): string {
  const payload = `${timestamp}.${bodyJson}`
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function verifyGasStationSignature(
  secret: string,
  timestamp: string,
  bodyJson: string,
  signatureHex: string,
  nowMs = Date.now(),
  maxSkewMs = DEFAULT_MAX_SKEW_MS
): boolean {
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  if (Math.abs(nowMs - ts) > maxSkewMs) return false
  const expected = signGasStationBody(secret, timestamp, bodyJson)
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(signatureHex, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
