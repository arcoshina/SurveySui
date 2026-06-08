import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { insertRevokedNullifier, deleteRevokedNullifier } from './db.js'

interface RevokeRequestBody {
  nullifier: string
  source: number
  passId?: string
  reason?: string
}

interface UnrevokeRequestBody {
  nullifier: string
  source: number
}

function verifyAdminSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    reply.status(500).send({ error: 'server_misconfigured', message: 'ADMIN_SECRET not set on server' })
    return false
  }

  const authHeader = req.headers.authorization
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    reply.status(401).send({ error: 'unauthorized', message: 'Invalid or missing admin credentials' })
    return false
  }
  return true
}

export function registerAdminRevocationRoutes(app: FastifyInstance): void {
  app.post(
    '/api/admin/revocation/revoke',
    async (req: FastifyRequest<{ Body: RevokeRequestBody }>, reply: FastifyReply) => {
      if (!verifyAdminSecret(req, reply)) return

      const { nullifier, source, passId, reason } = req.body ?? {}
      if (!nullifier || source === undefined) {
        return reply.status(400).send({ error: 'missing_params', message: 'nullifier and source are required' })
      }

      try {
        await insertRevokedNullifier(nullifier, source, passId, reason)
        return { success: true, message: `Nullifier ${nullifier} has been revoked successfully` }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: 'revocation_failed', message: err.message })
      }
    }
  )

  app.post(
    '/api/admin/revocation/unrevoke',
    async (req: FastifyRequest<{ Body: UnrevokeRequestBody }>, reply: FastifyReply) => {
      if (!verifyAdminSecret(req, reply)) return

      const { nullifier, source } = req.body ?? {}
      if (!nullifier || source === undefined) {
        return reply.status(400).send({ error: 'missing_params', message: 'nullifier and source are required' })
      }

      try {
        await deleteRevokedNullifier(nullifier, source)
        return { success: true, message: `Nullifier ${nullifier} has been unrevoked successfully` }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: 'unrevocation_failed', message: err.message })
      }
    }
  )
}
