import { describe, it, expect, vi } from 'vitest'
import type { SuiClient } from '@mysten/sui/client'
import {
  decryptAllResponses,
  aggregateStats,
  fetchClaimedEvents,
  type SurveyClaimedEvent,
} from '../lib/dashboardDecrypt'
import { deriveCreatorKeyPair, encryptAnswers, KEY_DERIVE_MSG } from '../lib/crypto'

// ── helpers ───────────────────────────────────────────────────────────────────

async function makeCreatorKeyPair(salt = 'wallet-A') {
  const msg = new TextEncoder().encode(`${salt}:${KEY_DERIVE_MSG}`)
  const sig = new Uint8Array(await crypto.subtle.digest('SHA-256', msg))
  return deriveCreatorKeyPair(sig)
}

async function makeEncryptedEvent(
  answers: Record<string, unknown>,
  publicKeyBytes: Uint8Array,
  vaultId = '0xvault001',
  respondent = '0xabc',
): Promise<SurveyClaimedEvent> {
  const encrypted = await encryptAnswers(JSON.stringify(answers), publicKeyBytes)
  return {
    vault_id: vaultId,
    sub_hash: [1, 2, 3],
    respondent,
    encrypted_answers: Array.from(encrypted),
    claimed_at_ms: 1_700_000_000_000,
  }
}

// ── test_dashboard_decrypts_all_responses ─────────────────────────────────────

