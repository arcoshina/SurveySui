import type { FastifyInstance } from 'fastify'
import type { SuiClient } from '@mysten/sui/client'
import type { LRUCache } from 'lru-cache'
import type { StatsResponse } from '../types.js'
import { fetchClaimedEvents } from './fetcher.js'
import { aggregateEvents } from './aggregator.js'
import { cacheAnswerContent } from '../storage/cacheManager.js'

export interface StatsHandlerDeps {
  suiClient: SuiClient
  cache: LRUCache<string, StatsResponse>
  packageId: string
}

function parseOptionVector(opt: any): number[] | null {
  if (!opt) return null
  if (Array.isArray(opt)) {
    if (opt.length > 0 && typeof opt[0] === 'number') {
      return opt
    }
    if (opt.length > 0 && Array.isArray(opt[0])) {
      return opt[0]
    }
    return null
  }
  if (opt.vec && Array.isArray(opt.vec)) {
    if (opt.vec.length === 0) return null
    return opt.vec[0]
  }
  if (opt.fields && opt.fields.vec && Array.isArray(opt.fields.vec)) {
    if (opt.fields.vec.length === 0) return null
    return opt.fields.vec[0]
  }
  return null
}

export function registerStatsRoutes(app: FastifyInstance, deps: StatsHandlerDeps): void {
  app.get<{ Params: { vaultId: string } }>('/stats/:vaultId', async (req, reply) => {
    const { vaultId } = req.params
    if (!vaultId) return reply.code(400).send({ error: 'invalid_vault_id' })

    const cached = deps.cache.get(vaultId)
    if (cached) return reply.code(200).send(cached)

    try {
      const events = await fetchClaimedEvents(deps.suiClient, vaultId, deps.packageId)
      
      const processedEvents = await Promise.all(
        events.map(async (ev) => {
          let encryptedAnswers = parseOptionVector(ev.encrypted_answers)
          const answerBlobIdBytes = parseOptionVector(ev.answer_blob_id)

          if (!encryptedAnswers && answerBlobIdBytes && answerBlobIdBytes.length > 0) {
            try {
              const blobIdStr = Buffer.from(answerBlobIdBytes).toString('utf8')
              const cachedBuf = await cacheAnswerContent(blobIdStr)
              encryptedAnswers = Array.from(cachedBuf)
            } catch (err: any) {
              req.log.error(`[Stats] Failed to cache/download answer blob: ${err.message}`)
            }
          }

          return {
            ...ev,
            encrypted_answers: encryptedAnswers,
            answer_blob_id: answerBlobIdBytes,
          } as any
        })
      )

      const response = aggregateEvents(vaultId, processedEvents)
      deps.cache.set(vaultId, response)
      return reply.code(200).send(response)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      return reply.code(502).send({ error: 'rpc_error', message })
    }
  })
}
