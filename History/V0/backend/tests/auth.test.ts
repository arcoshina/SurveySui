import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../src/app.js'
import { hashSub } from '../src/auth/sub.js'
import {
  ZkLoginVerificationError,
  type ZkLoginFinalizeInput,
  type ZkLoginVerificationResult,
  type ZkLoginVerifier,
} from '../src/auth/zklogin-verifier.js'
import { SbtService } from '../src/sbt/sbt-service.js'
import type { SbtChainClient, SbtIssueResult } from '../src/sbt/chain-client.js'

const prisma = new PrismaClient()

const GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
const REDIRECT_URI = 'http://localhost:5173/auth/callback'

let noOpSerial = 0n
function makeNoOpChainClient(): SbtChainClient {
  return {
    async issue(): Promise<SbtIssueResult> {
      noOpSerial += 1n
      return { objectId: `0xnoop${noOpSerial}`, serial: noOpSerial }
    },
    async reissue(): Promise<SbtIssueResult> {
      noOpSerial += 1n
      return { objectId: `0xnoop${noOpSerial}`, serial: noOpSerial }
    },
    async revoke(): Promise<void> {},
  }
}

function makeNoOpSbtService(): SbtService {
  return new SbtService(makeNoOpChainClient())
}

async function truncate(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "responses", "questions", "surveys", "participant_sbts", "users" RESTART IDENTITY CASCADE',
  )
}

function mockVerifier(
  handler: (
    input: ZkLoginFinalizeInput,
  ) => Promise<ZkLoginVerificationResult> | ZkLoginVerificationResult,
): ZkLoginVerifier {
  return {
    async verify(input) {
      return await handler(input)
    },
  }
}

async function buildTestApp(verifier: ZkLoginVerifier): Promise<FastifyInstance> {
  return await buildApp({
    verifier,
    googleClientId: GOOGLE_CLIENT_ID,
    googleRedirectUri: REDIRECT_URI,
    sbtService: makeNoOpSbtService(),
    adminSecret: 'test-admin-secret',
    logger: false,
  })
}

const finalizeBody = {
  jwt: 'header.payload.sig',
  zkProof: { a: '0x1' },
  ephPubkey: '0xabc',
  maxEpoch: 100,
  salt: '0xsalt',
}

beforeEach(async () => {
  noOpSerial = 0n
  await truncate()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('GET /auth/google/start', () => {
  it('test_oauth_redirect_correct_url', async () => {
    const app = await buildTestApp(
      mockVerifier(() => {
        throw new Error('verifier should not be called on /start')
      }),
    )
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/google/start?nonce=abc123',
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { url: string }
      expect(typeof body.url).toBe('string')

      const url = new URL(body.url)
      expect(url.origin + url.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      )
      expect(url.searchParams.get('client_id')).toBe(GOOGLE_CLIENT_ID)
      expect(url.searchParams.get('response_type')).toBe('id_token')
      expect(url.searchParams.get('scope')).toContain('openid')
      expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
      expect(url.searchParams.get('nonce')).toBe('abc123')
    } finally {
      await app.close()
    }
  })

  it('rejects start without nonce', async () => {
    const app = await buildTestApp(mockVerifier(() => ({} as ZkLoginVerificationResult)))
    try {
      const res = await app.inject({ method: 'GET', url: '/auth/google/start' })
      expect(res.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })
})

describe('POST /auth/zklogin/finalize', () => {
  it('test_invalid_jwt_rejected', async () => {
    const app = await buildTestApp(
      mockVerifier(() => {
        throw new ZkLoginVerificationError('invalid_jwt', 'bad jwt')
      }),
    )
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/zklogin/finalize',
        payload: finalizeBody,
      })
      expect(res.statusCode).toBe(401)
      expect(res.json()).toEqual({ error: 'invalid_jwt' })
    } finally {
      await app.close()
    }
  })

  it('zk proof verifier mock fail path returns 400 for invalid_proof', async () => {
    const app = await buildTestApp(
      mockVerifier(() => {
        throw new ZkLoginVerificationError('invalid_proof', 'proof failed')
      }),
    )
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/zklogin/finalize',
        payload: finalizeBody,
      })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'invalid_proof' })
    } finally {
      await app.close()
    }
  })

  it('zk proof verifier mock happy path persists user and returns suiAddress + subHash', async () => {
    const app = await buildTestApp(
      mockVerifier(() => ({
        sub: 'google-sub-happy',
        iss: 'https://accounts.google.com',
        aud: GOOGLE_CLIENT_ID,
        suiAddress: '0xabc123',
      })),
    )
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/zklogin/finalize',
        payload: finalizeBody,
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as {
        userId: string
        suiAddress: string
        subHash: string
      }
      expect(body.suiAddress).toBe('0xabc123')
      expect(body.subHash).toBe(hashSub('google-sub-happy'))
      expect(typeof body.userId).toBe('string')
      expect(body.userId.length).toBeGreaterThan(0)

      const user = await prisma.user.findUnique({
        where: { zkSubHash: hashSub('google-sub-happy') },
      })
      expect(user).not.toBeNull()
      expect(user?.suiAddress).toBe('0xabc123')
    } finally {
      await app.close()
    }
  })

  it('test_same_sub_returns_existing_user', async () => {
    const app = await buildTestApp(
      mockVerifier(() => ({
        sub: 'google-sub-same',
        iss: 'https://accounts.google.com',
        aud: GOOGLE_CLIENT_ID,
        suiAddress: '0xsame',
      })),
    )
    try {
      const first = await app.inject({
        method: 'POST',
        url: '/auth/zklogin/finalize',
        payload: finalizeBody,
      })
      const second = await app.inject({
        method: 'POST',
        url: '/auth/zklogin/finalize',
        payload: finalizeBody,
      })
      expect(first.statusCode).toBe(200)
      expect(second.statusCode).toBe(200)
      const firstBody = first.json() as { userId: string }
      const secondBody = second.json() as { userId: string }
      expect(firstBody.userId).toBe(secondBody.userId)

      const count = await prisma.user.count()
      expect(count).toBe(1)
    } finally {
      await app.close()
    }
  })

  it('rejects malformed body', async () => {
    const app = await buildTestApp(
      mockVerifier(() => ({} as ZkLoginVerificationResult)),
    )
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/zklogin/finalize',
        payload: { jwt: 'only-jwt' },
      })
      expect(res.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })
})

describe('sub hash', () => {
  it('hashes sub deterministically with SHA256 hex', async () => {
    const h1 = hashSub('user-123')
    const h2 = hashSub('user-123')
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(hashSub('user-123')).not.toBe(hashSub('user-456'))
  })
})
