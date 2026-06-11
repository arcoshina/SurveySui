import { netGasFromEffects, type GasUsedEffects } from './gasMath.js'

/** 110% of sponsor net gas (basis points). */
export const ESCAPE_CLAWBACK_BPS = 11_000n
const BPS_DENOM = 10_000n

/** ceil(netGas * 110 / 100) in MIST. */
export function minEscapeClawbackFromGasUsed(gasUsed: GasUsedEffects): bigint {
  const netGas = netGasFromEffects(gasUsed)
  if (netGas <= 0n) return 1n
  return (netGas * ESCAPE_CLAWBACK_BPS + BPS_DENOM - 1n) / BPS_DENOM
}

export function minEscapeClawbackFromNetGas(netGas: bigint): bigint {
  if (netGas <= 0n) return 1n
  return (netGas * ESCAPE_CLAWBACK_BPS + BPS_DENOM - 1n) / BPS_DENOM
}
