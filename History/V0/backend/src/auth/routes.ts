import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { prisma } from '../db.js'
import { buildGoogleAuthUrl } from './google.js'
import { hashSub } from './sub.js'
import {
  ZkLoginVerificationError,
  type ZkLoginVerifier,
} from './zklogin-verifier.js'
import type { SbtService } from '../sbt/sbt-service.js'

export interface AuthRoutesDeps {
  verifier: ZkLoginVerifier
  googleClientId: string
  googleRedirectUri: string
  sbtService: SbtService
}

const StartQuerySchema = z.object({
  nonce: z.string().min(1),
})

const FinalizeBodySchema = z.object({
  jwt: z.string().min(1),
  zkProof: z.unknown(),
  ephPubkey: z.string().min(1),
  maxEpoch: z.number().int().nonnegative(),
  salt: z.string().min(1),
})

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRoutesDeps,
): void {
  app.get('/auth/google/start', async (req, reply) => {
    const parsed = StartQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query' })
    }
    const url = buildGoogleAuthUrl({
      clientId: deps.googleClientId,
      redirectUri: deps.googleRedirectUri,
      nonce: parsed.data.nonce,
    })
    return { url }
  })

  app.post('/auth/zklogin/finalize', async (req, reply) => {
    const parsed = FinalizeBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' })
    }

    try {
      const result = await deps.verifier.verify(parsed.data)
      const subHash = hashSub(result.sub)
      const user = await prisma.user.upsert({
        where: { zkSubHash: subHash },
        update: { suiAddress: result.suiAddress },
        create: { zkSubHash: subHash, suiAddress: result.suiAddress },
      })

      const sbtResult = await deps.sbtService.handleLoginSbt({
        subHash,
        suiAddress: result.suiAddress,
      })

      return {
        userId: user.id,
        suiAddress: user.suiAddress,
        subHash,
        sbtAction: sbtResult.action,
        sbtObjectId: sbtResult.sbtObjectId ?? null,
      }
    } catch (err) {
      if (err instanceof ZkLoginVerificationError) {
        const status = err.code === 'invalid_jwt' ? 401 : 400
        return reply.code(status).send({ error: err.code })
      }
      throw err
    }
  })
}
