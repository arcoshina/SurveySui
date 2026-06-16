import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { otpStore } from '../src/auth/otpStore.js'
import { setupFakeD1 } from './helpers/fakeD1.js'

vi.mock('../src/email/sender.js', () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}))
import { sendOtpEmail } from '../src/email/sender.js'
import { computeNullifierHash, computeEmailSecondaryNullifier, signTicket, getPassTtlMs } from '../src/auth/ticket.js'
import { registerAuthRoutes } from '../src/auth/handler.js'

describe('BFF Authentication & Ticket Tests', () => {
  beforeEach(async () => {
    await setupFakeD1() // 全新空 D1（取代 otpStore.clear()）
    process.env.SURVEY_PASS_ISSUER_SALT = 'test_salt_123456'
    process.env.SURVEY_PASS_ISSUER_PRIV =
      '0101010101010101010101010101010101010101010101010101010101010101' // 32 bytes hex
  })

  afterEach(() => {
    delete process.env.SURVEY_PASS_ISSUER_SALT
    delete process.env.SURVEY_PASS_ISSUER_PRIV
  })

  // 1. OTP Store Tests
  describe('OTP Store', () => {
    it('should save and retrieve OTP code', async () => {
      await otpStore.set('alice@test.com', '123456')
      expect(await otpStore.get('alice@test.com')).toBe('123456')
    })

    it('should normalize email to lowercase and trim', async () => {
      await otpStore.set(' Alice@Test.com ', '123456')
      expect(await otpStore.get('alice@test.com')).toBe('123456')
    })

    it('should return null for expired OTP', async () => {
      // 以顯式 now 控制過期（避免假計時器與 libsql async 互卡）
      const base = Date.now()
      await otpStore.set('alice@test.com', '123456', 5000) // expires_at = now+5s
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base + 6000)
      try {
        expect(await otpStore.get('alice@test.com')).toBeNull()
      } finally {
        nowSpy.mockRestore()
      }
    })

    it('should invalidate OTP after use', async () => {
      await otpStore.set('alice@test.com', '123456')
      await otpStore.invalidate('alice@test.com')
      expect(await otpStore.get('alice@test.com')).toBeNull()
    })
  })

  // 2. Salted Nullifier Hash Tests
  describe('Salted Nullifier Hash', () => {
    it('should compute the same hash for the same email with the same salt', () => {
      const hash1 = computeNullifierHash('alice@test.com')
      const hash2 = computeNullifierHash('alice@test.com')
      expect(Buffer.from(hash1).toString('hex')).toBe(Buffer.from(hash2).toString('hex'))
    })

    it('should produce different hashes for different salts', () => {
      const hash1 = computeNullifierHash('alice@test.com')
      process.env.SURVEY_PASS_ISSUER_SALT = 'different_salt'
      const hash2 = computeNullifierHash('alice@test.com')
      expect(Buffer.from(hash1).toString('hex')).not.toBe(Buffer.from(hash2).toString('hex'))
    })
  })

  // 3. Ticket Signing Tests
  describe('Ticket Signing', () => {
    it('should sign ticket and return valid signature', async () => {
      const email = 'alice@test.com'
      const nullifierHash = computeNullifierHash(email)
      const owner = '0xa11ce00000000000000000000000000000000000000000000000000000000000'
      const source = 2 // SRC_EMAIL
      const commitment = new Uint8Array(0)
      const expiresAt = Date.now() + 3600000

      const ticket = await signTicket(owner, source, [nullifierHash], commitment, expiresAt)
      expect(ticket.bff_sig).toBeDefined()
      expect(ticket.expires_at).toBe(BigInt(expiresAt).toString())
      expect(ticket.nullifiers).toHaveLength(1)
      expect(ticket.nullifiers[0]).toBe(Buffer.from(nullifierHash).toString('hex'))
    })
  })

  // 4. Fastify Endpoints Tests
  describe('Auth Endpoints', () => {
    let server: Hono

    beforeEach(() => {
      vi.clearAllMocks()
      server = new Hono()
      registerAuthRoutes(server)
    })

    const post = (url: string, payload: unknown) =>
      server.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

    it('should send OTP email without returning code in response', async () => {
      const response = await post('/auth/email/otp', { email: 'alice@test.com' })

      expect(response.status).toBe(200)
      const data = (await response.json()) as any
      expect(data.message).toBe('OTP sent successfully')
      expect(data.code).toBeUndefined()
      expect(sendOtpEmail).toHaveBeenCalledTimes(1)
      expect(sendOtpEmail).toHaveBeenCalledWith(
        'alice@test.com',
        expect.stringMatching(/^\d{6}$/),
        undefined
      )
    })

    it('should verify OTP and return signed ticket', async () => {
      // Step 1: Request OTP
      const otpResponse = await post('/auth/email/otp', { email: 'alice@test.com' })
      expect(otpResponse.status).toBe(200)
      const code = vi.mocked(sendOtpEmail).mock.calls[0][1] as string

      // Step 2: Verify OTP
      const owner = '0xa11ce00000000000000000000000000000000000000000000000000000000000'
      const verifyResponse = await post('/auth/email/verify', { email: 'alice@test.com', code, owner })

      expect(verifyResponse.status).toBe(200)
      const ticketData = (await verifyResponse.json()) as any
      expect(ticketData.bff_sig).toBeDefined()
      expect(ticketData.expires_at).toBeDefined()
      expect(Array.isArray(ticketData.nullifiers)).toBe(true)
      expect(ticketData.nullifiers).toHaveLength(1)
      expect(ticketData.source).toBe(2)
    })

    it('should fail with incorrect OTP code', async () => {
      // Set OTP manually
      await otpStore.set('alice@test.com', '123456')

      const owner = '0xa11ce00000000000000000000000000000000000000000000000000000000000'
      const verifyResponse = await post('/auth/email/verify', {
        email: 'alice@test.com',
        code: '654321', // incorrect
        owner,
      })

      expect(verifyResponse.status).toBe(401)
      const errData = (await verifyResponse.json()) as any
      expect(errData.error).toBe('Invalid or expired OTP code')
    })
  })

  // 差異化 TTL：getPassTtlMs 依來源回傳不同有效期
  describe('getPassTtlMs (per-source TTL)', () => {
    const SRC_EMAIL = 2
    const SRC_SOCIAL = 3
    const SRC_WORLD_ID = 5
    const SRC_SOCIAL_GOOGLE = 6
    const SRC_SOCIAL_GITHUB = 7
    const ONE_DAY = 24 * 60 * 60 * 1000
    const ONE_MONTH = 30 * ONE_DAY

    afterEach(() => {
      delete process.env.BFF_PASS_TTL_MS
      delete process.env.BFF_PASS_TTL_MS_EMAIL
      delete process.env.BFF_PASS_TTL_MS_SOCIAL
      delete process.env.BFF_PASS_TTL_MS_WORLDID
    })

    it('uses per-source defaults when no env set (Email/social 3mo, World ID 1yr)', () => {
      expect(getPassTtlMs(SRC_EMAIL)).toBe(3 * ONE_MONTH)
      expect(getPassTtlMs(SRC_SOCIAL)).toBe(3 * ONE_MONTH)
      expect(getPassTtlMs(SRC_SOCIAL_GOOGLE)).toBe(3 * ONE_MONTH)
      expect(getPassTtlMs(SRC_SOCIAL_GITHUB)).toBe(3 * ONE_MONTH)
      expect(getPassTtlMs(SRC_WORLD_ID)).toBe(365 * ONE_DAY)
    })

    it('uses global BFF_PASS_TTL_MS when no per-source env', () => {
      process.env.BFF_PASS_TTL_MS = '60000'
      expect(getPassTtlMs(SRC_EMAIL)).toBe(60000)
      expect(getPassTtlMs(SRC_SOCIAL)).toBe(60000)
    })

    it('per-source env overrides global', () => {
      process.env.BFF_PASS_TTL_MS = '60000'
      process.env.BFF_PASS_TTL_MS_WORLDID = '999000'
      expect(getPassTtlMs(SRC_WORLD_ID)).toBe(999000)
      expect(getPassTtlMs(SRC_EMAIL)).toBe(60000) // 無專屬 → 用全域
    })

    it('ignores invalid / non-positive env values and falls back to per-source default', () => {
      process.env.BFF_PASS_TTL_MS_EMAIL = 'abc'
      process.env.BFF_PASS_TTL_MS_SOCIAL = '0'
      expect(getPassTtlMs(SRC_EMAIL)).toBe(3 * ONE_MONTH)
      expect(getPassTtlMs(SRC_SOCIAL)).toBe(3 * ONE_MONTH)
    })

    it('maps specific social providers (google=6/github=7) to the SOCIAL TTL', () => {
      process.env.BFF_PASS_TTL_MS_SOCIAL = '123000'
      expect(getPassTtlMs(SRC_SOCIAL_GOOGLE)).toBe(123000)
      expect(getPassTtlMs(SRC_SOCIAL_GITHUB)).toBe(123000)
      // 與泛稱社群一致
      expect(getPassTtlMs(SRC_SOCIAL)).toBe(123000)
    })
  })
})
