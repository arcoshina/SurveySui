import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import { bcs } from '@mysten/sui/bcs'

export interface ClaimPtbParams {
  packageId: string
  vaultId: string
  surveyId: string
  passId: string
  encryptedAnswers?: string // optional hex string
  answerBlobId?: string // optional pointer string
}

export interface SponsoredTxResult {
  sponsoredTxBytes: string // base64
  sponsorSignature: string
}

function hexToBytes(hex: string): number[] {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes: number[] = []
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.slice(i, i + 2), 16))
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Build the claim PTB for survey vault.
 */
export function buildClaimPtb(params: ClaimPtbParams): Transaction {
  const tx = new Transaction()

  const encryptedAnswersOpt = params.encryptedAnswers
    ? hexToBytes(params.encryptedAnswers)
    : null
  const answerBlobIdOpt = params.answerBlobId
    ? Array.from(new TextEncoder().encode(params.answerBlobId))
    : null

  const encryptedAnswersArg = tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(encryptedAnswersOpt).toBytes())
  const answerBlobIdArg = tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(answerBlobIdOpt).toBytes())

  tx.moveCall({
    target: `${params.packageId}::survey_vault::claim`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.surveyId),
      tx.object(params.passId),
      encryptedAnswersArg,
      answerBlobIdArg,
      tx.object('0x6'), // clock
    ],
  })

  return tx
}

/**
 * Dry run and request sponsorship from backend proxy endpoint.
 * Throws DRY_RUN_REJECTED if dry run fails.
 */
export async function dryRunAndSponsorTx(params: {
  tx: Transaction
  senderAddress: string
  client: SuiClient
  backendUrl?: string
}): Promise<SponsoredTxResult> {
  const { tx, senderAddress, client, backendUrl = '' } = params

  tx.setSender(senderAddress)

  // Build only the transaction kind so that the backend can attach its own gas payment
  const txBytes = await tx.build({ client, onlyTransactionKind: true })
  const txBase64 = bytesToBase64(txBytes)

  const res = await fetch(`${backendUrl}/api/gas/sponsor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txBytes: txBase64,
      senderAddress,
    }),
  })

  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ error: 'unknown', message: 'Sponsorship request failed' }))
    const msg = err.message || err.error || `Sponsorship failed with status ${res.status}`
    // Treat any 422 or server-reported dry-run/move-abort failure as a
    // pre-flight rejection — the user has not paid gas in this branch.
    if (res.status === 422 || /dry\s*run|MoveAbort/i.test(msg)) {
      throw new Error(`DRY_RUN_REJECTED: ${msg}`)
    }
    throw new Error(msg)
  }

  const result = (await res.json()) as SponsoredTxResult
  return result
}

export type SignAndExecuteFn = (tx: Transaction) => Promise<{ digest: string }>

export type FallbackResult =
  | { mode: 'sponsored'; sponsoredTxBytes: string; sponsorSignature: string }
  | { mode: 'self_paid'; digest: string }

export interface GasHealth {
  available: boolean
  reason?: 'no_key' | 'low_balance' | 'unknown' | 'bff_down'
  sponsorAddress?: string
  gasCompensationAmount?: string
}

/**
 * Probe whether the BFF gas sponsor is available.
 * Resolves with `available: false` on any network/server failure (never throws).
 */
export async function probeGasSponsorHealth(params: {
  backendUrl?: string
  timeoutMs?: number
} = {}): Promise<GasHealth> {
  const { backendUrl = '', timeoutMs = 3000 } = params
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${backendUrl}/api/gas/health`, { signal: controller.signal })
    if (!res.ok) return { available: false, reason: 'bff_down' }
    const data = (await res.json()) as GasHealth
    return data
  } catch {
    return { available: false, reason: 'bff_down' }
  } finally {
    clearTimeout(timer)
  }
}

export const USER_DECLINED_SELF_PAID = 'USER_DECLINED_SELF_PAID'

/**
 * Try BFF-sponsored path; fall back to self-paid gas when BFF is unreachable.
 * Throws without fallback when the dry-run is rejected by the contract (DRY_RUN_REJECTED).
 *
 * When fallback is about to switch to self-paid, `onSelfPaidFallback` (if provided)
 * is consulted with the estimated gas cost in MIST. Returning false aborts with
 * USER_DECLINED_SELF_PAID so the UI can recover gracefully.
 */
