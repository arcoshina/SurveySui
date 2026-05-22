import { describe, it, expect } from 'vitest'
import { estimateFundCostV2 } from '../ptb'

describe('estimateFundCostV2 — S2.1 對拍 Move', () => {
  it('test_estimateFundCostV2_matches_move — 對拍 5 組計算結果', () => {
    // Case 1: no offset, total=0, fee=10% (DEFAULT)
    const res1 = estimateFundCostV2({
      perResponse: 90n,
      maxResponses: 1,
      totalSuiInvested: 0n,
      feeConfig: { totalFeeBps: 2000n, discountBps: 5000n },
      creatorSsrBalance: 0n,
    })
    expect(res1.netSsrBase).toBe(90_000_000_000n)
    expect(res1.effectiveFeeBps).toBe(1000n)
    expect(res1.grossSsrBase).toBe(100_000_000_000n)
    expect(res1.offsetIn).toBe(0n)
    expect(res1.minted).toBe(100_000_000_000n)
    expect(res1.suiToInvest).toBe(100_000_000n)

    // Case 2: partial offset, total=0, fee=10%
    const res2 = estimateFundCostV2({
      perResponse: 90n,
      maxResponses: 1,
      totalSuiInvested: 0n,
      feeConfig: { totalFeeBps: 2000n, discountBps: 5000n },
      creatorSsrBalance: 50_000_000_000n,
    })
    expect(res2.netSsrBase).toBe(90_000_000_000n)
    expect(res2.effectiveFeeBps).toBe(1000n)
    expect(res2.grossSsrBase).toBe(100_000_000_000n)
    expect(res2.offsetIn).toBe(50_000_000_000n)
    expect(res2.minted).toBe(50_000_000_000n)
    expect(res2.suiToInvest).toBe(50_000_000n)

    // Case 3: no offset, total=500 SUI, fee=10%
    const res3 = estimateFundCostV2({
      perResponse: 25n,
      maxResponses: 4,
      totalSuiInvested: 500_000_000_000n,
      feeConfig: { totalFeeBps: 2000n, discountBps: 5000n },
      creatorSsrBalance: 0n,
    })
    expect(res3.netSsrBase).toBe(100_000_000_000n)
    expect(res3.effectiveFeeBps).toBe(1000n)
    expect(res3.grossSsrBase).toBe(111_111_111_111n)
    expect(res3.offsetIn).toBe(0n)
    expect(res3.minted).toBe(111_111_111_111n)
    expect(res3.suiToInvest).toBe(166_666_667n)

    // Case 4: partial offset, total=100 SUI, fee=4.5% (total 15%, discount 30%)
    const res4 = estimateFundCostV2({
      perResponse: 100n,
      maxResponses: 10,
      totalSuiInvested: 100_000_000_000n,
      feeConfig: { totalFeeBps: 1500n, discountBps: 3000n },
      creatorSsrBalance: 500_000_000_000n,
    })
    expect(res4.netSsrBase).toBe(1_000_000_000_000n)
    expect(res4.effectiveFeeBps).toBe(450n)
    expect(res4.grossSsrBase).toBe(1_047_120_418_848n)
    expect(res4.offsetIn).toBe(500_000_000_000n)
    expect(res4.minted).toBe(547_120_418_848n)
    expect(res4.suiToInvest).toBe(601_832_461n)

    // Case 5: no offset, total=2000 SUI, fee=0% (discount 100%)
    const res5 = estimateFundCostV2({
      perResponse: 10n,
      maxResponses: 2,
      totalSuiInvested: 2_000_000_000_000n,
      feeConfig: { totalFeeBps: 2000n, discountBps: 0n },
      creatorSsrBalance: 0n,
    })
    expect(res5.netSsrBase).toBe(20_000_000_000n)
    expect(res5.effectiveFeeBps).toBe(0n)
    expect(res5.grossSsrBase).toBe(20_000_000_000n)
    expect(res5.offsetIn).toBe(0n)
    expect(res5.minted).toBe(20_000_000_000n)
    expect(res5.suiToInvest).toBe(60_000_000n)
  })

  it('test_estimateFundCostV2_handles_zero_offset — 當 SSR = 0 時，offset_in 為 0 且 minted 為 gross_ssr', () => {
    const res = estimateFundCostV2({
      perResponse: 90n,
      maxResponses: 1,
      totalSuiInvested: 0n,
      feeConfig: { totalFeeBps: 2000n, discountBps: 5000n },
      creatorSsrBalance: 0n,
    })
    expect(res.offsetIn).toBe(0n)
    expect(res.minted).toBe(res.grossSsrBase)
  })

  it('test_estimateFundCostV2_handles_overfund_offset — 當 SSR 足夠時，sui_to_invest = 0, minted = 0, offset_in = gross_ssr', () => {
    const res = estimateFundCostV2({
      perResponse: 90n,
      maxResponses: 1,
      totalSuiInvested: 0n,
      feeConfig: { totalFeeBps: 2000n, discountBps: 5000n },
      creatorSsrBalance: 150_000_000_000n,
    })
    expect(res.grossSsrBase).toBe(100_000_000_000n)
    expect(res.offsetIn).toBe(100_000_000_000n)
    expect(res.minted).toBe(0n)
    expect(res.suiToInvest).toBe(0n)
  })
})
