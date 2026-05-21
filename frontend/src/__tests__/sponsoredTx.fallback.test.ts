import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SuiClient } from '@mysten/sui/client'
import type { Transaction } from '@mysten/sui/transactions'
import { executeTxWithFallback } from '../lib/sponsoredTx'

const mockFetch = vi.fn()
global.fetch = mockFetch

function makeTx() {
  return {
    setSender: vi.fn(),
    build: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  } as unknown as Transaction
}

function makeClient(dryRunStatus: 'success' | 'failure' = 'success', error?: string) {
  return {
    dryRunTransactionBlock: vi.fn().mockResolvedValue({
      effects: { status: { status: dryRunStatus, ...(error ? { error } : {}) } },
    }),
  } as unknown as SuiClient
}

describe('S4.3 Gas Station Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('test_sponsored_tx_uses_bff_when_available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        sponsoredTxBytes: 'sponsored_bytes_b64',
        sponsorSignature: 'sponsor_sig',
      }),
    })

    const signAndExecute = vi.fn()
    const result = await executeTxWithFallback({
      tx: makeTx(),
      senderAddress: '0x01',
      client: makeClient(),
      signAndExecute,
    })

    expect(result.mode).toBe('sponsored')
    if (result.mode === 'sponsored') {
      expect(result.sponsoredTxBytes).toBe('sponsored_bytes_b64')
      expect(result.sponsorSignature).toBe('sponsor_sig')
    }
    expect(signAndExecute).not.toHaveBeenCalled()
  })

  it('test_sponsored_tx_falls_back_to_self_paid_on_bff_unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const signAndExecute = vi.fn().mockResolvedValue({ digest: '0xabc123' })
    const result = await executeTxWithFallback({
      tx: makeTx(),
      senderAddress: '0x01',
      client: makeClient('success'),
      signAndExecute,
    })

    expect(result.mode).toBe('self_paid')
    if (result.mode === 'self_paid') {
      expect(result.digest).toBe('0xabc123')
    }
    expect(signAndExecute).toHaveBeenCalledOnce()
  })

  it('test_sponsored_tx_does_not_fallback_on_dryrun_reject', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const signAndExecute = vi.fn()
    await expect(
      executeTxWithFallback({
        tx: makeTx(),
        senderAddress: '0x01',
        client: makeClient('failure', 'MoveAbort(0x2::survey_vault, 5)'),
        signAndExecute,
      })
    ).rejects.toThrow('MoveAbort')

    expect(signAndExecute).not.toHaveBeenCalled()
  })

  it('test_sponsored_tx_fallback_emits_telemetry', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const signAndExecute = vi.fn().mockResolvedValue({ digest: '0xtel' })

    await executeTxWithFallback({
      tx: makeTx(),
      senderAddress: '0x01',
      client: makeClient('success'),
      signAndExecute,
    })

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('gas-fallback')
    )
    warnSpy.mockRestore()
  })
})
