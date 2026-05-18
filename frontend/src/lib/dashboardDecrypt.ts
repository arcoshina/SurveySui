/**
 * T3.3 — Dashboard decrypt + stats aggregation.
 *
 * Fetches SurveyClaimed events for a vault, decrypts encrypted_answers using
 * the creator's X25519 private key, and aggregates per-question answer counts.
 *
 * Designed for the /dashboard/:vaultId page (T4.6).
 */

import type { SuiClient } from '@mysten/sui/client'
import { decryptAnswers } from './crypto'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Mirrors the on-chain SurveyClaimed event fields returned via parsedJson. */
export interface SurveyClaimedEvent {
  vault_id: string
  sub_hash: number[]
  respondent: string
  encrypted_answers: number[]
  claimed_at_ms: number
}

/** One successfully decrypted response. */
export interface DecryptedResponse {
  respondent: string
  sub_hash: number[]
  /** JSON-parsed answer payload, e.g. { q1: "Good", q2: 4 } */
  answers: Record<string, unknown>
  claimed_at_ms: number
}

/** Per-question frequency map: answer value (stringified) → count. */
export interface QuestionStats {
  counts: Record<string, number>
}

export interface DashboardStats {
  /** Total SurveyClaimed events fetched from chain for this vault. */
  total_responses: number
  /** Events that were successfully decrypted and JSON-parsed. */
  decrypted_count: number
  /** Events that failed decryption (corrupted bytes or wrong key). */
  failed_count: number
  /** Per-question aggregated counts, keyed by answer field name. */
  questions: Record<string, QuestionStats>
}

// ── fetchClaimedEvents ────────────────────────────────────────────────────────

/**
 * Query all SurveyClaimed events for the given vault from the Sui RPC.
 *
 * Uses an `All` filter combining MoveEventType + MoveEventField so the RPC
 * pre-filters by vault_id server-side, avoiding fetching every vault's events.
 *
 * Defence-in-depth: keep the client-side vault_id check too — Sui RPC support
 * for `MoveEventField` over ID-typed fields varies by node version, and we'd
 * rather discard a stray cross-vault event than show a wrong response on the
 * dashboard.
 */
export async function fetchClaimedEvents(
  client: SuiClient,
  vaultId: string,
  packageId: string,
): Promise<SurveyClaimedEvent[]> {
  const events: SurveyClaimedEvent[] = []
  let cursor: Parameters<SuiClient['queryEvents']>[0]['cursor'] = null

  do {
    const page = await client.queryEvents({
      query: {
        All: [
          { MoveEventType: `${packageId}::survey_vault::SurveyClaimed` },
          { MoveEventField: { path: '/vault_id', value: vaultId } },
        ],
      },
      cursor,
      limit: 50,
    })

    for (const ev of page.data) {
      const parsed = ev.parsedJson as SurveyClaimedEvent
      if (parsed.vault_id === vaultId) {
        events.push(parsed)
      }
    }

    cursor = page.hasNextPage ? page.nextCursor ?? null : null
  } while (cursor !== null)

  return events
}

// ── decryptAllResponses ───────────────────────────────────────────────────────

/**
 * Decrypt every event's encrypted_answers using the creator's private key.
 * Events that fail decryption (corrupted bytes, wrong key) are silently counted
 * in `failed` so the dashboard can surface a "N responses could not be read" notice.
 */
export async function decryptAllResponses(
  events: SurveyClaimedEvent[],
  creatorPrivateKey: CryptoKey,
): Promise<{ responses: DecryptedResponse[]; failed: number }> {
  const responses: DecryptedResponse[] = []
  let failed = 0

  for (const ev of events) {
    try {
      const encryptedBytes = new Uint8Array(ev.encrypted_answers)
      const plaintext = await decryptAnswers(encryptedBytes, creatorPrivateKey)
      const answers = JSON.parse(plaintext) as Record<string, unknown>
      responses.push({
        respondent: ev.respondent,
        sub_hash: ev.sub_hash,
        answers,
        claimed_at_ms: ev.claimed_at_ms,
      })
    } catch {
      failed++
    }
  }

  return { responses, failed }
}

// ── aggregateStats ────────────────────────────────────────────────────────────

/**
 * Aggregate per-question answer counts from a list of decrypted responses.
 *
 * @param responses     Successfully decrypted responses.
 * @param totalEvents   Total number of on-chain events (≥ responses.length).
 */
export function aggregateStats(
  responses: DecryptedResponse[],
  totalEvents: number,
): DashboardStats {
  const questions: Record<string, QuestionStats> = {}

  for (const { answers } of responses) {
    for (const [key, value] of Object.entries(answers)) {
      if (!questions[key]) {
        questions[key] = { counts: {} }
      }
      const label = String(value)
      questions[key].counts[label] = (questions[key].counts[label] ?? 0) + 1
    }
  }

  return {
    total_responses: totalEvents,
    decrypted_count: responses.length,
    failed_count: totalEvents - responses.length,
    questions,
  }
}
