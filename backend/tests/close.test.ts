import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient, Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../src/app.js'
import { SurveyService } from '../src/survey/survey-service.js'
import { SbtService } from '../src/sbt/sbt-service.js'
import type { SurveyChainClient, SurveyRegisterResult } from '../src/survey/chain-client.js'
import type { SbtChainClient, SbtIssueResult } from '../src/sbt/chain-client.js'
import type {
  ZkLoginFinalizeInput,
  ZkLoginVerificationResult,
  ZkLoginVerifier,
} from '../src/auth/zklogin-verifier.js'

const prisma = new PrismaClient()

const ADMIN_SECRET = 'test-admin-secret'
const GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
const REDIRECT_URI = 'http://localhost:5173/auth/callback'

async function truncate(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "responses", "questions", "surveys", "participant_sbts", "users" RESTART IDENTITY CASCADE',
  )
}

function makeNoopSurveyChainClient(): SurveyChainClient {
  return {
    async register(): Promise<SurveyRegisterResult> {
      return { txDigest: '0xfake-tx' }
    },
  }
}

function makeNoopSbtChainClient(): SbtChainClient {
  let serial = 0n
  return {
    async issue(): Promise<SbtIssueResult> {
      serial += 1n
      return { objectId: `0xsbt${serial}`, serial }
    },
    async reissue(): Promise<SbtIssueResult> {
      serial += 1n
      return { objectId: `0xsbt${serial}`, serial }
    },
    async revoke(): Promise<void> {},
  }
}

function mockVerifier(): ZkLoginVerifier {
  return {
    async verify(_input: ZkLoginFinalizeInput): Promise<ZkLoginVerificationResult> {
      return {
        sub: 'default-sub',
        iss: 'https://accounts.google.com',
        aud: GOOGLE_CLIENT_ID,
        suiAddress: '0xdefault',
      }
    },
  }
}

async function buildTestApp(): Promise<FastifyInstance> {
  return buildApp({
    verifier: mockVerifier(),
    googleClientId: GOOGLE_CLIENT_ID,
    googleRedirectUri: REDIRECT_URI,
    sbtService: new SbtService(makeNoopSbtChainClient()),
    surveyService: new SurveyService(makeNoopSurveyChainClient()),
    adminSecret: ADMIN_SECRET,
    logger: false,
  })
}

async function seedActiveSurvey(creatorAddress = '0xcreator'): Promise<string> {
  const survey = await prisma.survey.create({
    data: {
      creatorAddress,
      vaultObjectId: `0xvault-close-${Date.now()}-${Math.random()}`,
      contentMd: '# Close Test',
      contentHash: 'deadbeef',
      perResponse: 1_000_000_000n,
      maxResponses: 10,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    },
  })
  return survey.id
}

async function seedActiveSbt(subHash: string): Promise<void> {
  const suiAddress = `0xaddr-${subHash}`
  const now = new Date()
  const serial = BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1_000_000))

  await prisma.user.upsert({
    where: { zkSubHash: subHash },
    update: {},
    create: { zkSubHash: subHash, suiAddress },
  })

  await prisma.participantSbt.create({
    data: {
      subHash,
      suiAddress,
      sbtObjectId: `0xsbt-close-${subHash}-${serial}`,
      serial,
      issuedAt: now,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
  })
}

beforeEach(async () => {
  await truncate()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── test_close_marks_status ──────────────────────────────────────────────────

describe('test_close_marks_status', () => {
  it('POST /surveys/:id/close 回傳 200 並將 survey 狀態改為 CLOSED', async () => {
    const surveyId = await seedActiveSurvey('0xcreator')
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${surveyId}/close`,
        payload: { creatorAddress: '0xcreator' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json<{ status: string }>()
      expect(body.status).toBe('CLOSED')

      const updated = await prisma.survey.findUnique({ where: { id: surveyId } })
      expect(updated?.status).toBe('CLOSED')
    } finally {
      await app.close()
    }
  })

  it('問卷不存在時回傳 404', async () => {
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/surveys/nonexistent-id/close',
        payload: { creatorAddress: '0xcreator' },
      })
      expect(res.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })
})

// ─── test_close_only_by_creator ───────────────────────────────────────────────

describe('test_close_only_by_creator', () => {
  it('非 creator 呼叫 close 時回傳 403', async () => {
    const surveyId = await seedActiveSurvey('0xcreator')
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${surveyId}/close`,
        payload: { creatorAddress: '0xattacker' },
      })

      expect(res.statusCode).toBe(403)
      const body = res.json<{ error: string }>()
      expect(body.error).toBe('forbidden')
    } finally {
      await app.close()
    }
  })

  it('缺少 creatorAddress 時回傳 400', async () => {
    const surveyId = await seedActiveSurvey()
    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${surveyId}/close`,
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })
})

// ─── test_after_close_responses_rejected ─────────────────────────────────────

describe('test_after_close_responses_rejected', () => {
  it('close 後提交回覆回傳 422 survey_closed', async () => {
    const surveyId = await seedActiveSurvey('0xcreator')
    const subHash = 'test-sub-hash-close'
    await seedActiveSbt(subHash)

    const app = await buildTestApp()
    try {
      // 先關閉問卷
      const closeRes = await app.inject({
        method: 'POST',
        url: `/surveys/${surveyId}/close`,
        payload: { creatorAddress: '0xcreator' },
      })
      expect(closeRes.statusCode).toBe(200)

      // 再嘗試提交回覆
      const submitRes = await app.inject({
        method: 'POST',
        url: `/surveys/${surveyId}/responses`,
        payload: {
          subHash,
          suiAddress: '0xrespondent',
          answersJson: { q1: 'answer' },
        },
      })
      expect(submitRes.statusCode).toBe(422)
      const body = submitRes.json<{ error: string }>()
      expect(body.error).toBe('survey_closed')
    } finally {
      await app.close()
    }
  })
})
