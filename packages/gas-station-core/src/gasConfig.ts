import { parseEnvBigInt } from './gasMath.js'

export interface GasConfig {
  gasBudgetCapMist: bigint
  gasBudgetBufferMist: bigint
  healthMinCapMultiplier: bigint
  minGasCompensationAmount: bigint
  maxPlatformClaimGasMist: bigint
  platformSponsorDailyLimit: number
  minPlatformSponsorTier: number
  gasSponsorRateLimitMax: number
  gasSponsorRateLimitWindowMs: number
  gasSponsorRateLimitMaxPerWallet: number
  gasSponsorRateLimitWalletWindowMs: number
  coinMergeThresholdMist: bigint
  coinMergeTriggerCount: number
  coinMergeIntervalMs: number
  sponsorCoinPoolTarget: number
  sponsorCoinPoolUnitMist: bigint
  sponsorCoinPoolCheckIntervalMs: number
  coinQueueLockTtlMs: number
  coinQueueAcquireRetries: number
  coinInventoryRefreshMs: number
  sponsorCoinDryRunMaxRetries: number
}

const DEFAULT_GAS_BUDGET_CAP_MIST = 100_000_000n
const DEFAULT_GAS_BUDGET_BUFFER_MIST = 2_000_000n
const DEFAULT_HEALTH_MIN_CAP_MULTIPLIER = 5n
const DEFAULT_MIN_GAS_COMPENSATION = 100_000_000n
const DEFAULT_MAX_PLATFORM_CLAIM_GAS_MIST = 30_000_000n
const DEFAULT_SPONSOR_COIN_POOL_UNIT_MIST = 150_000_000n

