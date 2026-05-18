import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../src/app.js'
import { SurveyService } from '../src/survey/survey-service.js'
import { parseSurveyMarkdown, MarkdownParseError } from '../src/survey/markdown-parser.js'
import type { SurveyChainClient, SurveyRegisterResult } from '../src/survey/chain-client.js'
import { SbtService } from '../src/sbt/sbt-service.js'
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

function makeNoOpSurveyChainClient(
  overrides?: Partial<SurveyChainClient>,
): SurveyChainClient {
  return {
    async register(): Promise<SurveyRegisterResult> {
      return { txDigest: '0xfake-tx' }
    },
    ...overrides,
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
  handler: (
    input: ZkLoginFinalizeInput,
  ) => Promise<ZkLoginVerificationResult> | ZkLoginVerificationResult,
): ZkLoginVerifier {
  return { async verify(input) { return await handler(input) } }
}

async function buildTestApp(surveyChainClient: SurveyChainClient): Promise<FastifyInstance> {
  return await buildApp({
    verifier: mockVerifier(() => ({
      sub: 'default-sub',
      iss: 'https://accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      suiAddress: '0xdefault',
    })),
    googleClientId: GOOGLE_CLIENT_ID,
    googleRedirectUri: REDIRECT_URI,
    sbtService: new SbtService(makeNoOpSbtChainClient()),
    surveyService: new SurveyService(surveyChainClient),
    adminSecret: ADMIN_SECRET,
    logger: false,
  })
}

// 範例問卷 Markdown（包含四種題型）
const FULL_SURVEY_MD = `---
title: "測試問卷"
perResponse: 1000000000
maxResponses: 100
deadline: "2099-12-31T23:59:59Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "最喜歡的顏色？"
    required: true
    options:
      - 紅
      - 藍
      - 綠
  - id: q2
    type: MULTI_CHOICE
    prompt: "你使用哪些功能？"
    required: false
    options:
      - 功能 A
      - 功能 B
      - 功能 C
  - id: q3
    type: SHORT_ANSWER
    prompt: "請描述你的體驗"
    required: true
  - id: q4
    type: SCALE
    prompt: "滿意度評分"
    required: true
    min: 1
    max: 5
---

問卷說明文字。
`

beforeEach(async () => {
  await truncate()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── test_markdown_parser_handles_all_question_types ────────────────────────

describe('test_markdown_parser_handles_all_question_types', () => {
  it('正確解析四種題型（單選、多選、簡答、量表）', () => {
    const result = parseSurveyMarkdown(FULL_SURVEY_MD)

    expect(result.questions).toHaveLength(4)

    const [q1, q2, q3, q4] = result.questions

    expect(q1.id).toBe('q1')
    expect(q1.type).toBe('SINGLE_CHOICE')
    expect(q1.prompt).toBe('最喜歡的顏色？')
    expect(q1.required).toBe(true)
    expect(q1.options).toEqual(['紅', '藍', '綠'])

    expect(q2.id).toBe('q2')
    expect(q2.type).toBe('MULTI_CHOICE')
    expect(q2.required).toBe(false)
    expect(q2.options).toEqual(['功能 A', '功能 B', '功能 C'])

    expect(q3.id).toBe('q3')
    expect(q3.type).toBe('SHORT_ANSWER')
    expect(q3.required).toBe(true)
    expect(q3.options).toBeUndefined()

    expect(q4.id).toBe('q4')
    expect(q4.type).toBe('SCALE')
    expect(q4.min).toBe(1)
    expect(q4.max).toBe(5)
  })

  it('正確解析 metadata（title、perResponse、maxResponses、deadline）', () => {
    const result = parseSurveyMarkdown(FULL_SURVEY_MD)

    expect(result.metadata.title).toBe('測試問卷')
    expect(result.metadata.perResponse).toBe(1000000000n)
    expect(result.metadata.maxResponses).toBe(100)
    expect(result.metadata.deadline).toBeInstanceOf(Date)
    expect(result.metadata.deadline.getUTCFullYear()).toBe(2099)
  })

  it('contentHash 是 SHA256 hex 字串（長度 64）', () => {
    const result = parseSurveyMarkdown(FULL_SURVEY_MD)
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('相同內容產生相同 hash', () => {
    const r1 = parseSurveyMarkdown(FULL_SURVEY_MD)
    const r2 = parseSurveyMarkdown(FULL_SURVEY_MD)
    expect(r1.contentHash).toBe(r2.contentHash)
  })

  it('不同內容產生不同 hash', () => {
    const modified = FULL_SURVEY_MD.replace('測試問卷', '另一問卷')
    const r1 = parseSurveyMarkdown(FULL_SURVEY_MD)
    const r2 = parseSurveyMarkdown(modified)
    expect(r1.contentHash).not.toBe(r2.contentHash)
  })
})

// ─── test_invalid_metadata_rejected ─────────────────────────────────────────

describe('test_invalid_metadata_rejected', () => {
  it('缺少 frontmatter 時拋出 MarkdownParseError', () => {
    expect(() => parseSurveyMarkdown('沒有 frontmatter 的內容')).toThrowError(MarkdownParseError)
  })

  it('title 為空時拋出錯誤', () => {
    const md = FULL_SURVEY_MD.replace('title: "測試問卷"', 'title: ""')
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
  })

  it('title 缺失時拋出錯誤', () => {
    const md = FULL_SURVEY_MD.replace('title: "測試問卷"\n', '')
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
  })

  it('perResponse 為零時拋出錯誤', () => {
    const md = FULL_SURVEY_MD.replace('perResponse: 1000000000', 'perResponse: 0')
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
  })

  it('maxResponses 為負數時拋出錯誤', () => {
    const md = FULL_SURVEY_MD.replace('maxResponses: 100', 'maxResponses: -1')
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
  })

  it('deadline 格式無效時拋出錯誤', () => {
    const md = FULL_SURVEY_MD.replace('deadline: "2099-12-31T23:59:59Z"', 'deadline: "not-a-date"')
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
  })

  it('questions 為空陣列時拋出錯誤', () => {
    const md = FULL_SURVEY_MD.replace(/questions:[\s\S]*?(?=\n---)/m, 'questions: []')
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
  })

  it('SINGLE_CHOICE 題型少於 2 個選項時拋出錯誤', () => {
    const md = `---
title: "測試"
perResponse: 100
maxResponses: 10
deadline: "2099-01-01T00:00:00Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "問題"
    required: true
    options:
      - 只有一個選項
---
`
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
  })

  it('SCALE 題型 min >= max 時拋出錯誤', () => {
    const md = `---
title: "測試"
perResponse: 100
maxResponses: 10
deadline: "2099-01-01T00:00:00Z"
questions:
  - id: q1
    type: SCALE
    prompt: "問題"
    required: true
    min: 5
    max: 5
---
`
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
  })

  it('無效的 question type 時拋出錯誤', () => {
    const md = `---
title: "測試"
perResponse: 100
maxResponses: 10
deadline: "2099-01-01T00:00:00Z"
questions:
  - id: q1
    type: INVALID_TYPE
    prompt: "問題"
    required: false
---
`
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
  })
})

// ─── test_duplicate_question_ids_rejected ────────────────────────────────────

describe('test_duplicate_question_ids_rejected', () => {
  it('重複的 question id 拋出 MarkdownParseError', () => {
    const md = `---
title: "測試"
perResponse: 100
maxResponses: 10
deadline: "2099-01-01T00:00:00Z"
questions:
  - id: q1
    type: SHORT_ANSWER
    prompt: "問題一"
    required: false
  - id: q1
    type: SHORT_ANSWER
    prompt: "問題二（重複 id）"
    required: false
---
`
    expect(() => parseSurveyMarkdown(md)).toThrowError(MarkdownParseError)
    expect(() => parseSurveyMarkdown(md)).toThrowError(/重複的 question id/)
  })
})

// ─── test_survey_create_writes_hash_onchain ──────────────────────────────────

describe('test_survey_create_writes_hash_onchain', () => {
  it('createSurvey 呼叫 chain client 並寫入 DB', async () => {
    const registerSpy = vi.fn(async (): Promise<SurveyRegisterResult> => ({
      txDigest: '0xreal-tx-digest',
    }))
    const service = new SurveyService(makeNoOpSurveyChainClient({ register: registerSpy }))

    const result = await service.createSurvey({
      creatorAddress: '0xcreator',
      contentMd: FULL_SURVEY_MD,
      vaultObjectId: '0xvault123',
    })

    expect(registerSpy).toHaveBeenCalledOnce()
    const callArgs = registerSpy.mock.calls[0][0]
    expect(callArgs.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(callArgs.creatorAddress).toBe('0xcreator')

    expect(result.id).toBeTruthy()
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.txDigest).toBe('0xreal-tx-digest')

    const survey = await prisma.survey.findUnique({
      where: { id: result.id },
      include: { questions: { orderBy: { order: 'asc' } } },
    })
    expect(survey).not.toBeNull()
    expect(survey!.contentHash).toBe(result.contentHash)
    expect(survey!.vaultObjectId).toBe('0xvault123')
    expect(survey!.creatorAddress).toBe('0xcreator')
    expect(survey!.status).toBe('ACTIVE')
    expect(survey!.questions).toHaveLength(4)
  })

  it('chain 呼叫失敗時 DB 不寫入任何記錄', async () => {
    const failClient = makeNoOpSurveyChainClient({
      register: async () => { throw new Error('chain error') },
    })
    const service = new SurveyService(failClient)

    await expect(
      service.createSurvey({
        creatorAddress: '0xcreator',
        contentMd: FULL_SURVEY_MD,
        vaultObjectId: '0xvault999',
      }),
    ).rejects.toThrow('chain error')

    const count = await prisma.survey.count()
    expect(count).toBe(0)
  })

  it('POST /surveys 回傳 201 並包含 id、contentHash、txDigest', async () => {
    const app = await buildTestApp(makeNoOpSurveyChainClient())
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/surveys',
        payload: {
          contentMd: FULL_SURVEY_MD,
          vaultObjectId: '0xvault-http',
          creatorAddress: '0xcreator-http',
        },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json() as { id: string; contentHash: string; txDigest: string }
      expect(body.id).toBeTruthy()
      expect(body.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(body.txDigest).toBeTruthy()
    } finally {
      await app.close()
    }
  })

  it('POST /surveys 使用無效 Markdown 回傳 400', async () => {
    const app = await buildTestApp(makeNoOpSurveyChainClient())
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/surveys',
        payload: {
          contentMd: '沒有 frontmatter',
          vaultObjectId: '0xvault',
          creatorAddress: '0xcreator',
        },
      })
      expect(res.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('GET /surveys/:id 回傳問卷及題目', async () => {
    const service = new SurveyService(makeNoOpSurveyChainClient())
    const created = await service.createSurvey({
      creatorAddress: '0xcreator',
      contentMd: FULL_SURVEY_MD,
      vaultObjectId: '0xvault-get',
    })

    const app = await buildTestApp(makeNoOpSurveyChainClient())
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/surveys/${created.id}`,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { id: string; questions: unknown[] }
      expect(body.id).toBe(created.id)
      expect(body.questions).toHaveLength(4)
    } finally {
      await app.close()
    }
  })

  it('GET /surveys/:id 找不到時回傳 404', async () => {
    const app = await buildTestApp(makeNoOpSurveyChainClient())
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/surveys/nonexistent-id',
      })
      expect(res.statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })
})
