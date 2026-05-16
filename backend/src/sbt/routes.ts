import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { SbtService } from './sbt-service.js'

export interface SbtAdminRoutesDeps {
  sbtService: SbtService
  adminSecret: string
}

const RevokeBodySchema = z.object({
  sbtObjectId: z.string().min(1),
})

const ReissueBodySchema = z.object({
  sbtObjectId: z.string().min(1),
})

export function registerSbtAdminRoutes(
  app: FastifyInstance,
  deps: SbtAdminRoutesDeps,
): void {
  app.register(async (admin) => {
    admin.addHook('preHandler', async (req, reply) => {
      const auth = req.headers.authorization
      if (auth !== `Bearer ${deps.adminSecret}`) {
        return reply.code(401).send({ error: 'unauthorized' })
      }
    })

    admin.post('/admin/sbt/revoke', async (req, reply) => {
      const parsed = RevokeBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body' })
      }
      try {
        await deps.sbtService.adminRevoke(parsed.data.sbtObjectId)
        return { ok: true }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown'
        return reply.code(400).send({ error: msg })
      }
    })

    admin.post('/admin/sbt/reissue', async (req, reply) => {
      const parsed = ReissueBodySchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body' })
      }
      try {
        const result = await deps.sbtService.adminReissue(parsed.data.sbtObjectId)
        return { ok: true, sbtObjectId: result.sbtObjectId }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown'
        return reply.code(400).send({ error: msg })
      }
    })
  })
}
