import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../src/app.js'
import { hashSub } from '../src/auth/sub.js'
import { SbtService, TTL_MS, REISSUE_THRESHOLD_MS } from '../src/sbt/sbt-service.js'
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

let serialCounter = 0n
function makeMockChainClient(overrides?: Partial<SbtChainClient>): SbtChainClient {
  return {
    async issue(): Promise<SbtIssueResult> {
      serialCounter += 1n
      return { objectId: `0xsbt${serialCounter}`, serial: serialCounter }
    },
    async reissue(): Promise<SbtIssueResult> {
      serialCounter += 1n
      return { objectId: `0xsbt${serialCounter}`, serial: serialCounter }
    },
    async revoke(): Promise<void> {},
    ...overrides,
  }
}

function makeNoOpSbtService(): SbtService {
  return new SbtService(makeMockChainClient())
}

function mockVerifier(
  handler: (
    input: ZkLoginFinalizeInput,
  ) => Promise<ZkLoginVerificationResult> | ZkLoginVerificationResult,
): ZkLoginVerifier {
  return { async verify(input) { return await handler(input) } }
}

async function buildTestApp(
  chainClient: SbtChainClient,
  verifier?: ZkLoginVerifier,
): Promise<FastifyInstance> {
  return await buildApp({
    verifier: verifier ?? mockVerifier(() => ({
      sub: 'default-sub',
      iss: 'https://accounts.google.com',
      aud: GOOGLE_CLIENT_ID,
      suiAddress: '0xdefault',
    })),
    googleClientId: GOOGLE_CLIENT_ID,
    googleRedirectUri: REDIRECT_URI,
    sbtService: new SbtService(chainClient),
    adminSecret: ADMIN_SECRET,
    logger: false,
  })
}

async function createUser(subHash: string, suiAddress: string) {
  return prisma.user.create({ data: { zkSubHash: subHash, suiAddress } })
}

