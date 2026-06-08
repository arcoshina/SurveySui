import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import type { SponsorSigner } from '@surveysui/gas-station-core'
import {
  applyCreatorRebateShare,
  computeRebateSurplus,
  netGasFromEffects,
  parseEnvBigInt,
  resolveGasBudget,
} from '../gas/gasMath.js'
import {
  buildPurgePtb,
  DEFAULT_GAS_BUDGET_CAP_MIST,
  normalizeAddress,
  prepareGasPayment,
  type BuildPurgePtbParams,
} from './buildPurgePtb.js'

const DEFAULT_REBATE_BUFFER_MIST = 2_000_000n
const DEFAULT_REBATE_MIN_TRANSFER_MIST = 1_000_000n
const DEFAULT_CREATOR_SHARE_BPS = 5000

export interface PurgeWithRebateResult {
  tx: Transaction
  gasBudget: bigint
  transferAmount: bigint
  platformFee: bigint
  creator: string
}

export interface PurgePtbIds {
  packageId: string
  registryId: string
  surveyId: string
  vaultId: string
}

export function isRebateRefundEnabled(): boolean {
  const raw = process.env.PURGE_REBATE_REFUND_ENABLED
  if (raw === undefined) return true
  return raw.toLowerCase() === 'true' || raw === '1'
}

export function resolveRebateBufferMist(): bigint {
  return parseEnvBigInt('PURGE_REBATE_BUFFER_MIST', DEFAULT_REBATE_BUFFER_MIST)
}

export function resolveRebateMinTransferMist(): bigint {
  return parseEnvBigInt('PURGE_REBATE_MIN_TRANSFER_MIST', DEFAULT_REBATE_MIN_TRANSFER_MIST)
}

export function resolvePurgeGasBudgetCapMist(): bigint {
  return parseEnvBigInt('PURGE_GAS_BUDGET_CAP_MIST', DEFAULT_GAS_BUDGET_CAP_MIST)
}

export function resolveCreatorShareBps(): number {
  const raw = process.env.PURGE_REBATE_CREATOR_SHARE_BPS
  if (!raw) return DEFAULT_CREATOR_SHARE_BPS
  const cleaned = raw.replace(/_/g, '').replace(/,/g, '').trim()
  const n = Number.parseInt(cleaned, 10)
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return DEFAULT_CREATOR_SHARE_BPS
  return n
}

export interface RebateTransferDecision {
  shouldTransfer: boolean
  transferAmount: bigint
  grossSurplus: bigint
  platformFee: bigint
  creator: string
}

function noTransfer(creator = ''): RebateTransferDecision {
  return {
    shouldTransfer: false,
    transferAmount: 0n,
    grossSurplus: 0n,
    platformFee: 0n,
    creator,
  }
}

/** Pure policy: whether to attach a rebate transfer and for how much. */
export function resolveRebateTransferDecision(params: {
  refundEnabled: boolean
  creator: string | null
  sponsorAddress: string
  estimateNetGas: bigint
  buffer: bigint
  minTransfer: bigint
  creatorShareBps?: number
}): RebateTransferDecision {
  const {
    refundEnabled,
    creator,
    sponsorAddress,
    estimateNetGas,
    buffer,
    minTransfer,
    creatorShareBps = resolveCreatorShareBps(),
  } = params

  if (!refundEnabled || !creator) {
    return noTransfer()
  }

  const normalizedCreator = normalizeAddress(creator)
  if (normalizedCreator === normalizeAddress(sponsorAddress)) {
    return noTransfer(normalizedCreator)
  }

  const grossSurplus = computeRebateSurplus(estimateNetGas, buffer)
  if (grossSurplus < minTransfer) {
    return { ...noTransfer(normalizedCreator), grossSurplus }
  }

  const transferAmount = applyCreatorRebateShare(grossSurplus, creatorShareBps)
  if (transferAmount < minTransfer) {
    return { ...noTransfer(normalizedCreator), grossSurplus }
  }

  return {
    shouldTransfer: true,
    transferAmount,
    grossSurplus,
    platformFee: grossSurplus - transferAmount,
    creator: normalizedCreator,
  }
}

/** Read vault.creator from chain; null if vault missing or field absent. */
export async function readVaultCreator(
  suiClient: SuiClient,
  vaultId: string
): Promise<string | null> {
  try {
    const res = await suiClient.getObject({ id: vaultId, options: { showContent: true } })
    const content = res.data?.content as { dataType?: string; fields?: { creator?: string } } | undefined
    if (!content || content.dataType !== 'moveObject') return null
    const creator = content.fields?.creator
    return creator ? normalizeAddress(creator) : null
  } catch {
    return null
  }
}

