import { describe, expect, it } from 'vitest'
import { estimateFundCostV2, SSR_BASE_PER_UNIT } from './ptb'

const DEFAULT_FEE = { totalFeeBps: 2000n, discountBps: 5000n }

describe('estimateFundCostV2 (additive royalty on reward budget)', () => {
  it('charges 10% on net budget and gross = net + fee', () => {
    const est = estimateFundCostV2({
      perResponse: 10n,
      maxResponses: 100,
      totalSuiInvested: 0n,
      feeConfig: DEFAULT_FEE,
      creatorSsrBalance: 0n,
    })

    const net = 10n * 100n * SSR_BASE_PER_UNIT
    const fee = (net * 1000n) / 10000n
    expect(est.netSsrBase).toBe(net)
    expect(est.effectiveFeeBps).toBe(1000n)
    expect(est.feeBase).toBe(fee)
    expect(est.grossSsrBase).toBe(net + fee)
    expect(est.offsetIn).toBe(0n)
    expect(est.minted).toBe(net + fee)
  })

  it('includes repeat rewards in net and fee base', () => {
    const est = estimateFundCostV2({
      perResponse: 5n,
      repeatReward: 2n,
      repeatMaxTimes: 3,
      maxResponses: 10,
      totalSuiInvested: 0n,
      feeConfig: DEFAULT_FEE,
      creatorSsrBalance: 0n,
    })

    const net = (5n * 10n + 2n * 10n * 3n) * SSR_BASE_PER_UNIT
    const fee = (net * 1000n) / 10000n
    expect(est.netSsrBase).toBe(net)
    expect(est.feeBase).toBe(fee)
    expect(est.grossSsrBase).toBe(net + fee)
  })

  it('uses full SSR offset when balance covers gross', () => {
    const est = estimateFundCostV2({
      perResponse: 1n,
      maxResponses: 10,
      totalSuiInvested: 0n,
      feeConfig: DEFAULT_FEE,
      creatorSsrBalance: 20n * SSR_BASE_PER_UNIT,
    })

    expect(est.suiToInvest).toBe(0n)
    expect(est.minted).toBe(0n)
    expect(est.offsetIn).toBe(est.grossSsrBase)
  })

  it('respects custom fee config effective bps', () => {
    const est = estimateFundCostV2({
      perResponse: 100n,
      maxResponses: 1,
      totalSuiInvested: 0n,
      feeConfig: { totalFeeBps: 500n, discountBps: 8000n },
      creatorSsrBalance: 0n,
    })

    const net = 100n * SSR_BASE_PER_UNIT
    expect(est.effectiveFeeBps).toBe(400n)
    expect(est.feeBase).toBe((net * 400n) / 10000n)
    expect(est.grossSsrBase).toBe(net + est.feeBase)
  })
})
