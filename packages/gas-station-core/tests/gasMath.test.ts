import { describe, it, expect } from 'vitest'
import {
  netGasFromEffects,
  upfrontGasFromEffects,
  resolveGasBudget,
} from '../src/gasMath.js'

describe('gasMath', () => {
  it('resolveGasBudget floors at 1 mist when net+buffer would be zero', () => {
    expect(resolveGasBudget(0n, 10_000n, 0n)).toBe(1n)
    expect(resolveGasBudget(-500n, 10_000n, 0n)).toBe(1n)
  })

  it('resolveGasBudget applies cap and buffer', () => {
    expect(resolveGasBudget(100n, 500n, 50n)).toBe(150n)
    expect(resolveGasBudget(1000n, 500n, 50n)).toBe(500n)
  })

  it('upfrontGasFromEffects ignores rebate', () => {
    const gasUsed = { computationCost: '100', storageCost: '50', storageRebate: '80' }
    expect(netGasFromEffects(gasUsed)).toBe(70n)
    expect(upfrontGasFromEffects(gasUsed)).toBe(150n)
  })
})