describe('T3.3 — Dashboard Decrypt', () => {
  describe('test_dashboard_decrypts_all_responses', () => {
    it('decrypts every event and returns correct answers', async () => {
      const { publicKeyBytes, privateKey } = await makeCreatorKeyPair()

      const events = await Promise.all([
        makeEncryptedEvent({ q1: 'Good', q2: 4 }, publicKeyBytes, '0xvault', '0x01'),
        makeEncryptedEvent({ q1: 'Bad', q2: 2 }, publicKeyBytes, '0xvault', '0x02'),
        makeEncryptedEvent({ q1: 'Good', q2: 5 }, publicKeyBytes, '0xvault', '0x03'),
      ])

      const { responses, failed } = await decryptAllResponses(events, privateKey)

      expect(responses).toHaveLength(3)
      expect(failed).toBe(0)
      expect(responses[0].answers).toEqual({ q1: 'Good', q2: 4 })
      expect(responses[1].answers).toEqual({ q1: 'Bad', q2: 2 })
      expect(responses[2].answers).toEqual({ q1: 'Good', q2: 5 })
      expect(responses[0].respondent).toBe('0x01')
    })

    it('counts corrupted events as failed without throwing', async () => {
      const { publicKeyBytes, privateKey } = await makeCreatorKeyPair()

      const goodEvent = await makeEncryptedEvent({ q1: 'Yes' }, publicKeyBytes)
      const corruptEvent: SurveyClaimedEvent = {
        vault_id: '0xvault001',
        sub_hash: [9, 9, 9],
        respondent: '0xevil',
        // 50 bytes of 0xAA — not a valid ECIES ciphertext
        encrypted_answers: Array.from(new Uint8Array(50).fill(0xaa)),
        claimed_at_ms: 1_700_000_000_000,
      }

      const { responses, failed } = await decryptAllResponses(
        [goodEvent, corruptEvent],
        privateKey,
      )
      expect(responses).toHaveLength(1)
      expect(failed).toBe(1)
    })

    it('returns zero responses and full failed count when key is wrong', async () => {
      const { publicKeyBytes } = await makeCreatorKeyPair('wallet-a')
      const { privateKey: wrongKey } = await makeCreatorKeyPair('wallet-b')

      const events = await Promise.all([
        makeEncryptedEvent({ q1: 'Good' }, publicKeyBytes),
        makeEncryptedEvent({ q1: 'Bad' }, publicKeyBytes),
      ])

      const { responses, failed } = await decryptAllResponses(events, wrongKey)
      expect(responses).toHaveLength(0)
      expect(failed).toBe(2)
    })
  })

  // ── test_stats_match_decrypted_count ────────────────────────────────────────

  describe('test_stats_match_decrypted_count', () => {
    it('aggregated totals exactly match decrypted count', async () => {
      const { publicKeyBytes, privateKey } = await makeCreatorKeyPair()

      const events = await Promise.all([
        makeEncryptedEvent({ q1: 'Good', q2: 4 }, publicKeyBytes),
        makeEncryptedEvent({ q1: 'Bad', q2: 2 }, publicKeyBytes),
        makeEncryptedEvent({ q1: 'Good', q2: 5 }, publicKeyBytes),
      ])

      const { responses } = await decryptAllResponses(events, privateKey)
      const stats = aggregateStats(responses, events.length)

      expect(stats.total_responses).toBe(3)
      expect(stats.decrypted_count).toBe(3)
      expect(stats.failed_count).toBe(0)
    })

    it('per-question counts are correct', async () => {
      const { publicKeyBytes, privateKey } = await makeCreatorKeyPair()

      const events = await Promise.all([
        makeEncryptedEvent({ q1: 'Good', q2: 4 }, publicKeyBytes),
        makeEncryptedEvent({ q1: 'Bad', q2: 2 }, publicKeyBytes),
        makeEncryptedEvent({ q1: 'Good', q2: 5 }, publicKeyBytes),
      ])

      const { responses } = await decryptAllResponses(events, privateKey)
      const stats = aggregateStats(responses, events.length)

      expect(stats.questions['q1'].counts['Good']).toBe(2)
      expect(stats.questions['q1'].counts['Bad']).toBe(1)
      expect(stats.questions['q2'].counts['4']).toBe(1)
      expect(stats.questions['q2'].counts['2']).toBe(1)
      expect(stats.questions['q2'].counts['5']).toBe(1)
    })

    it('failed_count reflects decryption failures in stats', async () => {
      const { publicKeyBytes, privateKey } = await makeCreatorKeyPair()

      const goodEvent = await makeEncryptedEvent({ q1: 'Yes' }, publicKeyBytes)
      const badEvent: SurveyClaimedEvent = {
        vault_id: '0xvault001',
        sub_hash: [5],
        respondent: '0xfail',
        encrypted_answers: [0, 0, 0, 0, 0], // too short — decryption must fail
        claimed_at_ms: 0,
      }

      const { responses, failed } = await decryptAllResponses(
        [goodEvent, badEvent],
        privateKey,
      )
      const stats = aggregateStats(responses, 2)

      expect(stats.total_responses).toBe(2)
      expect(stats.decrypted_count).toBe(1)
      expect(stats.failed_count).toBe(1)
      expect(failed).toBe(1)
    })

    it('returns empty questions map when no responses', () => {
      const stats = aggregateStats([], 0)
      expect(stats.total_responses).toBe(0)
      expect(stats.decrypted_count).toBe(0)
      expect(stats.failed_count).toBe(0)
      expect(stats.questions).toEqual({})
    })
  })

  // ── fetchClaimedEvents ──────────────────────────────────────────────────────

  describe('fetchClaimedEvents', () => {
    it('filters by vault_id and maps parsedJson to SurveyClaimedEvent', async () => {
      const vaultId = '0xdeadbeef'
      const packageId = '0xpkg123'

      const mockClient = {
        queryEvents: vi.fn().mockResolvedValue({
          data: [
            {
              parsedJson: {
                vault_id: vaultId,
                sub_hash: [1],
                respondent: '0x01',
                encrypted_answers: [0],
                claimed_at_ms: 100,
              },
            },
            {
              parsedJson: {
                vault_id: '0xother_vault',
                sub_hash: [2],
                respondent: '0x02',
                encrypted_answers: [1],
                claimed_at_ms: 200,
              },
            },
          ],
          hasNextPage: false,
          nextCursor: null,
        }),
      } as unknown as SuiClient

      const events = await fetchClaimedEvents(mockClient, vaultId, packageId)

      expect(events).toHaveLength(1)
      expect(events[0].vault_id).toBe(vaultId)
      expect(events[0].respondent).toBe('0x01')
      expect(mockClient.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            All: [
              { MoveEventType: `${packageId}::survey_vault::SurveyClaimed` },
              { MoveEventField: { path: '/vault_id', value: vaultId } },
            ],
          },
        }),
      )
    })

    it('paginates until hasNextPage is false', async () => {
      const vaultId = '0xvault'
      const packageId = '0xpkg'

      const mockClient = {
        queryEvents: vi
          .fn()
          .mockResolvedValueOnce({
            data: [
              {
                parsedJson: {
                  vault_id: vaultId,
                  sub_hash: [1],
                  respondent: '0xr1',
                  encrypted_answers: [0],
                  claimed_at_ms: 1,
                },
              },
            ],
            hasNextPage: true,
            nextCursor: 'cursor-page-2',
          })
          .mockResolvedValueOnce({
            data: [
              {
                parsedJson: {
                  vault_id: vaultId,
                  sub_hash: [2],
                  respondent: '0xr2',
                  encrypted_answers: [1],
                  claimed_at_ms: 2,
                },
              },
            ],
            hasNextPage: false,
            nextCursor: null,
          }),
      } as unknown as SuiClient

      const events = await fetchClaimedEvents(mockClient, vaultId, packageId)

      expect(events).toHaveLength(2)
      expect(mockClient.queryEvents).toHaveBeenCalledTimes(2)
    })
  })
})
