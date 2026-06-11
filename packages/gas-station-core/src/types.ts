import type { SuiClient } from '@mysten/sui/client'

export interface AcquiredGasCoin {
  coinObjectId: string
  version: string
  digest: string
  balance: bigint
}

export interface CoinLockStore {
  acquire(suiClient: SuiClient, owner: string, minBalanceMist: bigint): Promise<AcquiredGasCoin>
  release(coinObjectId: string): void
  /** Drop cached coin metadata and release any lock (e.g. after dry-run failure). */
  invalidateCoin(coinObjectId: string): void
  getLockedCoinIds(now?: number): Set<string>
  isLocked(coinObjectId: string, now?: number): boolean
}

export interface SponsorPipelineContext {
  isPassSponsor: boolean
  isPlatformSponsor: boolean
  claimGasCompensationAmount: string | null
  claimStorageCompensationAmount: string | null
  claimHasBlob: boolean
}

export interface SponsorPipelineResult {
  sponsoredTxBytes: string
  sponsorSignature: string
}

export interface SponsorPipelineSuccess {
  ok: true
  result: SponsorPipelineResult
  metrics: SponsorPipelineMetrics
}

export interface SponsorPipelineFailure {
  ok: false
  status: number
  error: string
  message: string
  metrics: SponsorPipelineMetrics
}

export type SponsorPipelineOutcome = SponsorPipelineSuccess | SponsorPipelineFailure

export interface SponsorPipelineMetrics {
  queueWaitMs: number
  dryRunMs: number
  coinObjectId?: string
  outcome:
    | 'success'
    | 'dry_run_failed'
    | 'gas_exceeds_compensation'
    | 'sponsor_coin_unavailable'
    | 'escape_clawback_rejected'
    | 'error'
}

export interface GasStationHealth {
  available: boolean
  sponsorAddress?: string
  unlockedCoinCount?: number
  lockedCoinCount?: number
  queueDepth?: number
  reason?: string
}
