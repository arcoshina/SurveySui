import { describe, expect, it } from 'vitest'
import {
  SSR_BASE_PER_UNIT,
  buildCreateSurveyPtb,
  computeSsrOut,
  estimateFundCostV2,
  invertSuiForMint,
} from './ptb'

const DEFAULT_FEE = { totalFeeBps: 2000n, discountBps: 5000n }

// 蒐集交易所有 Pure 輸入的 raw bytes，攤平成單一 buffer 供子序列搜尋。
function collectPureInputBytes(tx: ReturnType<typeof buildCreateSurveyPtb>): Uint8Array {
  const inputs = (tx.getData().inputs ?? []) as Array<{ Pure?: { bytes?: string } }>
  const chunks = inputs
    .map((i) => i?.Pure?.bytes)
    .filter((b): b is string => typeof b === 'string')
    .map((b) => new Uint8Array(Buffer.from(b, 'base64')))
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

function containsSubsequence(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0) return false
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let hit = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        hit = false
        break
      }
    }
    if (hit) return true
  }
  return false
}

describe('computeSsrOut / invertSuiForMint', () => {
  it('bootstrap: 1 SUI mints 1000 SSR', () => {
    const oneSui = 1_000_000_000n
    const out = computeSsrOut(oneSui, 0n, 0n)
    expect(out).toBe(1_000n * SSR_BASE_PER_UNIT)
    expect(invertSuiForMint(out, 0n, 0n)).toBe(oneSui)
  })

  it('ratio mint matches spec example', () => {
    const out = computeSsrOut(1_000_000_000n, 10_000_000_000n, 5_000_000_000n)
    expect(out).toBe(500n * SSR_BASE_PER_UNIT)
  })
})

describe('estimateFundCostV2 (additive royalty on reward budget)', () => {
  it('charges 10% on net budget and gross = net + fee', () => {
    const est = estimateFundCostV2({
      perResponse: 10n,
      maxResponses: 100,
      suiReserve: 0n,
      srReserve: 0n,
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
    expect(est.suiToInvest).toBe(
      invertSuiForMint(net + fee, 0n, 0n),
    )
  })

  it('includes repeat rewards in net and fee base', () => {
    const est = estimateFundCostV2({
      perResponse: 5n,
      repeatReward: 2n,
      repeatMaxTimes: 3,
      maxResponses: 10,
      suiReserve: 0n,
      srReserve: 0n,
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
      suiReserve: 0n,
      srReserve: 0n,
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
      suiReserve: 0n,
      srReserve: 0n,
      feeConfig: { totalFeeBps: 500n, discountBps: 8000n },
      creatorSsrBalance: 0n,
    })

    const net = 100n * SSR_BASE_PER_UNIT
    expect(est.effectiveFeeBps).toBe(400n)
    expect(est.feeBase).toBe((net * 400n) / 10000n)
    expect(est.grossSsrBase).toBe(net + est.feeBase)
  })

})

describe('buildCreateSurveyPtb redactQuestionContent', () => {
  const SECRET_PROMPT = 'SECRET_PROMPT_文字'
  const SECRET_OPTION = 'SECRET_OPTION_選項'
  const enc = new TextEncoder()

  const baseParams = {
    packageId: '0x2',
    poolId: '0x2',
    protocolConfigId: '0x2',
    srTreasuryId: '0x2',
    ssrTreasuryId: '0x2',
    registryId: '0x2',
    adminTreasury: '0x2',
    perResponse: 1n,
    maxResponses: 1,
    deadlineMs: 1n,
    encryptedContent: new Uint8Array([1, 2, 3]),
    suiToSpend: 0n,
    contentHash: new Uint8Array(32),
    schemaHash: new Uint8Array(32),
    creatorPubKey: new Uint8Array(32),
    questions: [
      { id: 'q-real-id', type: 'single_choice', prompt: SECRET_PROMPT, options_json: [SECRET_OPTION], required: true },
    ],
  }

  it('redact=true: 題幹與選項文字不出現在任何交易輸入', () => {
    const tx = buildCreateSurveyPtb({ ...baseParams, redactQuestionContent: true })
    const bytes = collectPureInputBytes(tx)
    expect(containsSubsequence(bytes, enc.encode(SECRET_PROMPT))).toBe(false)
    expect(containsSubsequence(bytes, enc.encode(SECRET_OPTION))).toBe(false)
  })

  it('redact=false（公開問卷）: 題幹與選項仍明文上鏈', () => {
    const tx = buildCreateSurveyPtb({ ...baseParams, redactQuestionContent: false })
    const bytes = collectPureInputBytes(tx)
    expect(containsSubsequence(bytes, enc.encode(SECRET_PROMPT))).toBe(true)
    expect(containsSubsequence(bytes, enc.encode(SECRET_OPTION))).toBe(true)
  })

  it('redact=true: schema_hash 由呼叫端傳入、不受佔位影響', () => {
    const schemaHash = new Uint8Array(32).fill(7)
    const tx = buildCreateSurveyPtb({ ...baseParams, schemaHash, redactQuestionContent: true })
    const bytes = collectPureInputBytes(tx)
    expect(containsSubsequence(bytes, schemaHash)).toBe(true)
  })
})

describe('estimateFundCostV2 tail', () => {
  it('inverts mint cost from pool reserves', () => {
    const minted = 500n * SSR_BASE_PER_UNIT
    const suiReserve = 10_000_000_000n
    const srReserve = 5_000_000_000n
    const est = estimateFundCostV2({
      perResponse: 500n,
      maxResponses: 1,
      suiReserve,
      srReserve,
      feeConfig: { totalFeeBps: 0n, discountBps: 0n },
      creatorSsrBalance: 0n,
    })
    expect(est.minted).toBe(minted)
    expect(est.suiToInvest).toBe(invertSuiForMint(minted, suiReserve, srReserve))
    expect(computeSsrOut(est.suiToInvest, suiReserve, srReserve)).toBeGreaterThanOrEqual(minted)
  })
})
