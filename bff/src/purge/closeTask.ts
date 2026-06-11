import type { SuiClient, EventId } from '@mysten/sui/client'
import type { SponsorSigner } from '@surveysui/gas-station-core'
import { signAndExecuteWithSponsor } from '@surveysui/gas-station-core'
import { buildClosePtb } from './buildClosePtb.js'
import { prepareGasPayment } from './buildPurgePtb.js'

/**
 * Background task that closes OPEN vaults once their deadline has passed.
 * Sui has no on-chain scheduler; the sponsor sends `survey_vault::close` on the
 * non-creator path when `now > deadline_ms`. On-chain re-checks still apply.
 */

const STATUS_OPEN = 0

export interface CloseTaskConfig {
  suiClient: SuiClient
  sponsorSigner: SponsorSigner
  packageId: string
  maxPerCycle?: number
}

interface VaultCloseState {
  status: number
  deadlineMs: bigint
}

async function readVaultCloseState(
  suiClient: SuiClient,
  vaultId: string
): Promise<VaultCloseState | null> {
  try {
    const res = await suiClient.getObject({ id: vaultId, options: { showContent: true } })
    const content = res.data?.content as { dataType?: string; fields?: Record<string, unknown> } | undefined
    if (!content || content.dataType !== 'moveObject') return null
    const f = content.fields ?? {}
    return {
      status: Number(f.status),
      deadlineMs: BigInt(String(f.deadline_ms ?? 0)),
    }
  } catch {
    return null
  }
}

/** OPEN vault past deadline — mirrors non-creator `survey_vault::close` gate. */
export function isCloseEligible(v: VaultCloseState, nowMs: bigint): boolean {
  return v.status === STATUS_OPEN && nowMs > v.deadlineMs
}

export async function checkAndClose(config: CloseTaskConfig): Promise<number> {
  const { suiClient, sponsorSigner, packageId, maxPerCycle = 10 } = config
  const nowMs = BigInt(Date.now())

  const vaultIds = new Set<string>()
  let cursor: EventId | null | undefined = null
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
        const p = ev.parsedJson as { vault_id?: string } | undefined
        if (p?.vault_id) vaultIds.add(p.vault_id)
      }
      cursor = page.hasNextPage ? (page.nextCursor ?? null) : null
      pageCount++
    } while (cursor !== null && pageCount < maxPages)
  } catch (err) {
    console.error('[CloseTask] Failed to enumerate surveys:', err)
    return 0
  }

  let closed = 0
  for (const vaultId of vaultIds) {
    if (closed >= maxPerCycle) break
    const state = await readVaultCloseState(suiClient, vaultId)
    if (!state || !isCloseEligible(state, nowMs)) continue

    try {
      const tx = buildClosePtb({ packageId, vaultId })
      tx.setGasBudget(5_000_000)
      // 固定單顆 gas coin:不指定時 SDK 會把 sponsor 全部 coin 掛進 gas payment,
      // 執行即合併整個 coin 池,並與 pipeline 鎖定中的 coin 產生版本衝突。
      await prepareGasPayment(tx, suiClient, sponsorSigner.getSponsorAddress(), 5_000_000n)
      await signAndExecuteWithSponsor(suiClient, sponsorSigner, tx)
      closed++
      console.log(`[CloseTask] Closed vault ${vaultId} (deadline ${state.deadlineMs})`)
    } catch (err) {
      console.warn(`[CloseTask] close failed for ${vaultId}:`, err)
    }
  }

  if (closed > 0) console.log(`[CloseTask] Cycle complete — closed ${closed} vault(s).`)
  return closed
}

let closeInterval: NodeJS.Timeout | null = null

/** No-op unless `CLOSE_TASK_ENABLED=true`. Returns a stop function. */
export function startCloseTask(
  suiClient: SuiClient,
  sponsorSigner: SponsorSigner,
  packageId: string
): () => void {
  if (process.env.CLOSE_TASK_ENABLED !== 'true') {
    console.log('[CloseTask] Disabled (set CLOSE_TASK_ENABLED=true to enable).')
    return () => {}
  }

  const intervalMs = process.env.CLOSE_SCAN_INTERVAL_MS
    ? parseInt(process.env.CLOSE_SCAN_INTERVAL_MS, 10)
    : 43200000
  const maxPerCycle = process.env.CLOSE_MAX_PER_CYCLE
    ? parseInt(process.env.CLOSE_MAX_PER_CYCLE, 10)
    : 10

  if (closeInterval) clearInterval(closeInterval)

  const run = () => {
    checkAndClose({ suiClient, sponsorSigner, packageId, maxPerCycle }).catch((err) =>
      console.error('[CloseTask] Error in background task:', err)
    )
  }

  const startupTimeout = setTimeout(run, 15_000)
  closeInterval = setInterval(run, intervalMs)
  console.log(`[CloseTask] Started — scanning every ${intervalMs}ms.`)

  return () => {
    clearTimeout(startupTimeout)
    if (closeInterval) {
      clearInterval(closeInterval)
      closeInterval = null
    }
  }
}