async function simulatePurgePtb(
  suiClient: SuiClient,
  sponsorAddress: string,
  params: BuildPurgePtbParams,
  gasBudget: bigint
): Promise<{ ok: true; netGas: bigint } | { ok: false; error: string }> {
  const tx = buildPurgePtb(params)
  tx.setSender(sponsorAddress)
  tx.setGasBudget(Number(gasBudget))
  await prepareGasPayment(tx, suiClient, sponsorAddress, gasBudget)

  const bytes = await tx.build({ client: suiClient })
  const dryRun = await suiClient.dryRunTransactionBlock({
    transactionBlock: Buffer.from(bytes).toString('base64'),
  })

  if (dryRun.effects.status.status === 'failure') {
    return { ok: false, error: dryRun.effects.status.error ?? 'dry_run_failed' }
  }

  return { ok: true, netGas: netGasFromEffects(dryRun.effects.gasUsed) }
}

async function assembleExecutablePtb(
  suiClient: SuiClient,
  sponsorAddress: string,
  params: BuildPurgePtbParams,
  gasBudget: bigint
): Promise<Transaction> {
  const tx = buildPurgePtb(params)
  tx.setSender(sponsorAddress)
  tx.setGasBudget(Number(gasBudget))
  await prepareGasPayment(tx, suiClient, sponsorAddress, gasBudget)
  return tx
}

async function buildPurgeOnly(
  suiClient: SuiClient,
  sponsorAddress: string,
  base: BuildPurgePtbParams
): Promise<PurgeWithRebateResult> {
  const cap = resolvePurgeGasBudgetCapMist()
  const buffer = resolveRebateBufferMist()
  const dry = await simulatePurgePtb(suiClient, sponsorAddress, base, cap)
  if (!dry.ok) {
    throw new Error(`Purge dry run failed: ${dry.error}`)
  }
  const gasBudget = resolveGasBudget(dry.netGas, cap, buffer)
  const tx = await assembleExecutablePtb(suiClient, sponsorAddress, base, gasBudget)
  return {
    tx,
    gasBudget,
    transferAmount: 0n,
    platformFee: 0n,
    creator: '',
  }
}

async function buildPurgeWithTransfer(
  suiClient: SuiClient,
  sponsorAddress: string,
  base: BuildPurgePtbParams,
  transferAmount: bigint,
  platformFee: bigint,
  creator: string
): Promise<PurgeWithRebateResult> {
  const cap = resolvePurgeGasBudgetCapMist()
  const buffer = resolveRebateBufferMist()

  const withTransfer: BuildPurgePtbParams = {
    ...base,
    creator,
    transferAmount,
  }

  const estimate = await simulatePurgePtb(suiClient, sponsorAddress, withTransfer, cap)
  if (!estimate.ok) {
    throw new Error(`Purge with rebate dry run failed: ${estimate.error}`)
  }

  const gasBudget = resolveGasBudget(estimate.netGas, cap, buffer)
  const verify = await simulatePurgePtb(suiClient, sponsorAddress, withTransfer, gasBudget)
  if (!verify.ok) {
    throw new Error(`Purge rebate verify dry run failed: ${verify.error}`)
  }

  const tx = await assembleExecutablePtb(suiClient, sponsorAddress, withTransfer, gasBudget)
  return {
    tx,
    gasBudget,
    transferAmount,
    platformFee,
    creator,
  }
}

/**
 * Two-phase dry-run: estimate purge rebate surplus, then build a PTB that
 * transfers surplus (minus buffer) to vault.creator in the same transaction.
 * Falls back to purge-only when refund is disabled, ineligible, or simulation fails.
 */
export async function buildAndDryRunPurgeWithRebateRefund(
  suiClient: SuiClient,
  sponsorSigner: SponsorSigner,
  ids: PurgePtbIds,
  creatorFromVault: string | null
): Promise<PurgeWithRebateResult> {
  const sponsorAddress = sponsorSigner.getSponsorAddress()
  const base: BuildPurgePtbParams = { ...ids }

  const cap = resolvePurgeGasBudgetCapMist()
  const buffer = resolveRebateBufferMist()
  const minTransfer = resolveRebateMinTransferMist()

  const estimate = await simulatePurgePtb(suiClient, sponsorAddress, base, cap)
  if (!estimate.ok) {
    throw new Error(`Purge estimate dry run failed: ${estimate.error}`)
  }

  const decision = resolveRebateTransferDecision({
    refundEnabled: isRebateRefundEnabled(),
    creator: creatorFromVault,
    sponsorAddress,
    estimateNetGas: estimate.netGas,
    buffer,
    minTransfer,
  })

  if (!decision.shouldTransfer) {
    if (isRebateRefundEnabled() && !creatorFromVault) {
      console.warn(`[PurgeTask] Missing vault.creator for ${ids.vaultId} — purge without rebate refund`)
    }
    return buildPurgeOnly(suiClient, sponsorAddress, base)
  }

  try {
    return await buildPurgeWithTransfer(
      suiClient,
      sponsorAddress,
      base,
      decision.transferAmount,
      decision.platformFee,
      decision.creator
    )
  } catch (err) {
    console.warn(
      `[PurgeTask] Rebate refund PTB failed for ${ids.vaultId}, falling back to purge-only:`,
      err
    )
    return buildPurgeOnly(suiClient, sponsorAddress, base)
  }
}
