import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  computeSocialPrimaryNullifier,
  computeEmailSecondaryNullifier,
  computeNullifierHash,
  signTicket,
} from '../src/auth/ticket.js'
import { oauthStore } from '../src/auth/oauthStore.js'
import { setupFakeD1 } from './helpers/fakeD1.js'

const OWNER = '0xa11ce00000000000000000000000000000000000000000000000000000000000'

describe('Social Auth — Tier 1', () => {
  beforeEach(async () => {
    process.env.SURVEY_PASS_ISSUER_SALT = 'test_salt_tier1'
    process.env.SURVEY_PASS_ISSUER_PRIV =
      '0101010101010101010101010101010101010101010101010101010101010101'
    await setupFakeD1() // 全新空 D1（取代 oauthStore.clear()）
  })

  afterEach(() => {
    delete process.env.SURVEY_PASS_ISSUER_SALT
    delete process.env.SURVEY_PASS_ISSUER_PRIV
  })

  // ── nullifier 計算 ─────────────────────────────────────────────────────────

  describe('Social primary nullifier', () => {
    it('should compute deterministically for the same provider+sub', () => {
      const n1 = computeSocialPrimaryNullifier('google', 'user123')
      const n2 = computeSocialPrimaryNullifier('google', 'user123')
      expect(Buffer.from(n1).toString('hex')).toBe(Buffer.from(n2).toString('hex'))
    })

    it('should differ across providers for the same sub', () => {
      const nGoogle = computeSocialPrimaryNullifier('google', 'user123')
      const nGithub = computeSocialPrimaryNullifier('github', 'user123')
      expect(Buffer.from(nGoogle).toString('hex')).not.toBe(Buffer.from(nGithub).toString('hex'))
    })

    it('should differ from email nullifier for same string', () => {
      const social = computeSocialPrimaryNullifier('google', 'user@example.com')
      const email = computeEmailSecondaryNullifier('user@example.com')
      expect(Buffer.from(social).toString('hex')).not.toBe(Buffer.from(email).toString('hex'))
    })
  })

  describe('Email secondary nullifier', () => {
    it('should be identical to computeNullifierHash (backward compat alias)', () => {
      const n1 = computeEmailSecondaryNullifier('alice@test.com')
      const n2 = computeNullifierHash('alice@test.com')
      expect(Buffer.from(n1).toString('hex')).toBe(Buffer.from(n2).toString('hex'))
    })
  })

  // ── ticket 簽名：2 個 nullifier ────────────────────────────────────────────

  describe('signTicket with 2 nullifiers', () => {
    it('should return nullifiers array with 2 entries for Social with email', async () => {
      const provider = 'google'
      const sub = 'google-uid-9999'
      const email = 'alice@gmail.com'

      const primary = computeSocialPrimaryNullifier(provider, sub)
      const secondary = computeEmailSecondaryNullifier(email)
      const nullifiers = [primary, secondary]

      const ticket = await signTicket(OWNER, 3, nullifiers, new Uint8Array(0), Date.now() + 3600000)

      expect(ticket.nullifiers).toHaveLength(2)
      expect(ticket.nullifiers[0]).toBe(Buffer.from(primary).toString('hex'))
      expect(ticket.nullifiers[1]).toBe(Buffer.from(secondary).toString('hex'))
      expect(ticket.bff_sig).toBeDefined()
    })

    it('should return nullifiers array with 1 entry for Twitch (no email)', async () => {
      const primary = computeSocialPrimaryNullifier('twitch', 'twitch-uid-7777')
      const nullifiers = [primary]

      const ticket = await signTicket(OWNER, 3, nullifiers, new Uint8Array(0), Date.now() + 3600000)

      expect(ticket.nullifiers).toHaveLength(1)
      expect(ticket.nullifiers[0]).toBe(Buffer.from(primary).toString('hex'))
    })
  })

  // ── Email OTP 向後相容 ─────────────────────────────────────────────────────

  describe('Email OTP backward compatibility', () => {
    it('should work with 1-element nullifiers array (source=2)', async () => {
      const emailNullifier = computeNullifierHash('alice@test.com')
      const ticket = await signTicket(
        OWNER,
        2,
        [emailNullifier],
        new Uint8Array(0),
        Date.now() + 3600000
      )

      expect(ticket.nullifiers).toHaveLength(1)
      expect(ticket.source ?? 2).toBe(2)
    })
  })

  // ── OAuthStore ─────────────────────────────────────────────────────────────

  describe('OAuthStore', () => {
    it('should store and retrieve state entry (incl. sidHash)', async () => {
      await oauthStore.set('state123', {
        verifier: 'abc',
        provider: 'google',
        owner: OWNER,
        sidHash: 'deadbeef',
      })
      const entry = await oauthStore.get('state123')
      expect(entry?.provider).toBe('google')
      expect(entry?.verifier).toBe('abc')
      expect(entry?.owner).toBe(OWNER)
      expect(entry?.sidHash).toBe('deadbeef')
    })

    it('should return null for unknown state', async () => {
      expect(await oauthStore.get('nonexistent')).toBeNull()
    })

    it('should return null after invalidation', async () => {
      await oauthStore.set('state456', {
        verifier: 'xyz',
        provider: 'github',
        owner: OWNER,
        sidHash: 'cafe',
      })
      await oauthStore.invalidate('state456')
      expect(await oauthStore.get('state456')).toBeNull()
    })
  })
})
