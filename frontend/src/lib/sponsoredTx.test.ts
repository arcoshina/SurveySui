import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { executeTxWithFallback } from './sponsoredTx.js'

describe('Frontend Sponsored Transaction Fallback Tests', () => {
  let mockSuiClient: any
  let mockSignAndExecute: any
  let originalFetch: any

  beforeEach(() => {
    mockSuiClient = {
      dryRunTransactionBlock: vi.fn().mockResolvedValue({
        effects: {
          status: { status: 'success' },
          gasUsed: { computationCost: '1000000', storageCost: '2000000', storageRebate: '500000' },
        },
      }),
    }

    mockSignAndExecute = vi.fn().mockResolvedValue({ digest: 'self_paid_digest_mock' })
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // 1. 當限流達到 3 次時，應攔截 PLATFORM_SPONSOR_LIMIT_REACHED 並正確走 self-paid fallback
  it('should catch PLATFORM_SPONSOR_LIMIT_REACHED and trigger self-paid fallback popup', async () => {
    // Mock fetch returning 403 PLATFORM_SPONSOR_LIMIT_REACHED
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
        message: 'Daily platform sponsorship limit reached for this wallet address',
      }),
    })

    const tx = new Transaction()
    // 我們使用一個 mock build 實作來防止真實 build 呼叫聯網
    tx.build = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))

    let fallbackCalled = false
    let gasEstimate: bigint = 0n

    const onSelfPaidFallback = async (estimate: bigint) => {
      fallbackCalled = true
      gasEstimate = estimate
      return true // 使用者同意
    }

    const result = await executeTxWithFallback({
      tx,
      senderAddress: '0x0000000000000000000000000000000000000000000000000000000000000003',
      client: mockSuiClient,
      backendUrl: 'http://localhost:3100',
      signAndExecute: mockSignAndExecute,
      onSelfPaidFallback,
    })

    expect(fallbackCalled).toBe(true)
    // 1000000 (computation) + 2000000 (storage) - 500000 (rebate) = 2500000
    expect(gasEstimate).toBe(2500000n)
    expect(result.mode).toBe('self_paid')
    expect(result).toHaveProperty('digest', 'self_paid_digest_mock')
    expect(mockSignAndExecute).toHaveBeenCalledWith(tx)
  })
})
