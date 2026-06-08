export {
  netGasFromEffects,
  resolveGasBudget,
  computeRebateSurplus,
  applyCreatorRebateShare,
  parseEnvBigInt as parseEnvBigIntFromEnv,
} from '@surveysui/gas-station-core'

import { parseEnvBigInt as parseEnvBigIntCore } from '@surveysui/gas-station-core'

/** Node helper: read bigint from process.env */
export function parseEnvBigInt(name: string, fallback: bigint): bigint {
  return parseEnvBigIntCore(process.env as Record<string, string | undefined>, name, fallback)
}
