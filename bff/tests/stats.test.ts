import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SuiClient } from '@mysten/sui/client'
import { buildApp } from '../src/app.js'
import { createStatsCache } from '../src/stats/cache.js'

vi.mock('@mysten/sui/client')

const mockQueryEvents = vi.fn()
const mockSuiClient = { queryEvents: mockQueryEvents } as unknown as SuiClient

function makeFakePage(
  vaultId: string,
  respondents: string[],
  hasNextPage = false,
) {
  return {
    data: respondents.map(r => ({
      parsedJson: {
        vault_id: vaultId,
        sub_hash: [1],
        respondent: r,
        encrypted_answers: [10, 20],
        claimed_at_ms: 1_700_000_000_000,
      },
    })),
    hasNextPage,
    nextCursor: hasNextPage ? { txDigest: 'cur', eventSeq: '0' } : null,
  }
}

// ── test_stats_aggregates_events ──────────────────────────────────────────────

describe('test_stats_aggregates_events', () => {
  beforeEach(() => vi.clearAllMocks())

  it('回傳 total_responses + events 列表', async () => {
    mockQueryEvents.mockResolvedValueOnce(makeFakePage('0xvault', ['0xa', '0xb']))
    const app = await buildApp({
      suiClient: mockSuiClient,
      cache: createStatsCache(),
      packageId: '0xpkg',
      logger: false,
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/stats/0xvault' })
      expect(res.statusCode).toBe(200)
      const body = res.json<{
        vaultId: string
        total_responses: number
        events: Array<{ encrypted_answers: number[] }>
      }>()
      expect(body.total_responses).toBe(2)
      expect(body.events).toHaveLength(2)
      expect(body.events[0].encrypted_answers).toEqual([10, 20])
    } finally {
      await app.close()
    }
  })

  it('多頁分頁全部拉取', async () => {
    mockQueryEvents
      .mockResolvedValueOnce(makeFakePage('0xvault2', ['0xa'], true))
      .mockResolvedValueOnce(makeFakePage('0xvault2', ['0xb']))
    const app = await buildApp({
      suiClient: mockSuiClient,
      cache: createStatsCache(),
      packageId: '0xpkg',
      logger: false,
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/stats/0xvault2' })
      expect(res.json<{ total_responses: number }>().total_responses).toBe(2)
      expect(mockQueryEvents).toHaveBeenCalledTimes(2)
    } finally {
      await app.close()
    }
  })

  it('RPC 錯誤回傳 502', async () => {
    mockQueryEvents.mockRejectedValueOnce(new Error('timeout'))
    const app = await buildApp({
      suiClient: mockSuiClient,
      cache: createStatsCache(),
      packageId: '0xpkg',
      logger: false,
    })
    try {
      const res = await app.inject({ method: 'GET', url: '/stats/0xvault3' })
      expect(res.statusCode).toBe(502)
      expect(res.json<{ error: string }>().error).toBe('rpc_error')
    } finally {
      await app.close()
    }
  })
})

// ── test_cache_hit_skips_rpc ──────────────────────────────────────────────────

describe('test_cache_hit_skips_rpc', () => {
  beforeEach(() => vi.clearAllMocks())

  it('第二次請求走快取，RPC 只呼叫一次', async () => {
    mockQueryEvents.mockResolvedValueOnce(makeFakePage('0xcvault', ['0xa']))
    const cache = createStatsCache()
    const app = await buildApp({
      suiClient: mockSuiClient,
      cache,
      packageId: '0xpkg',
      logger: false,
    })
    try {
      const r1 = await app.inject({ method: 'GET', url: '/stats/0xcvault' })
      const r2 = await app.inject({ method: 'GET', url: '/stats/0xcvault' })
      expect(r1.statusCode).toBe(200)
      expect(r2.statusCode).toBe(200)
      expect(mockQueryEvents).toHaveBeenCalledTimes(1)
      expect(r1.json()).toEqual(r2.json())
    } finally {
      await app.close()
    }
  })

  it('不同 vaultId 各自呼叫 RPC', async () => {
    mockQueryEvents
      .mockResolvedValueOnce(makeFakePage('0xva', ['0xa']))
      .mockResolvedValueOnce(makeFakePage('0xvb', ['0xb']))
    const cache = createStatsCache()
    const app = await buildApp({
      suiClient: mockSuiClient,
      cache,
      packageId: '0xpkg',
      logger: false,
    })
    try {
      await app.inject({ method: 'GET', url: '/stats/0xva' })
      await app.inject({ method: 'GET', url: '/stats/0xvb' })
      expect(mockQueryEvents).toHaveBeenCalledTimes(2)
    } finally {
      await app.close()
    }
  })
})
