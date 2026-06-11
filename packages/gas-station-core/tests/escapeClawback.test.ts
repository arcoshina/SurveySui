import { describe, it, expect } from 'vitest'
import { minEscapeClawbackFromNetGas, minEscapeClawbackFromGasUsed } from '../src/escapeClawback.js'

describe('escapeClawback', () => {
  it('computes ceil(netGas * 110%)', () => {
    expect(minEscapeClawbackFromNetGas(1_400_000n)).toBe(1_540_000n)
    expect(minEscapeClawbackFromNetGas(1n)).toBe(2n)
    expect(minEscapeClawbackFromNetGas(0n)).toBe(1n)
  })

  it('reads gasUsed effects', () => {
    expect(
      minEscapeClawbackFromGasUsed({
        computationCost: '1000000',
        storageCost: '500000',
        storageRebate: '100000',
      })
    ).toBe(1_540_000n)
  })
})
