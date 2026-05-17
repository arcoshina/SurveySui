import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import type { SurveyService } from './survey-service.js'
import { CloseError } from './survey-service.js'
import { MarkdownParseError } from './markdown-parser.js'
import { ResponseService, EligibilityError } from './response-service.js'
import { RewardDispatcher, DispatchError } from './reward-dispatcher.js'
import { NoOpRewardChainClient } from './noop-reward-chain-client.js'

export interface SurveyRoutesDeps {
  surveyService: SurveyService
  dispatcher?: RewardDispatcher
}

export const CreateSurveyBodySchema = z.object({
  contentMd: z.string().min(1),
  vaultObjectId: z.string().min(1),
  creatorAddress: z.string().min(1),
})

const CloseSurveyBodySchema = z.object({
  creatorAddress: z.string().min(1),
})

const SubmitResponseBodySchema = z.object({
  subHash: z.string().min(1),
  suiAddress: z.string().min(1),
  answersJson: z.record(z.unknown()),
})

export function registerSurveyRoutes(
  app: FastifyInstance,
  deps: SurveyRoutesDeps,
): void {
  const responseService = new ResponseService()
  const dispatcher = deps.dispatcher ?? new RewardDispatcher(new NoOpRewardChainClient())

  app.post('/surveys', async (req, reply) => {
    const parsed = CreateSurveyBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' })
    }

    try {
      const result = await deps.surveyService.createSurvey(parsed.data)
      return reply.code(201).send(result)
    } catch (err) {
      if (err instanceof MarkdownParseError) {
        return reply.code(400).send({ error: err.message })
      }
      const msg = err instanceof Error ? err.message : 'unknown'
      return reply.code(500).send({ error: msg })
    }
  })

  app.get('/surveys/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const survey = await deps.surveyService.getSurvey(id)
    if (!survey) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return {
      ...survey,
      perResponse: survey.perResponse.toString(),
    }
  })

  app.get('/surveys/:id/stats', async (req, reply) => {
    const { id } = req.params as { id: string }
    const stats = await deps.surveyService.getStats(id)
    if (!stats) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return stats
  })

  app.post('/surveys/:id/close', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = CloseSurveyBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' })
    }

    try {
      await deps.surveyService.closeSurvey(id, parsed.data.creatorAddress)
      return reply.code(200).send({ status: 'CLOSED' })
    } catch (err) {
      if (err instanceof CloseError) {
        const status = err.code === 'not_found' ? 404 : 403
        return reply.code(status).send({ error: err.code })
      }
      const msg = err instanceof Error ? err.message : 'unknown'
      return reply.code(500).send({ error: msg })
    }
  })

  app.post('/surveys/:id/responses', async (req, reply) => {
    const { id } = req.params as { id: string }
    const parsed = SubmitResponseBodySchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' })
    }

    try {
      const result = await responseService.submit({
        surveyId: id,
        ...parsed.data,
      })

      const { txDigest } = await dispatcher.dispatch({
        responseId: result.id,
        vaultObjectId: result.vaultObjectId,
        sbtObjectId: result.sbtObjectId,
        recipientAddress: parsed.data.suiAddress,
        subHash: parsed.data.subHash,
        contentHash: result.contentHash,
      })

      return reply.code(201).send({ id: result.id, contentHash: result.contentHash, txDigest })
    } catch (err) {
      if (err instanceof EligibilityError) {
        const status = err.code === 'not_found' ? 404 : 422
        return reply.code(status).send({ error: err.code })
      }
      if (err instanceof DispatchError) {
        return reply.code(500).send({ error: 'dispatch_failed' })
      }
      const msg = err instanceof Error ? err.message : 'unknown'
      return reply.code(500).send({ error: msg })
    }
  })
}