beforeEach(async () => {
  serialCounter = 0n
  await truncate()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── handleLoginSbt ──────────────────────────────────────────────────────────

describe('test_first_login_issues_sbt_with_correct_ttl', () => {
  it('首次登入發行 SBT，TTL 為 180 天', async () => {
    const subHash = hashSub('first-login-sub')
    await createUser(subHash, '0xfirst')

    const service = new SbtService(makeMockChainClient())
    const before = new Date()
    const result = await service.handleLoginSbt({ subHash, suiAddress: '0xfirst' })
    const after = new Date()

    expect(result.action).toBe('issued')
    expect(typeof result.sbtObjectId).toBe('string')

    const sbt = await prisma.participantSbt.findFirst({ where: { subHash } })
    expect(sbt).not.toBeNull()
    expect(sbt!.status).toBe('ACTIVE')

    const ttl = sbt!.expiresAt.getTime() - sbt!.issuedAt.getTime()
    expect(ttl).toBe(TTL_MS)

    // expiresAt 落在合理時間範圍
    expect(sbt!.expiresAt.getTime()).toBeGreaterThanOrEqual(before.getTime() + TTL_MS)
    expect(sbt!.expiresAt.getTime()).toBeLessThanOrEqual(after.getTime() + TTL_MS)
  })
})

describe('test_second_login_within_validity_skips_issue', () => {
  it('有效期內第二次登入跳過發行', async () => {
    const subHash = hashSub('second-login-sub')
    await createUser(subHash, '0xsecond')
    const service = new SbtService(makeMockChainClient())

    const first = await service.handleLoginSbt({ subHash, suiAddress: '0xsecond' })
    expect(first.action).toBe('issued')

    const second = await service.handleLoginSbt({ subHash, suiAddress: '0xsecond' })
    expect(second.action).toBe('skipped')
    expect(second.sbtObjectId).toBe(first.sbtObjectId)

    const count = await prisma.participantSbt.count({ where: { subHash } })
    expect(count).toBe(1)
  })
})

describe('test_login_near_expiration_triggers_reissue_and_marks_old_superseded', () => {
  it('臨近過期時自動 reissue 並將舊 SBT 標為 SUPERSEDED', async () => {
    const subHash = hashSub('near-expiry-sub')
    await createUser(subHash, '0xnear')
    const service = new SbtService(makeMockChainClient())

    // 先發行一個 SBT
    const first = await service.handleLoginSbt({ subHash, suiAddress: '0xnear' })
    expect(first.action).toBe('issued')

    // 模擬「當前時間」已經到 SBT 的 expiresAt - 13d（剩 13 天，小於 14 天閾值）
    const sbt = await prisma.participantSbt.findFirst({ where: { subHash } })
    const nearExpiryNow = new Date(sbt!.expiresAt.getTime() - (REISSUE_THRESHOLD_MS - 24 * 60 * 60 * 1000))

    const second = await service.handleLoginSbt({ subHash, suiAddress: '0xnear', now: nearExpiryNow })
    expect(second.action).toBe('reissued')
    expect(second.sbtObjectId).not.toBe(first.sbtObjectId)

    const oldSbt = await prisma.participantSbt.findFirst({ where: { sbtObjectId: first.sbtObjectId } })
    expect(oldSbt!.status).toBe('SUPERSEDED')

    const newSbt = await prisma.participantSbt.findFirst({ where: { sbtObjectId: second.sbtObjectId } })
    expect(newSbt!.status).toBe('ACTIVE')
    expect(newSbt!.supersedeOfId).toBe(oldSbt!.id)
  })
})

describe('test_db_and_chain_atomicity', () => {
  it('chain 呼叫失敗時，DB 不寫入任何 SBT 記錄', async () => {
    const subHash = hashSub('atomicity-sub')
    await createUser(subHash, '0xatom')

    const failClient = makeMockChainClient({
      issue: async () => { throw new Error('chain error') },
    })
    const service = new SbtService(failClient)

    await expect(
      service.handleLoginSbt({ subHash, suiAddress: '0xatom' })
    ).rejects.toThrow('chain error')

    const count = await prisma.participantSbt.count({ where: { subHash } })
    expect(count).toBe(0)
  })
})

describe('test_after_revoke_next_login_issues_new_sbt', () => {
  it('revoke 後下次登入發行新 SBT', async () => {
    const subHash = hashSub('after-revoke-sub')
    await createUser(subHash, '0xrevoked')
    const service = new SbtService(makeMockChainClient())

    const first = await service.handleLoginSbt({ subHash, suiAddress: '0xrevoked' })
    expect(first.action).toBe('issued')

    await service.adminRevoke(first.sbtObjectId!)

    const revoked = await prisma.participantSbt.findFirst({ where: { sbtObjectId: first.sbtObjectId } })
    expect(revoked!.status).toBe('REVOKED')

    const second = await service.handleLoginSbt({ subHash, suiAddress: '0xrevoked' })
    expect(second.action).toBe('issued')
    expect(second.sbtObjectId).not.toBe(first.sbtObjectId)

    const newSbt = await prisma.participantSbt.findFirst({ where: { sbtObjectId: second.sbtObjectId } })
    expect(newSbt!.status).toBe('ACTIVE')
  })
})

// ─── POST /admin/sbt/revoke ──────────────────────────────────────────────────

describe('test_admin_revoke_endpoint_calls_contract_and_updates_db', () => {
  it('revoke endpoint 呼叫 chain 並更新 DB', async () => {
    const revokeSpy = vi.fn(async () => {})
    const client = makeMockChainClient({ revoke: revokeSpy })
    const app = await buildTestApp(client)

    try {
      const subHash = hashSub('revoke-ep-sub')
      await createUser(subHash, '0xrevoke')
      const service = new SbtService(client)
      const issued = await service.handleLoginSbt({ subHash, suiAddress: '0xrevoke' })

      const res = await app.inject({
        method: 'POST',
        url: '/admin/sbt/revoke',
        headers: { authorization: `Bearer ${ADMIN_SECRET}` },
        payload: { sbtObjectId: issued.sbtObjectId },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ ok: true })

      expect(revokeSpy).toHaveBeenCalledWith({ objectId: issued.sbtObjectId })

      const sbt = await prisma.participantSbt.findFirst({ where: { sbtObjectId: issued.sbtObjectId! } })
      expect(sbt!.status).toBe('REVOKED')
    } finally {
      await app.close()
    }
  })
})

describe('test_admin_reissue_endpoint_supersedes_old_and_issues_new', () => {
  it('reissue endpoint 將舊 SBT 標為 SUPERSEDED 並發行新 SBT', async () => {
    const client = makeMockChainClient()
    const app = await buildTestApp(client)

    try {
      const subHash = hashSub('reissue-ep-sub')
      await createUser(subHash, '0xreissue')
      const service = new SbtService(client)
      const issued = await service.handleLoginSbt({ subHash, suiAddress: '0xreissue' })

      const res = await app.inject({
        method: 'POST',
        url: '/admin/sbt/reissue',
        headers: { authorization: `Bearer ${ADMIN_SECRET}` },
        payload: { sbtObjectId: issued.sbtObjectId },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { ok: boolean; sbtObjectId: string }
      expect(body.ok).toBe(true)
      expect(body.sbtObjectId).not.toBe(issued.sbtObjectId)

      const oldSbt = await prisma.participantSbt.findFirst({ where: { sbtObjectId: issued.sbtObjectId! } })
      expect(oldSbt!.status).toBe('SUPERSEDED')

      const newSbt = await prisma.participantSbt.findFirst({ where: { sbtObjectId: body.sbtObjectId } })
      expect(newSbt!.status).toBe('ACTIVE')
      expect(newSbt!.supersedeOfId).toBe(oldSbt!.id)
    } finally {
      await app.close()
    }
  })
})

describe('test_only_admin_can_call_admin_endpoints', () => {
  it('無 token 的請求回傳 401', async () => {
    const app = await buildTestApp(makeMockChainClient())
    try {
      const resRevoke = await app.inject({
        method: 'POST',
        url: '/admin/sbt/revoke',
        payload: { sbtObjectId: '0xfake' },
      })
      expect(resRevoke.statusCode).toBe(401)

      const resReissue = await app.inject({
        method: 'POST',
        url: '/admin/sbt/reissue',
        payload: { sbtObjectId: '0xfake' },
      })
      expect(resReissue.statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })

  it('錯誤 token 的請求回傳 401', async () => {
    const app = await buildTestApp(makeMockChainClient())
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/sbt/revoke',
        headers: { authorization: 'Bearer wrong-secret' },
        payload: { sbtObjectId: '0xfake' },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await app.close()
    }
  })
})