export async function executeTxWithFallback(params: {
  tx: Transaction
  senderAddress: string
  client: SuiClient
  backendUrl?: string
  signAndExecute: SignAndExecuteFn
  onSelfPaidFallback?: (gasEstimateMist: bigint, bffError?: Error) => Promise<boolean>
}): Promise<FallbackResult> {
  const { tx, senderAddress, client, backendUrl = '', signAndExecute, onSelfPaidFallback } = params

  let bffError: Error | undefined = undefined

  // Path 1: Try BFF-sponsored
  try {
    const { sponsoredTxBytes, sponsorSignature } = await dryRunAndSponsorTx({
      tx,
      senderAddress,
      client,
      backendUrl,
    })
    return { mode: 'sponsored', sponsoredTxBytes, sponsorSignature }
  } catch (err: any) {
    if (err.message?.startsWith('DRY_RUN_REJECTED')) {
      throw err // Contract rejected — do NOT fallback to self-paid
    }
    bffError = err
    // Any other error (network, 5xx, limit reached) → BFF fallback, attempt client dry-run
  }

  // Path 2: Client-side dry-run to validate before asking user to pay gas
  tx.setSender(senderAddress)
  const dryRunBytes = await tx.build({ client })
  const dryRunResult = await client.dryRunTransactionBlock({
    transactionBlock: bytesToBase64(dryRunBytes),
  })
  if (dryRunResult.effects.status.status === 'failure') {
    throw new Error(dryRunResult.effects.status.error ?? 'Transaction pre-flight failed')
  }

  // Telemetry: emit warning + DOM event for observability
  const reason = bffError?.message === 'PLATFORM_SPONSOR_LIMIT_REACHED' ? 'limit_reached' : 'bff_unreachable'
  console.warn(`[gas-fallback] BFF sponsorship failed (${reason}), switching to self-paid gas mode`)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gas-fallback', { detail: { reason } }))
  }

  // Ask the UI for explicit user consent before charging gas
  if (onSelfPaidFallback) {
    const gasUsed = dryRunResult.effects.gasUsed
    const estimate =
      BigInt(gasUsed.computationCost) +
      BigInt(gasUsed.storageCost) -
      BigInt(gasUsed.storageRebate)
    const approved = await onSelfPaidFallback(estimate > 0n ? estimate : 0n, bffError)
    if (!approved) {
      throw new Error(USER_DECLINED_SELF_PAID)
    }
  }

  // Execute with self-paid gas via wallet
  const { digest } = await signAndExecute(tx)
  return { mode: 'self_paid', digest }
}

/**
 * Broadcast double-signed sponsored transaction to Sui.
 */
export async function executeSponsoredTx(params: {
  client: SuiClient
  sponsoredTxBytes: string
  userSignature: string
  sponsorSignature: string
}): Promise<any> {
  const { client, sponsoredTxBytes, userSignature, sponsorSignature } = params

  const result = await client.executeTransactionBlock({
    transactionBlock: sponsoredTxBytes,
    signature: [userSignature, sponsorSignature],
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  })

  return result
}

export interface ClaimWithTicketParams {
  packageId: string
  vaultId: string
  issuerConfigId: string
  ticketSig: string
  ephemeralNullifier: string
  expiresAt: string
  encryptedAnswers?: string
  answerBlobId?: string
}

export function buildClaimWithTicketPtb(params: ClaimWithTicketParams): Transaction {
  const tx = new Transaction()

  const encryptedAnswersOpt = params.encryptedAnswers
    ? hexToBytes(params.encryptedAnswers)
    : null
  const answerBlobIdOpt = params.answerBlobId
    ? Array.from(new TextEncoder().encode(params.answerBlobId))
    : null

  const encryptedAnswersArg = tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(encryptedAnswersOpt).toBytes())
  const answerBlobIdArg = tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(answerBlobIdOpt).toBytes())

  const ticketSigBytes = hexToBytes(params.ticketSig)
  const ephemeralNullifierBytes = hexToBytes(params.ephemeralNullifier)

  tx.moveCall({
    target: `${params.packageId}::survey_vault::claim_with_ticket`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.issuerConfigId),
      tx.pure(bcs.vector(bcs.u8()).serialize(ticketSigBytes).toBytes()),
      tx.pure(bcs.vector(bcs.u8()).serialize(ephemeralNullifierBytes).toBytes()),
      tx.pure(bcs.u64().serialize(params.expiresAt).toBytes()),
      encryptedAnswersArg,
      answerBlobIdArg,
      tx.object('0x6'), // clock
    ],
  })

  return tx
}

export interface ClaimWithNftMarkingParams {
  packageId: string
  vaultId: string
  nftId: string
  nftType: string
  encryptedAnswers?: string
  answerBlobId?: string
}

export function buildClaimWithNftMarkingPtb(params: ClaimWithNftMarkingParams): Transaction {
  const tx = new Transaction()

  const encryptedAnswersOpt = params.encryptedAnswers
    ? hexToBytes(params.encryptedAnswers)
    : null
  const answerBlobIdOpt = params.answerBlobId
    ? Array.from(new TextEncoder().encode(params.answerBlobId))
    : null

  const encryptedAnswersArg = tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(encryptedAnswersOpt).toBytes())
  const answerBlobIdArg = tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(answerBlobIdOpt).toBytes())

  tx.moveCall({
    target: `${params.packageId}::survey_vault::claim_with_nft_marking`,
    typeArguments: [params.nftType],
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.nftId),
      encryptedAnswersArg,
      answerBlobIdArg,
      tx.object('0x6'), // clock
    ],
  })

  return tx
}
