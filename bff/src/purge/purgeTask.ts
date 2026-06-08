import type { SuiClient } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import {
  buildAndDryRunPurgeWithRebateRefund,
  readVaultCreator,
} from './rebateRefund.js'

/**
 * Background task that permanently destroys surveys whose grace period has
 * elapsed. This is the "automatic" trigger for the data-purge lifecycle: Sui has
 * no on-chain scheduler, so an external transaction must call `survey_vault::purge`
 * once the gate opens. The on-chain function re-checks the gate, so a premature
 * call simply aborts — this scan is only an optimisation to avoid doomed txs.
 *
 * Storage rebate from deleted objects is forwarded to vault.creator in the same
 * PTB (after dry-run gas estimation) when PURGE_REBATE_REFUND_ENABLED is true.
 */

const STATUS_CLOSED = 1

export interface PurgeTaskConfig {
  suiClient: SuiClient
  sponsorKeypair: Ed25519Keypair
  packageId: string
  registryId: string
  /** Max surveys to purge per cycle (bounds run time / gas). */
  maxPerCycle?: number
}

interface VaultState {
  status: number
  closedAtMs: bigint
  deadlineMs: bigint
  purgeGraceMs: bigint
  creator: string | null
}

/** Read the lifecycle fields of a vault, or null if it no longer exists. */
async function readVaultState(suiClient: SuiClient, vaultId: string): Promise<VaultState | null> {
  try {
    const res = await suiClient.getObject({ id: vaultId, options: { showContent: true } })
    const content = res.data?.content as any
    if (!content || content.dataType !== 'moveObject') return null
    const f = content.fields
    return {
      status: Number(f.status),
      closedAtMs: BigInt(f.closed_at_ms ?? 0),
      deadlineMs: BigInt(f.deadline_ms ?? 0),
      purgeGraceMs: BigInt(f.purge_grace_ms ?? 0),
      creator: f.creator ? String(f.creator) : null,
    }
  } catch {
    return null
  }
}

/** Terminal anchor + grace gate, mirroring `survey_vault::purge`. */
function isPurgeable(v: VaultState, nowMs: bigint): boolean {
  let anchor: bigint
  if (v.status === STATUS_CLOSED) {
    anchor = v.closedAtMs
  } else if (nowMs > v.deadlineMs) {
    anchor = v.deadlineMs
  } else {
    return false
  }
  return nowMs >= anchor + v.purgeGraceMs
}

/** One scan: find purge-eligible surveys and destroy them. Returns the count purged. */
export async function checkAndPurge(config: PurgeTaskConfig): Promise<number> {
  const { suiClient, sponsorKeypair, packageId, registryId, maxPerCycle = 10 } = config

  const nowMs = BigInt(Date.now())

  const surveys: Array<{ surveyId: string; vaultId: string }> = []
  let cursor: any = null
  let pageCount = 0
  const maxPages = 50
  try {
    do {
      const page = await suiClient.queryEvents({
        query: { MoveEventType: `${packageId}::survey_registry::SurveyRegistered` },
        cursor,
        limit: 50,
      })
      for (const ev of page.data) {
        const p = ev.parsedJson as any
        if (p?.survey_id && p?.vault_id) {
          surveys.push({ surveyId: p.survey_id, vaultId: p.vault_id })
        }
      }
      cursor = page.hasNextPage ? (page.nextCursor ?? null) : null
      pageCount++
    } while (cursor !== null && pageCount < maxPages)
  } catch (err) {
    console.error('[PurgeTask] Failed to enumerate surveys:', err)
    return 0
  }

  let purged = 0
  for (const { surveyId, vaultId } of surveys) {
    if (purged >= maxPerCycle) break
    const state = await readVaultState(suiClient, vaultId)
    if (!state || !isPurgeable(state, nowMs)) continue

    try {
      const creator =
        state.creator ?? (await readVaultCreator(suiClient, vaultId))

      const { tx, gasBudget, transferAmount, platformFee, creator: refundCreator } =
        await buildAndDryRunPurgeWithRebateRefund(
          suiClient,
          sponsorKeypair,
          { packageId, registryId, surveyId, vaultId },
          creator
        )

      tx.setGasBudget(Number(gasBudget))
      await suiClient.signAndExecuteTransaction({ transaction: tx, signer: sponsorKeypair })

      purged++
      if (transferAmount > 0n) {
        console.log(
          `[PurgeTask] Purged vault ${vaultId}, rebate ${transferAmount} MIST → creator ${refundCreator} (platform fee ${platformFee} MIST)`
        )
      } else {
        console.log(`[PurgeTask] Purged survey ${surveyId} (vault ${vaultId})`)
      }
    } catch (err) {
      console.warn(`[PurgeTask] purge failed for ${vaultId}:`, err)
    }
  }

  if (purged > 0) console.log(`[PurgeTask] Cycle complete — purged ${purged} survey(s).`)
  return purged
}

let purgeInterval: NodeJS.Timeout | null = null

/**
 * Start the periodic purge scan. No-op unless `PURGE_TASK_ENABLED=true` and a
 * `SURVEY_REGISTRY_ID` is configured. Returns a stop function.
 */
export function startPurgeTask(
  suiClient: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string
): () => void {
  if (process.env.PURGE_TASK_ENABLED !== 'true') {
    console.log('[PurgeTask] Disabled (set PURGE_TASK_ENABLED=true to enable).')
    return () => {}
  }
  const registryId = process.env.SURVEY_REGISTRY_ID
  if (!registryId) {
    console.warn('[PurgeTask] SURVEY_REGISTRY_ID not set — purge task not started.')
    return () => {}
  }

  const intervalMs = process.env.PURGE_SCAN_INTERVAL_MS
    ? parseInt(process.env.PURGE_SCAN_INTERVAL_MS, 10)
    : 43200000
  const maxPerCycle = process.env.PURGE_MAX_PER_CYCLE
    ? parseInt(process.env.PURGE_MAX_PER_CYCLE, 10)
    : 10

  if (purgeInterval) clearInterval(purgeInterval)

  const run = () => {
    checkAndPurge({ suiClient, sponsorKeypair: keypair, packageId, registryId, maxPerCycle }).catch(
      (err) => console.error('[PurgeTask] Error in background task:', err)
    )
  }

  const startupTimeout = setTimeout(run, 10_000)
  purgeInterval = setInterval(run, intervalMs)
  console.log(`[PurgeTask] Started — scanning every ${intervalMs}ms.`)

  return () => {
    clearTimeout(startupTimeout)
    if (purgeInterval) {
      clearInterval(purgeInterval)
      purgeInterval = null
    }
  }
}
