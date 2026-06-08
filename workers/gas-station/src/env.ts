import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types'

export interface GasStationEnv {
  GAS_STATION: DurableObjectNamespace
  DB?: D1Database
  SUI_RPC_URL: string
  /** @deprecated Use GAS_SPONSOR_PRIV_1/2 for gas sponsor; ticket key belongs in BFF only. */
  SURVEY_PASS_ISSUER_PRIV?: string
  GAS_SPONSOR_PRIV_1?: string
  GAS_SPONSOR_PRIV_2?: string
  GAS_SPONSOR_PUBKEY_3?: string
  GAS_SPONSOR_MULTISIG_THRESHOLD?: string
  GAS_SPONSOR_ADDRESS?: string
  NODE_ENV?: string
  SUI_PACKAGE_ID?: string
  COIN_MERGE_TRIGGER_COUNT?: string
  COIN_MERGE_THRESHOLD_SUI?: string
  COIN_MERGE_INTERVAL_MS?: string
  GAS_BUDGET_CAP_MIST?: string
  GAS_BUDGET_BUFFER_MIST?: string
  MAX_PLATFORM_CLAIM_GAS_MIST?: string
  COIN_QUEUE_LOCK_TTL_MS?: string
  COIN_INVENTORY_REFRESH_MS?: string
}

export function toGasConfigEnv(env: GasStationEnv): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>
}

export function toSponsorSignerEnv(env: GasStationEnv): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>
}
