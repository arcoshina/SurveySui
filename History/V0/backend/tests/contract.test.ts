/**
 * T4.3 契約測試：驗證 frontend FundPage 送出的 payload shape 與 backend zod schema 對齊。
 *
 * 分兩層：
 * 1. Schema 單元測試（不需要 Postgres）
 * 2. HTTP 路由整合測試（buildApp + inject，需要 Postgres）
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

import { CreateSurveyBodySchema } from '../src/survey/routes.js'
import { buildApp } from '../src/app.js'
import { SurveyService } from '../src/survey/survey-service.js'
import type { SurveyChainClient, SurveyRegisterResult } from '../src/survey/chain-client.js'
import { SbtService } from '../src/sbt/sbt-service.js'
import type { SbtChainClient, SbtIssueResult } from '../src/sbt/chain-client.js'
import type {
  ZkLoginFinalizeInput,
  ZkLoginVerificationResult,
  ZkLoginVerifier,
} from '../src/auth/zklogin-verifier.js'

// 標準問卷 Markdown（含 frontmatter，與 backend parseSurveyMarkdown 相容）
const VALID_SURVEY_MD = `---
title: "契約測試問卷"
perResponse: 1000000000
maxResponses: 10
deadline: "2099-12-31T23:59:59Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "最喜歡的顏色？"
    required: true
    options:
      - 紅
      - 藍
---

問卷說明文字。
`

// ─── 1. Schema 契約（不需要 DB） ──────────────────────────────────────────────

describe('frontend↔backend payload 契約（schema 層）', () => {
  it('CreatePage 舊 payload（snake_case + 獨立獎勵欄位）不符合 BE schema', () => {
    const oldPayload = {
      content_md: VALID_SURVEY_MD,
      per_response: 1,
      max_responses: 10,
      deadline: '2099-12-31',
    }
    expect(CreateSurveyBodySchema.safeParse(oldPayload).success).toBe(false)
  })

  it('FundPage 新 payload（camelCase + vaultObjectId + creatorAddress）符合 BE schema', () => {
    const newPayload = {
      contentMd: VALID_SURVEY_MD,
      vaultObjectId: '0x' + 'a'.repeat(64),
      creatorAddress: '0x' + 'b'.repeat(64),
    }
    const result = CreateSurveyBodySchema.safeParse(newPayload)
    expect(result.success).toBe(true)
  })

  it('缺少 vaultObjectId → schema 拒絕', () => {
    const payload = {
      contentMd: VALID_SURVEY_MD,
      creatorAddress: '0xcreator',
    }
    expect(CreateSurveyBodySchema.safeParse(payload).success).toBe(false)
  })

  it('缺少 creatorAddress → schema 拒絕', () => {
    const payload = {
      contentMd: VALID_SURVEY_MD,
      vaultObjectId: '0xvault',
    }
    expect(CreateSurveyBodySchema.safeParse(payload).success).toBe(false)
  })
})

// ─── 2. HTTP 路由整合（需要 Postgres） ────────────────────────────────────────

const prisma = new PrismaClient()
const GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
const REDIRECT_URI = 'http://localhost:5173/auth/callback'

function makeNoOpSurveyChainClient(): SurveyChainClient {
  return {
    async register(): Promise<SurveyRegisterResult> {
      return { txDigest: '0xfake-tx' }
    },
  }
}

function makeNoOpSbtChainClient(): SbtChainClient {
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

function mockVerifier(
  handler: (input: ZkLoginFinalizeInput) => ZkLoginVerificationResult,
): ZkLoginVerifier {
  return { async verify(input) { return handler(input) } }
}

async function buildTestApp(): Promise<FastifyInstance> {
  return buildApp({
    verifier: mockVerifier(() => ({
      sub: 'default-sub',
      iss: 'https://accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      suiAddress: '0xdefault',
    })),
    googleClientId: GOOGLE_CLIENT_ID,
    googleRedirectUri: REDIRECT_URI,
    sbtService: new SbtService(makeNoOpSbtChainClient()),
    surveyService: new SurveyService(makeNoOpSurveyChainClient()),
    adminSecret: 'test-secret',
    logger: false,
  })
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "responses", "questions", "surveys", "participant_sbts", "users" RESTART IDENTITY CASCADE',
  )
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('POST /surveys - FundPage 新 payload 路由整合', () => {
  it('帶 vaultObjectId + creatorAddress + valid contentMd → 201 + id + contentHash', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/surveys',
      payload: {
        contentMd: VALID_SURVEY_MD,
        vaultObjectId: '0xvault-contract-' + Date.now(),
        creatorAddress: '0xcreator-contract',
      },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body) as Record<string, unknown>
    expect(body).toHaveProperty('id')
    expect(body).toHaveProperty('contentHash')
  })

  it('舊 snake_case payload（FE bug 狀態）→ 400 invalid_body', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/surveys',
      payload: {
        content_md: VALID_SURVEY_MD,
        per_response: 1,
        max_responses: 10,
        deadline: '2099-12-31',
      },
    })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body) as Record<string, unknown>
    expect(body.error).toBe('invalid_body')
  })

  it('contentMd 含無效 frontmatter → 400', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/surveys',
      payload: {
        contentMd: '# 缺少 frontmatter',
        vaultObjectId: '0xvault',
        creatorAddress: '0xcreator',
      },
    })
    expect(res.statusCode).toBe(400)
  })
})
