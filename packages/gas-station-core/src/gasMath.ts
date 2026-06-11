export type GasUsedEffects = {
  computationCost?: string | number
  storageCost?: string | number
  storageRebate?: string | number
}

export function netGasFromEffects(gasUsed: GasUsedEffects): bigint {
  return (
    BigInt(gasUsed.computationCost ?? 0) +
    BigInt(gasUsed.storageCost ?? 0) -
    BigInt(gasUsed.storageRebate ?? 0)
  )
}

export function upfrontGasFromEffects(gasUsed: GasUsedEffects): bigint {
  return BigInt(gasUsed.computationCost ?? 0) + BigInt(gasUsed.storageCost ?? 0)
}

export function resolveGasBudget(netGas: bigint, cap: bigint, buffer: bigint): bigint {
  const clampedNet = netGas < 0n ? 0n : netGas
  const withBuffer = clampedNet + buffer
  const capped = withBuffer < cap ? withBuffer : cap
  return capped < 1n ? 1n : capped
}

export function computeRebateSurplus(netGas: bigint, buffer: bigint): bigint {
  if (netGas >= 0n) return 0n
  const surplus = -netGas - buffer
  return surplus > 0n ? surplus : 0n
}

export function applyCreatorRebateShare(surplus: bigint, creatorShareBps: number): bigint {
  if (surplus <= 0n || creatorShareBps <= 0) return 0n
  const bps = BigInt(Math.min(10_000, Math.max(0, creatorShareBps)))
  return (surplus * bps) / 10_000n
}

export function parseEnvBigInt(
  env: Record<string, string | undefined>,
  name: string,
  fallback: bigint
): bigint {
  const raw = env[name]
  if (!raw) return fallback
  const cleaned = raw.replace(/_/g, '').replace(/,/g, '').trim()
  try {
    return BigInt(cleaned)
  } catch {
    return fallback
  }
}
