import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'

import { prisma } from './db.js'
import { registerAuthRoutes } from './auth/routes.js'
import { registerSbtAdminRoutes } from './sbt/routes.js'
import { registerSurveyRoutes } from './survey/routes.js'
import type { ZkLoginVerifier } from './auth/zklogin-verifier.js'
import type { SbtService } from './sbt/sbt-service.js'
import type { SurveyService } from './survey/survey-service.js'

export interface AppDeps {
  verifier: ZkLoginVerifier
  googleClientId: string
  googleRedirectUri: string
  sbtService: SbtService
  surveyService: SurveyService
  adminSecret: string
  logger?: boolean
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false })

  await app.register(cors, { origin: true })

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })

  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok' }
  })

  registerAuthRoutes(app, {
    verifier: deps.verifier,
    googleClientId: deps.googleClientId,
    googleRedirectUri: deps.googleRedirectUri,
    sbtService: deps.sbtService,
  })

  registerSbtAdminRoutes(app, {
    sbtService: deps.sbtService,
    adminSecret: deps.adminSecret,
  })

  registerSurveyRoutes(app, {
    surveyService: deps.surveyService,
  })

  return app
}
