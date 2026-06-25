import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadGasConfig,
  assertGasConfig,
  healthMinBalanceMist,
  __resetGasConfigCache,
} from '../src/gas/gasConfig.js'

describe('gasConfig', () => {
  const envBackup: Record<string, string | undefined> = {}

  beforeEach(() => {
    __resetGasConfigCache()
    for (const key of [
      'GAS_BUDGET_CAP_MIST',
      'GAS_BUDGET_BUFFER_MIST',
      'MIN_GAS_COMPENSATION_AMOUNT',
      'MAX_PLATFORM_CLAIM_GAS_MIST',
      'COIN_MERGE_THRESHOLD_SUI',
      'COIN_MERGE_TRIGGER_COUNT',
      'PLATFORM_CLAIM_SPONSOR_ENABLED',
    ]) {
      envBackup[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    __resetGasConfigCache()
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }
  })

  it('loads defaults aligned with production plan', () => {
    const cfg = loadGasConfig()
    expect(cfg.gasBudgetCapMist).toBe(100_000_000n)
    expect(cfg.gasBudgetBufferMist).toBe(2_000_000n)
    expect(cfg.minGasCompensationAmount).toBe(100_000_000n)
    expect(healthMinBalanceMist(cfg)).toBe(500_000_000n)
  })

  it('parses underscored env values', () => {
    process.env.GAS_BUDGET_CAP_MIST = '50_000_000'
    process.env.MIN_GAS_COMPENSATION_AMOUNT = '50_000_000'
    process.env.COIN_MERGE_THRESHOLD_SUI = '0.03'
    __resetGasConfigCache()
    const cfg = loadGasConfig()
    expect(cfg.gasBudgetCapMist).toBe(50_000_000n)
    assertGasConfig(cfg)
  })

  it('fails when platform cap exceeds budget cap', () => {
    process.env.GAS_BUDGET_CAP_MIST = '10_000_000'
    process.env.MIN_GAS_COMPENSATION_AMOUNT = '10_000_000'
    process.env.MAX_PLATFORM_CLAIM_GAS_MIST = '20_000_000'
    __resetGasConfigCache()
    expect(() => assertGasConfig(loadGasConfig())).toThrow(/MAX_PLATFORM_CLAIM_GAS_MIST/)
  })

  it('defaults platformClaimSponsorEnabled to false and parses true', () => {
    expect(loadGasConfig().platformClaimSponsorEnabled).toBe(false)
    process.env.PLATFORM_CLAIM_SPONSOR_ENABLED = 'true'
    __resetGasConfigCache()
    expect(loadGasConfig().platformClaimSponsorEnabled).toBe(true)
    process.env.PLATFORM_CLAIM_SPONSOR_ENABLED = 'false'
    __resetGasConfigCache()
    expect(loadGasConfig().platformClaimSponsorEnabled).toBe(false)
  })

  it('fails when budget cap exceeds min compensation', () => {
    process.env.GAS_BUDGET_CAP_MIST = '200_000_000'
    process.env.MIN_GAS_COMPENSATION_AMOUNT = '100_000_000'
    __resetGasConfigCache()
    expect(() => assertGasConfig(loadGasConfig())).toThrow(/GAS_BUDGET_CAP_MIST/)
  })
})