function parseEnvNumber(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number
): number {
  const raw = env[name]
  if (!raw) return fallback
  const n = Number(raw.replace(/_/g, '').replace(/,/g, '').trim())
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function parseCoinMergeThresholdMist(env: Record<string, string | undefined>): bigint {
  const raw = env.COIN_MERGE_THRESHOLD_SUI
  if (!raw) return 100_000_000n
  const sui = parseFloat(raw.replace(/_/g, '').replace(/,/g, '').trim())
  if (!Number.isFinite(sui) || sui < 0) return 100_000_000n
  return BigInt(Math.floor(sui * 1_000_000_000))
}

export function loadGasConfig(env: Record<string, string | undefined> = {}): GasConfig {
  const minGasCompensationAmount = parseEnvBigInt(
    env,
    'MIN_GAS_COMPENSATION_AMOUNT',
    parseEnvBigInt(env, 'GAS_COMPENSATION_AMOUNT', DEFAULT_MIN_GAS_COMPENSATION)
  )

  return {
    gasBudgetCapMist: parseEnvBigInt(env, 'GAS_BUDGET_CAP_MIST', DEFAULT_GAS_BUDGET_CAP_MIST),
    gasBudgetBufferMist: parseEnvBigInt(env, 'GAS_BUDGET_BUFFER_MIST', DEFAULT_GAS_BUDGET_BUFFER_MIST),
    healthMinCapMultiplier: parseEnvBigInt(
      env,
      'GAS_HEALTH_MIN_CAP_MULTIPLIER',
      DEFAULT_HEALTH_MIN_CAP_MULTIPLIER
    ),
    minGasCompensationAmount,
    maxPlatformClaimGasMist: parseEnvBigInt(
      env,
      'MAX_PLATFORM_CLAIM_GAS_MIST',
      DEFAULT_MAX_PLATFORM_CLAIM_GAS_MIST
    ),
    platformSponsorDailyLimit: parseEnvNumber(env, 'PLATFORM_SPONSOR_DAILY_LIMIT', 3),
    minPlatformSponsorTier: parseEnvNumber(env, 'MIN_PLATFORM_SPONSOR_TIER', 0),
    gasSponsorRateLimitMax: parseEnvNumber(env, 'GAS_SPONSOR_RATE_LIMIT_MAX', 2),
    gasSponsorRateLimitWindowMs: parseEnvNumber(env, 'GAS_SPONSOR_RATE_LIMIT_WINDOW_MS', 60_000),
    gasSponsorRateLimitMaxPerWallet: parseEnvNumber(env, 'GAS_SPONSOR_RATE_LIMIT_MAX_PER_WALLET', 5),
    gasSponsorRateLimitWalletWindowMs: parseEnvNumber(
      env,
      'GAS_SPONSOR_RATE_LIMIT_WALLET_WINDOW_MS',
      60_000
    ),
    coinMergeThresholdMist: parseCoinMergeThresholdMist(env),
    coinMergeTriggerCount: parseEnvNumber(env, 'COIN_MERGE_TRIGGER_COUNT', 50),
    coinMergeIntervalMs: parseEnvNumber(env, 'COIN_MERGE_INTERVAL_MS', 3_600_000),
    sponsorCoinPoolTarget: parseEnvNumber(env, 'SPONSOR_COIN_POOL_TARGET', 50),
    sponsorCoinPoolUnitMist: parseEnvBigInt(
      env,
      'SPONSOR_COIN_POOL_UNIT_MIST',
      DEFAULT_SPONSOR_COIN_POOL_UNIT_MIST
    ),
    sponsorCoinPoolCheckIntervalMs: parseEnvNumber(env, 'SPONSOR_COIN_POOL_CHECK_MS', 60_000),
    coinQueueLockTtlMs: parseEnvNumber(env, 'COIN_QUEUE_LOCK_TTL_MS', 30_000),
    coinQueueAcquireRetries: parseEnvNumber(env, 'COIN_QUEUE_ACQUIRE_RETRIES', 3),
    coinInventoryRefreshMs: parseEnvNumber(env, 'COIN_INVENTORY_REFRESH_MS', 5_000),
    sponsorCoinDryRunMaxRetries: parseEnvNumber(env, 'SPONSOR_COIN_DRY_RUN_MAX_RETRIES', 1),
  }
}

export function healthMinBalanceMist(config: GasConfig): bigint {
  return config.gasBudgetCapMist * config.healthMinCapMultiplier
}

export function assertGasConfig(config: GasConfig): void {
  const errors: string[] = []

  if (config.maxPlatformClaimGasMist > config.gasBudgetCapMist) {
    errors.push(
      `MAX_PLATFORM_CLAIM_GAS_MIST (${config.maxPlatformClaimGasMist}) must be <= GAS_BUDGET_CAP_MIST (${config.gasBudgetCapMist})`
    )
  }
  if (config.gasBudgetBufferMist >= config.gasBudgetCapMist) {
    errors.push(
      `GAS_BUDGET_BUFFER_MIST (${config.gasBudgetBufferMist}) must be < GAS_BUDGET_CAP_MIST (${config.gasBudgetCapMist})`
    )
  }
  if (config.coinMergeThresholdMist > config.gasBudgetCapMist) {
    errors.push(
      `COIN_MERGE_THRESHOLD (${config.coinMergeThresholdMist} MIST) must be <= GAS_BUDGET_CAP_MIST (${config.gasBudgetCapMist})`
    )
  }
  // Pool coins below the merge threshold would be merged right back; below the
  // budget cap they are never picked by the lock store. Both make the pool useless.
  if (config.sponsorCoinPoolUnitMist <= config.coinMergeThresholdMist) {
    errors.push(
      `SPONSOR_COIN_POOL_UNIT_MIST (${config.sponsorCoinPoolUnitMist}) must be > COIN_MERGE_THRESHOLD (${config.coinMergeThresholdMist} MIST)`
    )
  }
  if (config.sponsorCoinPoolUnitMist < config.gasBudgetCapMist) {
    errors.push(
      `SPONSOR_COIN_POOL_UNIT_MIST (${config.sponsorCoinPoolUnitMist}) must be >= GAS_BUDGET_CAP_MIST (${config.gasBudgetCapMist})`
    )
  }
  if (config.gasBudgetCapMist > config.minGasCompensationAmount) {
    errors.push(
      `GAS_BUDGET_CAP_MIST (${config.gasBudgetCapMist}) must be <= MIN_GAS_COMPENSATION_AMOUNT (${config.minGasCompensationAmount})`
    )
  }

  if (errors.length > 0) {
    throw new Error(`Invalid gas config:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  }
}
