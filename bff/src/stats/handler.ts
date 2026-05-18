import type { FastifyInstance } from 'fastify'
import type { SuiClient } from '@mysten/sui/client'
import type { LRUCache } from 'lru-cache'
import type { StatsResponse } from '../types.js'
import { fetchClaimedEvents } from './fetcher.js'
import { aggregateEvents } from './aggregator.js'

export interface StatsHandlerDeps {
  suiClient: SuiClient
  cache: LRUCache<string, StatsResponse>
  packageId: string
}

export function registerStatsRoutes(app: FastifyInstance, deps: StatsHandlerDeps): void {
  app.get<{ Params: { vaultId: string } }>('/stats/:vaultId', async (req, reply) => {
    const { vaultId } = req.params
    if (!vaultId) return reply.code(400).send({ error: 'invalid_vault_id' })

    const cached = deps.cache.get(vaultId)
    if (cached) return reply.code(200).send(cached)

    try {
      const events = await fetchClaimedEvents(deps.suiClient, vaultId, deps.packageId)
      const response = aggregateEvents(vaultId, events)
      deps.cache.set(vaultId, response)
      return reply.code(200).send(response)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      return reply.code(502).send({ error: 'rpc_error', message })
    }
  })
}
