import {
  loadGasConfig as loadCoreGasConfig,
  assertGasConfig as assertCoreGasConfig,
  healthMinBalanceMist,
  type GasConfig,
} from '@surveysui/gas-station-core'

export type { GasConfig }
export { healthMinBalanceMist }

export function loadGasConfig(env: NodeJS.ProcessEnv = process.env): GasConfig {
  return loadCoreGasConfig(env as Record<string, string | undefined>)
}

export function assertGasConfig(config: GasConfig = loadGasConfig()): void {
  assertCoreGasConfig(config)
}

let cachedConfig: GasConfig | null = null

export function getGasConfig(): GasConfig {
  if (!cachedConfig) {
    cachedConfig = loadGasConfig()
  }
  return cachedConfig
}

export function __resetGasConfigCache(): void {
  cachedConfig = null
}
