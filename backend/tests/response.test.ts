import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../src/app.js'
import { SurveyService } from '../src/survey/survey-service.js'
import { SbtService } from '../src/sbt/sbt-service.js'
import { computeResponseHash } from '../src/survey/response-service.js'
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

async function seedUserAndSbt(opts: {
  subHash: string
  suiAddress?: string
  status?: 'ACTIVE' | 'REVOKED' | 'SUPERSEDED'
  expiresAt?: Date
}): Promise<void> {
  const suiAddress = opts.suiAddress ?? '0xtest'
  const now = new Date()
  const expiresAt = opts.expiresAt ?? new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
  const serial = BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1000))

  await prisma.user.upsert({
    where: { zkSubHash: opts.subHash },
    update: {},
    create: { zkSubHash: opts.subHash, suiAddress },
  })

  await prisma.participantSbt.create({
    data: {
      subHash: opts.subHash,
      serial,
      suiAddress,
      sbtObjectId: `0xsbt-${opts.subHash}-${serial}`,
      issuedAt: now,
      expiresAt,
      status: opts.status ?? 'ACTIVE',
    },
  })
}

async function seedSurvey(opts: {
  maxResponses?: number
  deadline?: Date
  status?: 'ACTIVE' | 'CLOSED' | 'EXPIRED'
}): Promise<{ id: string }> {
  const now = new Date()
  return prisma.survey.create({
    data: {
      creatorAddress: '0xcreator',
      vaultObjectId: `0xvault-${Date.now()}-${Math.random()}`,
      contentMd: '# Test',
      contentHash: 'abcd1234',
      perResponse: 1000000000n,
      maxResponses: opts.maxResponses ?? 100,
      deadline: opts.deadline ?? new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status: opts.status ?? 'ACTIVE',
    },
  })
}

const SUB_HASH = 'test-sub-hash-response'
const SUI_ADDRESS = '0xtest-response'
const ANSWERS = { q1: '紅', q2: ['功能A'], q3: '很好', q4: 5 }

beforeEach(async () => {
  await truncate()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── test_response_accepted_when_eligible ─────────────────────────────────────

describe('test_response_accepted_when_eligible', () => {
  it('有效資格：回傳 201 並包含 id 與 contentHash，且寫入 DB', async () => {
    await seedUserAndSbt({ subHash: SUB_HASH, suiAddress: SUI_ADDRESS })
    const survey = await seedSurvey({})

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json() as { id: string; contentHash: string }
      expect(body.id).toBeTruthy()
      expect(body.contentHash).toMatch(/^[0-9a-f]{64}$/)

      const stored = await prisma.response.findUnique({ where: { id: body.id } })
      expect(stored).not.toBeNull()
      expect(stored!.subHash).toBe(SUB_HASH)
      expect(stored!.surveyId).toBe(survey.id)
      expect(stored!.contentHash).toBe(body.contentHash)
    } finally {
      await app.close()
    }
  })
})

// ─── test_rejected_when_no_sbt ────────────────────────────────────────────────

describe('test_rejected_when_no_sbt', () => {
  it('沒有任何 SBT：回傳 422 且 error 為 no_sbt', async () => {
    const survey = await seedSurvey({})

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })

      expect(res.statusCode).toBe(422)
      expect(res.json<{ error: string }>().error).toBe('no_sbt')
    } finally {
      await app.close()
    }
  })
})

// ─── test_rejected_when_sbt_expired_or_revoked ───────────────────────────────

describe('test_rejected_when_sbt_expired_or_revoked', () => {
  it('SBT 已過期（expiresAt 在過去）：回傳 422 且 error 為 sbt_invalid', async () => {
    await seedUserAndSbt({
      subHash: SUB_HASH,
      suiAddress: SUI_ADDRESS,
      expiresAt: new Date(Date.now() - 1000),
    })
    const survey = await seedSurvey({})

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })

      expect(res.statusCode).toBe(422)
      expect(res.json<{ error: string }>().error).toBe('sbt_invalid')
    } finally {
      await app.close()
    }
  })

  it('SBT 已撤銷（status REVOKED）：回傳 422 且 error 為 sbt_invalid', async () => {
    await seedUserAndSbt({ subHash: SUB_HASH, suiAddress: SUI_ADDRESS, status: 'REVOKED' })
    const survey = await seedSurvey({})

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })

      expect(res.statusCode).toBe(422)
      expect(res.json<{ error: string }>().error).toBe('sbt_invalid')
    } finally {
      await app.close()
    }
  })

  it('SBT 已被取代（status SUPERSEDED）：回傳 422 且 error 為 sbt_invalid', async () => {
    await seedUserAndSbt({ subHash: SUB_HASH, suiAddress: SUI_ADDRESS, status: 'SUPERSEDED' })
    const survey = await seedSurvey({})

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })

      expect(res.statusCode).toBe(422)
      expect(res.json<{ error: string }>().error).toBe('sbt_invalid')
    } finally {
      await app.close()
    }
  })
})

