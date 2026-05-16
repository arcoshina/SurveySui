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

interface SeededSurvey {
  surveyId: string
  vaultObjectId: string
}

async function seedSurveyWithQuestions(perResponse = 1_000_000_000n, maxResponses = 10): Promise<SeededSurvey> {
  const vaultObjectId = `0xvault-stats-${Date.now()}-${Math.random()}`
  const survey = await prisma.survey.create({
    data: {
      creatorAddress: '0xcreator',
      vaultObjectId,
      contentMd: '# Stats Test Survey',
      contentHash: 'deadbeef0123',
      perResponse,
      maxResponses,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    },
  })

  await prisma.question.createMany({
    data: [
      {
        surveyId: survey.id,
        questionKey: 'q_color',
        order: 1,
        type: 'SINGLE_CHOICE',
        prompt: '最喜歡的顏色',
        optionsJson: ['紅', '藍', '綠'] as unknown as Prisma.InputJsonValue,
        required: true,
      },
      {
        surveyId: survey.id,
        questionKey: 'q_features',
        order: 2,
        type: 'MULTI_CHOICE',
        prompt: '希望的功能',
        optionsJson: ['功能A', '功能B', '功能C'] as unknown as Prisma.InputJsonValue,
        required: false,
      },
      {
        surveyId: survey.id,
        questionKey: 'q_satisfaction',
        order: 3,
        type: 'SCALE',
        prompt: '滿意度（1–10）',
        optionsJson: { min: 1, max: 10 } as unknown as Prisma.InputJsonValue,
        required: true,
      },
      {
        surveyId: survey.id,
        questionKey: 'q_comment',
        order: 4,
        type: 'SHORT_ANSWER',
        prompt: '其他意見',
        optionsJson: Prisma.JsonNull,
        required: false,
      },
    ],
  })

  return { surveyId: survey.id, vaultObjectId }
}

async function seedResponse(
  surveyId: string,
  subHash: string,
  answersJson: Record<string, unknown>,
): Promise<void> {
  await prisma.response.create({
    data: {
      surveyId,
      subHash,
      suiAddress: `0xaddr-${subHash}`,
      answersJson: answersJson as Prisma.InputJsonValue,
      contentHash: `hash-${subHash}`,
    },
  })
}

beforeEach(async () => {
  await truncate()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── test_stats_match_db_truth ────────────────────────────────────────────────

describe('test_stats_match_db_truth', () => {
  it('stats 回傳數字與 DB 資料一致：responseCount、completionRate、vaultBalance', async () => {
    const { surveyId } = await seedSurveyWithQuestions(1_000_000_000n, 10)

    await seedResponse(surveyId, 'sub1', { q_color: '紅', q_satisfaction: 7, q_comment: '不錯' })
    await seedResponse(surveyId, 'sub2', { q_color: '藍', q_satisfaction: 5, q_comment: '' })
    await seedResponse(surveyId, 'sub3', { q_color: '紅', q_satisfaction: 9 })

    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: `/surveys/${surveyId}/stats` })

      expect(res.statusCode).toBe(200)
      const body = res.json<{
        surveyId: string
        responseCount: number
        maxResponses: number
        completionRate: number
        vaultBalance: string
        questions: unknown[]
      }>()

      expect(body.surveyId).toBe(surveyId)
      expect(body.responseCount).toBe(3)
      expect(body.maxResponses).toBe(10)
      expect(body.completionRate).toBeCloseTo(0.3)
      // 剩餘 7 個名額 × 1 SUI = 7_000_000_000
      expect(body.vaultBalance).toBe('7000000000')
      expect(body.questions).toHaveLength(4)
    } finally {
      await app.close()
    }
  })

  it('問卷不存在時回傳 404', async () => {
    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/surveys/nonexistent-id/stats' })
      expect(res.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })

  it('零回覆時 completionRate 為 0、vaultBalance 為最大值', async () => {
    const { surveyId } = await seedSurveyWithQuestions(500_000_000n, 5)

    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: `/surveys/${surveyId}/stats` })

      expect(res.statusCode).toBe(200)
      const body = res.json<{ responseCount: number; completionRate: number; vaultBalance: string }>()
      expect(body.responseCount).toBe(0)
      expect(body.completionRate).toBe(0)
      expect(body.vaultBalance).toBe('2500000000')
    } finally {
      await app.close()
    }
  })
})

// ─── test_scale_question_average ─────────────────────────────────────────────

