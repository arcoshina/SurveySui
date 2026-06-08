import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import type { SuiClient } from '@mysten/sui/client'
import type { LRUCache } from 'lru-cache'
import type { StatsResponse } from './types.js'
import { registerStatsRoutes } from './stats/handler.js'
import { registerOgRoutes } from './og/handler.js'
import { registerAuthRoutes } from './auth/handler.js'
import { registerGasRoutes } from './gas/handler.js'
import type { SponsorCoinQueue } from './gas/sponsorCoinQueue.js'
import { registerPassRoutes } from './pass/handler.js'
import { registerTicketRoutes } from './pass/ticket_handler.js'
import { registerStorageRoutes } from './storage/handler.js'
import { registerImageProxyRoutes } from './security/imageProxy.js'
import { registerAdminRevocationRoutes } from './security/revocation_handler.js'
import { initializeDb } from './security/db.js'

export interface BffAppDeps {
  suiClient: SuiClient
  cache: LRUCache<string, StatsResponse>
  packageId: string
  frontendUrl?: string
  logger?: boolean
  sponsorCoinQueue?: SponsorCoinQueue
}

export async function buildApp(deps: BffAppDeps): Promise<FastifyInstance> {
  initializeDb()
  const app = Fastify({ logger: deps.logger ?? false })
  
  await app.register(cors, {
    origin: deps.frontendUrl ? [deps.frontendUrl, 'http://localhost:5173'] : true,
    credentials: true,
  })

  await app.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: '1 minute',
  })

  app.get('/health', async () => ({ status: 'ok' }))
  registerImageProxyRoutes(app)
  registerAdminRevocationRoutes(app)
  registerStatsRoutes(app, deps)
  registerOgRoutes(app, { frontendUrl: deps.frontendUrl ?? 'http://localhost:5173' })
  registerAuthRoutes(app)
  registerGasRoutes(app, {
    suiClient: deps.suiClient,
    packageId: deps.packageId,
    coinQueue: deps.sponsorCoinQueue,
  })
  registerPassRoutes(app, deps)
  registerTicketRoutes(app, deps)
  registerStorageRoutes(app, deps)
  return app
}