// ─── test_rejected_when_already_claimed ──────────────────────────────────────

describe('test_rejected_when_already_claimed', () => {
  it('重複提交同一問卷：第二次回傳 422 且 error 為 already_claimed', async () => {
    await seedUserAndSbt({ subHash: SUB_HASH, suiAddress: SUI_ADDRESS })
    const survey = await seedSurvey({})

    const app = await buildTestApp()
    try {
      const res1 = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })
      expect(res1.statusCode).toBe(201)

      const res2 = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })
      expect(res2.statusCode).toBe(422)
      expect(res2.json<{ error: string }>().error).toBe('already_claimed')
    } finally {
      await app.close()
    }
  })
})

// ─── test_rejected_when_quota_exhausted ──────────────────────────────────────

describe('test_rejected_when_quota_exhausted', () => {
  it('名額已滿（maxResponses=1）：第二位使用者回傳 422 且 error 為 quota_exhausted', async () => {
    const SUB_HASH_2 = 'test-sub-hash-2-quota'
    await seedUserAndSbt({ subHash: SUB_HASH, suiAddress: SUI_ADDRESS })
    await seedUserAndSbt({ subHash: SUB_HASH_2, suiAddress: '0xtest2' })

    const survey = await seedSurvey({ maxResponses: 1 })

    const app = await buildTestApp()
    try {
      const res1 = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })
      expect(res1.statusCode).toBe(201)

      const res2 = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH_2, suiAddress: '0xtest2', answersJson: ANSWERS },
      })
      expect(res2.statusCode).toBe(422)
      expect(res2.json<{ error: string }>().error).toBe('quota_exhausted')
    } finally {
      await app.close()
    }
  })
})

// ─── test_rejected_when_expired ──────────────────────────────────────────────

describe('test_rejected_when_expired', () => {
  it('問卷已截止（deadline 在過去）：回傳 422 且 error 為 survey_expired', async () => {
    await seedUserAndSbt({ subHash: SUB_HASH, suiAddress: SUI_ADDRESS })
    const survey = await seedSurvey({ deadline: new Date(Date.now() - 1000) })

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })

      expect(res.statusCode).toBe(422)
      expect(res.json<{ error: string }>().error).toBe('survey_expired')
    } finally {
      await app.close()
    }
  })

  it('問卷不存在：回傳 404', async () => {
    await seedUserAndSbt({ subHash: SUB_HASH, suiAddress: SUI_ADDRESS })

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/surveys/nonexistent-id/responses',
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json<{ error: string }>().error).toBe('not_found')
    } finally {
      await app.close()
    }
  })
})

// ─── test_response_hash_deterministic ────────────────────────────────────────

describe('test_response_hash_deterministic', () => {
  it('相同輸入產生相同 SHA256 hash', () => {
    const h1 = computeResponseHash('survey-1', 'sub-1', { q1: '答案' })
    const h2 = computeResponseHash('survey-1', 'sub-1', { q1: '答案' })
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('不同 surveyId 產生不同 hash', () => {
    const h1 = computeResponseHash('survey-1', 'sub-1', { q1: '答案' })
    const h2 = computeResponseHash('survey-2', 'sub-1', { q1: '答案' })
    expect(h1).not.toBe(h2)
  })

  it('不同 subHash 產生不同 hash', () => {
    const h1 = computeResponseHash('survey-1', 'sub-1', { q1: '答案' })
    const h2 = computeResponseHash('survey-1', 'sub-2', { q1: '答案' })
    expect(h1).not.toBe(h2)
  })

  it('不同答案內容產生不同 hash', () => {
    const h1 = computeResponseHash('survey-1', 'sub-1', { q1: '答案A' })
    const h2 = computeResponseHash('survey-1', 'sub-1', { q1: '答案B' })
    expect(h1).not.toBe(h2)
  })

  it('寫入 DB 的 contentHash 與 computeResponseHash 吻合', async () => {
    await seedUserAndSbt({ subHash: SUB_HASH, suiAddress: SUI_ADDRESS })
    const survey = await seedSurvey({})

    const app = await buildTestApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/surveys/${survey.id}/responses`,
        payload: { subHash: SUB_HASH, suiAddress: SUI_ADDRESS, answersJson: ANSWERS },
      })
      expect(res.statusCode).toBe(201)

      const expected = computeResponseHash(survey.id, SUB_HASH, ANSWERS)
      expect(res.json<{ contentHash: string }>().contentHash).toBe(expected)
    } finally {
      await app.close()
    }
  })
})
