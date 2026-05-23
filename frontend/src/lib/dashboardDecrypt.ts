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

import { decodeAnswers } from './answerCodec'
import type { Question } from './frontmatter'

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
 * Filters server-side by MoveEventType only, then narrows to the target vault
 * client-side. Sui devnet RPC rejects `MoveEventField` over ID-typed fields
 * with "Invalid params" (the All filter then silently returns zero events),
 * so we cannot pre-filter by vault_id at the RPC level.
 */
export async function fetchClaimedEvents(
  client: SuiClient,
  vaultId: string,
  packageId: string
): Promise<SurveyClaimedEvent[]> {
  const events: SurveyClaimedEvent[] = []
  let cursor: Parameters<SuiClient['queryEvents']>[0]['cursor'] = null
  let pageCount = 0
  const maxPages = 20 // Safety limit to avoid hanging the UI / infinite loops on bad RPC responses

  do {
    const page = await client.queryEvents({
      query: { MoveEventType: `${packageId}::survey_vault::SurveyClaimed` },
      cursor,
      limit: 50,
    })

    for (const ev of page.data) {
      const parsed = ev.parsedJson as SurveyClaimedEvent
      if (parsed.vault_id === vaultId) {
        events.push(parsed)
      }
    }

    cursor = page.hasNextPage ? (page.nextCursor ?? null) : null
    pageCount++
  } while (cursor !== null && pageCount < maxPages)

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
  questions: Question[],
  vaultSchemaHash: string | Uint8Array
): Promise<{ responses: DecryptedResponse[]; failed: number }> {
  const responses: DecryptedResponse[] = []
  let failed = 0

  for (const ev of events) {
    try {
      const encryptedBytes = new Uint8Array(ev.encrypted_answers)
      const plaintext = await decryptAnswers(encryptedBytes, creatorPrivateKey)
      const answers = decodeAnswers(plaintext, questions, vaultSchemaHash)
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
  totalEvents: number
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
