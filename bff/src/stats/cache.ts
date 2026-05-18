import { LRUCache } from 'lru-cache'
import type { StatsResponse } from '../types.js'

export const CACHE_TTL_MS = 60_000

export function createStatsCache(ttl = CACHE_TTL_MS): LRUCache<string, StatsResponse> {
  return new LRUCache<string, StatsResponse>({ max: 500, ttl })
}