describe('test_scale_question_average', () => {
  it('SCALE 題型：average 為所有回覆的算術平均', async () => {
    const { surveyId } = await seedSurveyWithQuestions()

    // 3 個回覆，scale 值為 2、4、6，平均 = 4.0
    await seedResponse(surveyId, 'sub-a', { q_color: '紅', q_satisfaction: 2 })
    await seedResponse(surveyId, 'sub-b', { q_color: '藍', q_satisfaction: 4 })
    await seedResponse(surveyId, 'sub-c', { q_color: '綠', q_satisfaction: 6 })

    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: `/surveys/${surveyId}/stats` })

      expect(res.statusCode).toBe(200)
      const body = res.json<{
        questions: Array<{
          questionKey: string
          type: string
          average?: number
        }>
      }>()

      const scaleQ = body.questions.find((q) => q.questionKey === 'q_satisfaction')
      expect(scaleQ).toBeDefined()
      expect(scaleQ!.type).toBe('SCALE')
      expect(scaleQ!.average).toBeCloseTo(4.0)
    } finally {
      await app.close()
    }
  })

  it('SCALE 題型：無回覆時 average 為 0', async () => {
    const { surveyId } = await seedSurveyWithQuestions()

    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: `/surveys/${surveyId}/stats` })
      const body = res.json<{ questions: Array<{ questionKey: string; average?: number }> }>()
      const scaleQ = body.questions.find((q) => q.questionKey === 'q_satisfaction')
      expect(scaleQ!.average).toBe(0)
    } finally {
      await app.close()
    }
  })
})

// ─── test_choice_question_distribution ───────────────────────────────────────

describe('test_choice_question_distribution', () => {
  it('SINGLE_CHOICE：distribution 正確計算各選項頻次', async () => {
    const { surveyId } = await seedSurveyWithQuestions()

    await seedResponse(surveyId, 'sub1', { q_color: '紅', q_satisfaction: 5 })
    await seedResponse(surveyId, 'sub2', { q_color: '紅', q_satisfaction: 5 })
    await seedResponse(surveyId, 'sub3', { q_color: '藍', q_satisfaction: 5 })

    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: `/surveys/${surveyId}/stats` })

      expect(res.statusCode).toBe(200)
      const body = res.json<{
        questions: Array<{
          questionKey: string
          type: string
          distribution?: Record<string, number>
        }>
      }>()

      const choiceQ = body.questions.find((q) => q.questionKey === 'q_color')
      expect(choiceQ).toBeDefined()
      expect(choiceQ!.type).toBe('SINGLE_CHOICE')
      expect(choiceQ!.distribution).toEqual({ 紅: 2, 藍: 1 })
    } finally {
      await app.close()
    }
  })

  it('MULTI_CHOICE：distribution 計算複選頻次（每個選項獨立計數）', async () => {
    const { surveyId } = await seedSurveyWithQuestions()

    await seedResponse(surveyId, 'sub1', { q_color: '紅', q_features: ['功能A', '功能B'], q_satisfaction: 5 })
    await seedResponse(surveyId, 'sub2', { q_color: '藍', q_features: ['功能A', '功能C'], q_satisfaction: 5 })
    await seedResponse(surveyId, 'sub3', { q_color: '綠', q_features: ['功能B'], q_satisfaction: 5 })

    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: `/surveys/${surveyId}/stats` })

      const body = res.json<{
        questions: Array<{ questionKey: string; distribution?: Record<string, number> }>
      }>()

      const multiQ = body.questions.find((q) => q.questionKey === 'q_features')
      expect(multiQ!.distribution).toEqual({ 功能A: 2, 功能B: 2, 功能C: 1 })
    } finally {
      await app.close()
    }
  })

  it('SHORT_ANSWER：answerCount 計算非空回答數量', async () => {
    const { surveyId } = await seedSurveyWithQuestions()

    await seedResponse(surveyId, 'sub1', { q_color: '紅', q_satisfaction: 5, q_comment: '很好' })
    await seedResponse(surveyId, 'sub2', { q_color: '藍', q_satisfaction: 5, q_comment: '' })
    await seedResponse(surveyId, 'sub3', { q_color: '綠', q_satisfaction: 5 })

    const app = await buildTestApp()
    try {
      const res = await app.inject({ method: 'GET', url: `/surveys/${surveyId}/stats` })

      const body = res.json<{
        questions: Array<{ questionKey: string; answerCount?: number }>
      }>()

      const shortQ = body.questions.find((q) => q.questionKey === 'q_comment')
      // 只有 sub1 的回答非空
      expect(shortQ!.answerCount).toBe(1)
    } finally {
      await app.close()
    }
  })
})
