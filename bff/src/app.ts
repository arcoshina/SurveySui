import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import type { SuiClient } from '@mysten/sui/client'
import type { LRUCache } from 'lru-cache'
import type { StatsResponse } from './types.js'
import { registerStatsRoutes } from './stats/handler.js'
import { registerOgRoutes } from './og/handler.js'
import { registerAuthRoutes } from './auth/handler.js'

export interface BffAppDeps {
  suiClient: SuiClient
  cache: LRUCache<string, StatsResponse>
  packageId: string
  frontendUrl?: string
  logger?: boolean
}

export async function buildApp(deps: BffAppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false })
  await app.register(cors, { origin: true })
  app.get('/health', async () => ({ status: 'ok' }))
  registerStatsRoutes(app, deps)
  registerOgRoutes(app, { frontendUrl: deps.frontendUrl ?? 'http://localhost:5173' })
  registerAuthRoutes(app)
  return app
}
