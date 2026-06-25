/**
 * T3.3 — Dashboard decrypt + stats aggregation.
 *
 * Fetches SurveyClaimed events for a vault, decrypts encrypted_answers using
 * the creator's hybrid (X25519 + ML-KEM-768) key pair, and aggregates
 * per-question answer counts.
 *
 * Designed for the /dashboard/:vaultId page (T4.6).
 */

import type { SuiClient } from '@mysten/sui/client'
import { decryptAnswers, type CreatorKeyPair } from './crypto'

import { decodeAnswers, SchemaMismatchError } from './answerCodec'
import type { Question } from './frontmatter'
import { downloadFromDecentralizedStorage } from './storage'

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
  /** Events whose payload schema is incompatible (version/schema_hash mismatch); excluded from aggregation. */
  schema_mismatch_count: number
  /** Per-question aggregated counts, keyed by answer field name. */
  questions: Record<string, QuestionStats>
}

// ── fetchClaimedEvents ────────────────────────────────────────────────────────

/** Convert a Move `vector<u8>` as returned by the RPC (number[] or base64) to bytes. */
function moveBytesToUint8(v: unknown): Uint8Array {
  if (v == null) return new Uint8Array()
  if (Array.isArray(v)) return Uint8Array.from(v as number[])
  if (typeof v === 'string') {
    try {
      const bin = atob(v)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out
    } catch {
      return new TextEncoder().encode(v)
    }
  }
  return new Uint8Array()
}

/**
 * Fetch every stored answer for a vault.
 *
 * Answers now live in **deletable dynamic fields** on the vault object (so they
 * can be destroyed at purge), not in the immutable `SurveyClaimed` event. Each
 * field is a `Field<u64, AnswerRecord>`. We read them, and for Walrus-backed
 * answers (`kind === 1`) download the blob so the returned `encrypted_answers`
 * always carries the ciphertext bytes — keeping the downstream decrypt/decode
 * paths unchanged. The `packageId` arg is retained for signature compatibility.
 */
export async function fetchClaimedEvents(
  client: SuiClient,
  vaultId: string,
  _packageId: string
): Promise<SurveyClaimedEvent[]> {
  // 1. Collect the answer dynamic-field object ids (name type is u64).
  const fieldIds: string[] = []
  let cursor: string | null = null
  let pageCount = 0
  const maxPages = 200
  do {
    const page = await client.getDynamicFields({ parentId: vaultId, cursor })
    for (const f of page.data) {
      if (f.name?.type === 'u64') fieldIds.push(f.objectId)
    }
    cursor = page.hasNextPage ? (page.nextCursor ?? null) : null
    pageCount++
  } while (cursor !== null && pageCount < maxPages)

  if (fieldIds.length === 0) return []

  // 2. Batch-read the field objects and resolve each answer to ciphertext bytes.
  const events: SurveyClaimedEvent[] = []
  for (let i = 0; i < fieldIds.length; i += 50) {
    const batch = fieldIds.slice(i, i + 50)
    const objs = await client.multiGetObjects({ ids: batch, options: { showContent: true } })
    for (const o of objs) {
      const content = o.data?.content as
        | { dataType?: string; fields?: { value?: { fields?: Record<string, unknown> } } }
        | undefined
      if (!content || content.dataType !== 'moveObject') continue
      const rec = content.fields?.value?.fields
      if (!rec) continue
      const kind = Number(rec.kind)
      let payloadBytes = moveBytesToUint8(rec.payload)
      if (kind === 1) {
        // payload is a Walrus/IPFS blob id (utf8 bytes); resolve to ciphertext.
        const blobId = new TextDecoder().decode(payloadBytes)
        try {
          payloadBytes = await downloadFromDecentralizedStorage(blobId)
        } catch (e) {
          console.warn('[dashboardDecrypt] blob download failed for', blobId, e)
          continue
        }
      }
      events.push({
        vault_id: vaultId,
        sub_hash: Array.from(moveBytesToUint8(rec.sub_hash)),
        respondent: String(rec.respondent),
        encrypted_answers: Array.from(payloadBytes),
        claimed_at_ms: Number(rec.claimed_at_ms),
      })
    }
  }

  // Stable chronological order.
  events.sort((a, b) => a.claimed_at_ms - b.claimed_at_ms)
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
  creatorKeyPair: CreatorKeyPair,
  questions: Question[],
  vaultSchemaHash: string | Uint8Array
): Promise<{ responses: DecryptedResponse[]; failed: number; schemaMismatch: number }> {
  const responses: DecryptedResponse[] = []
  let failed = 0
  let schemaMismatch = 0

  for (const ev of events) {
    try {
      const encryptedBytes = new Uint8Array(ev.encrypted_answers)
      const plaintext = await decryptAnswers(encryptedBytes, creatorKeyPair)
      const answers = decodeAnswers(plaintext, questions, vaultSchemaHash)
      responses.push({
        respondent: ev.respondent,
        sub_hash: ev.sub_hash,
        answers,
        claimed_at_ms: Number(ev.claimed_at_ms),
      })
    } catch (e) {
      if (e instanceof SchemaMismatchError) schemaMismatch++
      else failed++
    }
  }

  return { responses, failed, schemaMismatch }
}

/**
 * Decode all plain (unencrypted) responses from on-chain event list.
 */
export function decodeAllPlainResponses(
  events: SurveyClaimedEvent[],
  questions: Question[],
  vaultSchemaHash: string | Uint8Array
): { responses: DecryptedResponse[]; failed: number; schemaMismatch: number } {
  const responses: DecryptedResponse[] = []
  let failed = 0
  let schemaMismatch = 0

  for (const ev of events) {
    try {
      const bytes = new Uint8Array(ev.encrypted_answers)
      const plaintext = new TextDecoder().decode(bytes)
      const answers = decodeAnswers(plaintext, questions, vaultSchemaHash)
      responses.push({
        respondent: ev.respondent,
        sub_hash: ev.sub_hash,
        answers,
        claimed_at_ms: Number(ev.claimed_at_ms),
      })
    } catch (e) {
      if (e instanceof SchemaMismatchError) schemaMismatch++
      else failed++
    }
  }

  return { responses, failed, schemaMismatch }
}


// ── aggregateStats ────────────────────────────────────────────────────────────

/**
 * Aggregate per-question answer counts from a list of decrypted responses.
 *
 * @param responses      Successfully decrypted responses.
 * @param totalEvents    Total number of on-chain events (≥ responses.length).
 * @param schemaMismatch Responses excluded due to incompatible schema (version/schema_hash mismatch).
 */
export function aggregateStats(
  responses: DecryptedResponse[],
  totalEvents: number,
  schemaMismatch = 0
): DashboardStats {
  const questions: Record<string, QuestionStats> = {}

  for (const { answers } of responses) {
    for (const [key, value] of Object.entries(answers)) {
      if (!questions[key]) {
        questions[key] = { counts: {} }
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const label = String(item)
          questions[key].counts[label] = (questions[key].counts[label] ?? 0) + 1
        }
      } else {
        const label = String(value)
        questions[key].counts[label] = (questions[key].counts[label] ?? 0) + 1
      }
    }
  }

  return {
    total_responses: totalEvents,
    decrypted_count: responses.length,
    failed_count: totalEvents - responses.length - schemaMismatch,
    schema_mismatch_count: schemaMismatch,
    questions,
  }
}
