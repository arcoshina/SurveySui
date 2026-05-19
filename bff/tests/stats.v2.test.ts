import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SuiClient } from '@mysten/sui/client'
import { buildApp } from '../src/app.js'
import { createStatsCache } from '../src/stats/cache.js'

vi.mock('@mysten/sui/client')

const mockQueryEvents = vi.fn()
const mockSuiClient = { queryEvents: mockQueryEvents } as unknown as SuiClient

function makeFakeResultsOnlyPage(
  vaultId: string,
  respondents: string[],
  hasNextPage = false,
) {
  return {
    data: respondents.map(r => ({
      parsedJson: {
        vault_id: vaultId,
        sub_hash: [1, 2, 3],
        respondent: r,
        // Represents some ECIES encrypted results-only answers payload
        encrypted_answers: [20, 40, 60, 80],
        claimed_at_ms: 1_700_000_000_000,
      },
    })),
    hasNextPage,
    nextCursor: hasNextPage ? { txDigest: 'cur', eventSeq: '0' } : null,
  }
}

describe('TDD — S2.3 BFF Stats Integration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('test_bff_stats_aggregates_by_index — BFF /stats/:vault 對結果-only 格式聚合正確', async () => {
    mockQueryEvents.mockResolvedValueOnce(makeFakeResultsOnlyPage('0xvault-v2', ['0xuser1', '0xuser2']))
    const app = await buildApp({
      suiClient: mockSuiClient,
      cache: createStatsCache(),
      packageId: '0xpkg',
      logger: false,
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/stats/0xvault-v2' })
      expect(res.statusCode).toBe(200)
      const body = res.json<{
        vaultId: string
        total_responses: number
        events: Array<{
          vault_id: string
          sub_hash: number[]
          respondent: string
          encrypted_answers: number[]
          claimed_at_ms: number
        }>
      }>()
      expect(body.vaultId).toBe('0xvault-v2')
      expect(body.total_responses).toBe(2)
      expect(body.events).toHaveLength(2)
      expect(body.events[0].respondent).toBe('0xuser1')
      expect(body.events[0].encrypted_answers).toEqual([20, 40, 60, 80])
    } finally {
      await app.close()
    }
  })
})
