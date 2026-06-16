import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { SuiClient } from '@mysten/sui/client'
import { ensureBffSchema } from './security/db.js'
import { rateLimit } from './http/rateLimit.js'
import { registerAuthRoutes } from './auth/handler.js'
import { registerGasRoutes } from './gas/handler.js'
import type { SponsorCoinQueue } from './gas/sponsorCoinQueue.js'
import { registerPassRoutes } from './pass/handler.js'
import { registerTicketRoutes } from './pass/ticket_handler.js'
import { registerAdminRevocationRoutes } from './security/revocation_handler.js'
import { registerImageProxyRoutes } from './security/imageProxy.js'

export interface BffAppDeps {
  suiClient: SuiClient
  packageId: string
  frontendUrl?: string
  sponsorCoinQueue?: SponsorCoinQueue
}

export type BffApp = Hono

export function buildApp(deps: BffAppDeps): BffApp {
  const app = new Hono()

  // schema 兜底（每 isolate 首次請求建表一次；正式以 migration 為準）
  app.use('*', async (c, next) => {
    await ensureBffSchema()
    await next()
  })

  // CORS：沿用 frontendUrl 白名單（+ 本地開發）。以 function 形式精準控管：
  // 白名單外的 origin 回傳 null → 不設 Access-Control-Allow-Origin 標頭。
  const allowed = deps.frontendUrl
    ? [deps.frontendUrl, 'http://localhost:5173']
    : ['http://localhost:5173']
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!deps.frontendUrl) return origin || '*'
        return allowed.includes(origin) ? origin : null
      },
      credentials: true,
    })
  )

  // 全域速率限制（取代 @fastify/rate-limit global 60/min）；跳過健康檢查
  const globalLimiter = rateLimit({ max: 60, windowMs: 60_000, key: 'global' })
  app.use('*', async (c, next) => {
    if (c.req.path === '/health') return next()
    return globalLimiter(c, next)
  })

  app.get('/health', (c) => c.json({ status: 'ok' }))

  registerImageProxyRoutes(app)
  registerAdminRevocationRoutes(app)
  registerAuthRoutes(app)
  registerGasRoutes(app, {
    suiClient: deps.suiClient,
    packageId: deps.packageId,
    coinQueue: deps.sponsorCoinQueue,
  })
  registerPassRoutes(app, { suiClient: deps.suiClient })
  registerTicketRoutes(app, { suiClient: deps.suiClient })

  return app
}
