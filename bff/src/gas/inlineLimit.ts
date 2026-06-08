/** Mirrors `survey_vault::DEFAULT_MAX_INLINE_ANSWER_BYTES` (6 KiB). */
export const DEFAULT_MAX_INLINE_ANSWER_BYTES = 6144

function parseEnvBigInt(raw: string | undefined, fallback: bigint): bigint {
  if (!raw) return fallback
  const cleaned = raw.replace(/_/g, '').replace(/,/g, '').trim()
  if (!cleaned) return fallback
  try {
    return BigInt(cleaned)
  } catch {
    return fallback
  }
}

/** Deployment env cap for inline answers (BFF sponsor gate; must be <= on-chain MAX). */
export function resolveMaxInlineAnswerBytes(): number {
  const fromBytes = process.env.MAX_INLINE_ANSWER_BYTES
  if (fromBytes) {
    const n = Number(parseEnvBigInt(fromBytes, BigInt(DEFAULT_MAX_INLINE_ANSWER_BYTES)))
    if (Number.isFinite(n) && n > 0) return n
  }
  const kb = process.env.MAX_INLINE_ANSWER_KB
  if (kb) {
    const n = Number(kb.replace(/_/g, '').trim())
    if (Number.isFinite(n) && n > 0) return Math.floor(n * 1024)
  }
  return DEFAULT_MAX_INLINE_ANSWER_BYTES
}

export function effectiveInlineLimit(vaultMaxInline: bigint | number): number {
  const envCap = resolveMaxInlineAnswerBytes()
  const onChain = Number(vaultMaxInline)
  if (!Number.isFinite(onChain) || onChain <= 0) return envCap
  return Math.min(envCap, onChain)
}
