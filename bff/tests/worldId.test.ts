import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'

// signRequest 為純 JS ECDSA 簽名,測試以 mock 取代以求確定性
vi.mock('@worldcoin/idkit-core/signing', () => ({
  signRequest: vi.fn(() => ({
    sig: '0xdeadbeef',
    nonce: 'nonce-123',
    createdAt: 1700000000,
    expiresAt: 1700000300,
  })),
}))

import { signRequest } from '@worldcoin/idkit-core/signing'
import { computeWorldIdPrimaryNullifier } from '../src/auth/worldId.js'
import { registerAuthRoutes } from '../src/auth/handler.js'

const OWNER = '0xa11ce00000000000000000000000000000000000000000000000000000000000'

function orbPayload(nullifier = '0xabc123') {
  return {
    protocol_version: '4.0',
    nonce: 'nonce-123',
    action: 'verify-account',
    responses: [
      { identifier: 'proof_of_human', issuer_schema_id: 1, nullifier, proof: ['0x1'], expires_at_min: 0 },
    ],
    environment: 'production',
    user_presence_completed: true,
  }
}

function devicePayload() {
  return {
    protocol_version: '4.0',
    nonce: 'nonce-123',
    action: 'verify-account',
    // selfie credential (issuer_schema_id 11) — 非 Orb
    responses: [
      { identifier: 'selfie', issuer_schema_id: 11, nullifier: '0xdef456', proof: ['0x1'], expires_at_min: 0 },
    ],
    environment: 'production',
    user_presence_completed: true,
  }
}

describe('World ID — Tier 2 (Orb only)', () => {
  beforeEach(() => {
    process.env.SURVEY_PASS_ISSUER_SALT = 'test_salt_worldid'
    process.env.SURVEY_PASS_ISSUER_PRIV =
      '0101010101010101010101010101010101010101010101010101010101010101'
    process.env.WORLDCOIN_APP_ID = 'app_test123'
    process.env.WORLDCOIN_RP_ID = 'rp_test123'
    process.env.WORLDCOIN_SIGNING_KEY = 'aa'.repeat(32)
    process.env.WORLDCOIN_ACTION = 'verify-account'
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.SURVEY_PASS_ISSUER_SALT
    delete process.env.SURVEY_PASS_ISSUER_PRIV
    delete process.env.WORLDCOIN_APP_ID
    delete process.env.WORLDCOIN_RP_ID
    delete process.env.WORLDCOIN_SIGNING_KEY
    delete process.env.WORLDCOIN_ACTION
    delete process.env.WORLDCOIN_API_BASE
    vi.unstubAllGlobals()
  })

  // ── T-W1: nullifier 計算 ─────────────────────────────────────────────────────
  describe('computeWorldIdPrimaryNullifier', () => {
    it('produces a stable 32-byte output for the same nullifier', () => {
      const a = computeWorldIdPrimaryNullifier('0xabc')
      const b = computeWorldIdPrimaryNullifier('0xabc')
      expect(a).toHaveLength(32)
      expect(Buffer.from(a).toString('hex')).toBe(Buffer.from(b).toString('hex'))
    })

    it('differs for different World nullifiers', () => {
      const a = computeWorldIdPrimaryNullifier('0xabc')
      const b = computeWorldIdPrimaryNullifier('0xdef')
      expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'))
    })

    it('is affected by the issuer salt', () => {
      const a = computeWorldIdPrimaryNullifier('0xabc')
      process.env.SURVEY_PASS_ISSUER_SALT = 'different_salt'
      const b = computeWorldIdPrimaryNullifier('0xabc')
      expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'))
    })

    it('differs from a social nullifier of the same string', () => {
      const w = computeWorldIdPrimaryNullifier('shared')
      // worldid 前綴使其與其他來源不同
      const w2 = computeWorldIdPrimaryNullifier('worldidshared')
      expect(Buffer.from(w).toString('hex')).not.toBe(Buffer.from(w2).toString('hex'))
    })
  })

  // ── Fastify 端點 ─────────────────────────────────────────────────────────────
  describe('World ID endpoints', () => {
    let server: Hono

    beforeEach(() => {
      server = new Hono()
      registerAuthRoutes(server)
    })

    const post = (url: string, payload?: unknown) =>
      server.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })

    // T-W2
    describe('POST /auth/worldid/sign-request', () => {
      it('returns rp_context built from signing_key + action', async () => {
        const res = await post('/auth/worldid/sign-request')
        expect(res.status).toBe(200)
        const data = (await res.json()) as any
        expect(signRequest).toHaveBeenCalledWith({ signingKeyHex: 'aa'.repeat(32), action: 'verify-account' })
        expect(data.rp_context).toMatchObject({
          rp_id: 'rp_test123',
          nonce: 'nonce-123',
          created_at: 1700000000,
          expires_at: 1700000300,
          signature: '0xdeadbeef',
        })
        expect(data.app_id).toBe('app_test123')
        expect(data.action).toBe('verify-account')
      })

      it('returns 503 when env is not configured', async () => {
        delete process.env.WORLDCOIN_SIGNING_KEY
        const res = await post('/auth/worldid/sign-request')
        expect(res.status).toBe(503)
      })
    })

    // T-W3
    describe('POST /auth/worldid/verify', () => {
      it('signs a Tier 2 ticket (source=5) for a valid Orb proof', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })))

        const res = await post('/auth/worldid/verify', { owner: OWNER, payload: orbPayload('0xnull-orb') })

        expect(res.status).toBe(200)
        const data = (await res.json()) as any
        expect(data.source).toBe(5)
        expect(data.bff_sig).toBeDefined()
        expect(data.expires_at).toBeDefined()
        expect(data.nullifiers).toHaveLength(1)
        const expected = Buffer.from(computeWorldIdPrimaryNullifier('0xnull-orb')).toString('hex')
        expect(data.nullifiers[0]).toBe(expected)
      })

      it('returns 403 for a non-Orb (device/selfie) proof and does NOT issue a ticket', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        const res = await post('/auth/worldid/verify', { owner: OWNER, payload: devicePayload() })

        expect(res.status).toBe(403)
        // Orb 不通過時不應呼叫 World API,也不發 ticket
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it('returns 401 when the World API rejects the proof', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('bad', { status: 400 })))

        const res = await post('/auth/worldid/verify', { owner: OWNER, payload: orbPayload() })

        expect(res.status).toBe(401)
      })

      it('returns 400 when owner or payload is missing', async () => {
        const res = await post('/auth/worldid/verify', { owner: OWNER })
        expect(res.status).toBe(400)
      })
    })
  })
})
