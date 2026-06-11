import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import { bcs } from '@mysten/sui/bcs'

export interface ClaimPtbParams {
  packageId: string
  vaultId: string
  surveyId: string
  /** When set, Step 1 validates SurveyPass credentials. */
  passId?: string
  issuerConfigId: string
  /** When set with nftType, Step 1 validates NFT ownership/type. */
  nftId?: string
  nftType?: string
  /** 0 = pass audience (production default); 1 = one-time ticket (BFF issue, not wired in UI yet). */
  authKind?: number
  attributeNullifiers?: string[]
  ticketSig?: string
  ephemeralNullifier?: string
  expiresAt?: string
  encryptedAnswers?: string // optional hex string
  answerBlobId?: string // optional pointer string
  /** Shared sentinel from package publish; required when passId is omitted. */
  claimPassSentinelId?: string
  /** Shared VoidNft from package publish; required when nftId is omitted. */
  voidNftId?: string
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

function voidNftType(packageId: string): string {
  return `${packageId}::claim_sentinel::VoidNft`
}

/**
 * Build the unified claim PTB for survey vault (ADR Step 0–3).
 */
export function buildClaimPtb(params: ClaimPtbParams): Transaction {
  const tx = new Transaction()

  const usePass = !!params.passId
  const useNft = !!(params.nftId && params.nftType)

  if (!usePass && !useNft) {
    throw new Error('Claim requires SurveyPass or NFT eligibility')
  }

  const passSentinel =
    params.claimPassSentinelId ?? import.meta.env.VITE_CLAIM_PASS_SENTINEL_ID ?? ''
  const voidNftObject =
    params.voidNftId ?? import.meta.env.VITE_VOID_NFT_ID ?? ''

  const passObjectId = params.passId ?? passSentinel
  const nftObjectId = params.nftId ?? voidNftObject
  const nftType = params.nftType ?? voidNftType(params.packageId)

  if (!usePass && !passObjectId) {
    throw new Error('VITE_CLAIM_PASS_SENTINEL_ID required for NFT-only claim')
  }
  if (!useNft && !nftObjectId) {
    throw new Error('VITE_VOID_NFT_ID required for Pass-only claim')
  }

  const encryptedAnswersOpt = params.encryptedAnswers
    ? hexToBytes(params.encryptedAnswers)
    : null
  const answerBlobIdOpt = params.answerBlobId
    ? Array.from(new TextEncoder().encode(params.answerBlobId))
    : null

  const encryptedAnswersArg = tx.pure(
    bcs.option(bcs.vector(bcs.u8())).serialize(encryptedAnswersOpt).toBytes()
  )
  const answerBlobIdArg = tx.pure(
    bcs.option(bcs.vector(bcs.u8())).serialize(answerBlobIdOpt).toBytes()
  )

  const authKind = params.authKind ?? 0
  const attributeNullifiers =
    params.attributeNullifiers?.map((n) => Array.from(new TextEncoder().encode(n))) ?? []
  const ticketSigBytes = params.ticketSig ? hexToBytes(params.ticketSig) : []
  const ephemeralNullifierBytes = params.ephemeralNullifier
    ? hexToBytes(params.ephemeralNullifier)
    : []

  tx.moveCall({
    target: `${params.packageId}::survey_vault::claim`,
    typeArguments: [nftType],
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.surveyId),
      tx.pure.u8(authKind),
      tx.pure.bool(usePass),
      tx.object(passObjectId),
      tx.pure.bool(useNft),
      tx.object(nftObjectId),
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(attributeNullifiers).toBytes()),
      tx.object(params.issuerConfigId),
      tx.pure(bcs.vector(bcs.u8()).serialize(ticketSigBytes).toBytes()),
      tx.pure(bcs.vector(bcs.u8()).serialize(ephemeralNullifierBytes).toBytes()),
      tx.pure.u64(params.expiresAt ?? '0'),
      encryptedAnswersArg,
      answerBlobIdArg,
      tx.object('0x6'), // clock
    ],
  })

  return tx
}

export type FinalizedPassTicket = {
  source: number
  nullifiers: string[]
  expires_at: string
  bff_sig: string
  escape_clawback_mist: string
}

export async function finalizeSponsoredPassTx(params: {
  tx: Transaction
  senderAddress: string
  client: SuiClient
  backendUrl?: string
}): Promise<FinalizedPassTicket[]> {
  const { tx, senderAddress, client, backendUrl = '' } = params
  tx.setSender(senderAddress)
  const txBytes = await tx.build({ client, onlyTransactionKind: true })
  const res = await fetch(`${backendUrl}/api/pass/finalize-sponsored-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txBytes: bytesToBase64(txBytes),
      senderAddress,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Finalize sponsored ticket failed' }))
    throw new Error(err.message || `Finalize failed with status ${res.status}`)
  }
  const data = (await res.json()) as { tickets: FinalizedPassTicket[] }
  return data.tickets
}

/**
 * Dry run and request sponsorship from backend proxy endpoint.
 * Throws DRY_RUN_REJECTED if dry run fails.
 * No wallet popup here — consent is the transaction signature, verified at /api/gas/execute.
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
    const errCode = typeof err.error === 'string' ? err.error : ''
    const msg = err.message || errCode || `Sponsorship failed with status ${res.status}`
    if (errCode === 'gas_exceeds_compensation') {
      throw new Error(`gas_exceeds_compensation: ${msg}`)
    }
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
// 代付暫時不可用（coin 不足/限流/額度/網路）且呼叫端禁止自付回退時拋出。
// 用於代付鑄造 Pass：避免把 deposit_payer=sponsor 的交易自付送出而造成雙重收費。
export const SPONSOR_TEMPORARILY_UNAVAILABLE = 'SPONSOR_TEMPORARILY_UNAVAILABLE'

export async function executeTxWithFallback(params: {
  tx: Transaction
  senderAddress: string
  client: SuiClient
  backendUrl?: string
  signAndExecute: SignAndExecuteFn
  onSelfPaidFallback?: (gasEstimateMist: bigint, bffError?: Error) => Promise<boolean>
  // 預設 true（claim 與「一開始就自付」的 deposit_payer=owner 路徑）。代付鑄造 Pass
  // （deposit_payer=sponsor）須傳 false：代付失敗不可自付，否則 deposit_payer 與實付方不符。
  allowSelfPaidFallback?: boolean
}): Promise<FallbackResult> {
  const {
    tx,
    senderAddress,
    client,
    backendUrl = '',
    signAndExecute,
    onSelfPaidFallback,
    allowSelfPaidFallback = true,
  } = params

  let bffError: Error | undefined = undefined

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
      throw err
    }
    bffError = err
  }

  if (!allowSelfPaidFallback) {
    throw new Error(SPONSOR_TEMPORARILY_UNAVAILABLE)
  }

  tx.setSender(senderAddress)
  const dryRunBytes = await tx.build({ client })
  const dryRunResult = await client.dryRunTransactionBlock({
    transactionBlock: bytesToBase64(dryRunBytes),
  })
  if (dryRunResult.effects.status.status === 'failure') {
    throw new Error(dryRunResult.effects.status.error ?? 'Transaction pre-flight failed')
  }

  const reason = bffError?.message === 'PLATFORM_SPONSOR_LIMIT_REACHED' ? 'limit_reached' : 'bff_unreachable'
  console.warn(`[gas-fallback] BFF sponsorship failed (${reason}), switching to self-paid gas mode`)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gas-fallback', { detail: { reason } }))
  }

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

  const { digest } = await signAndExecute(tx)
  return { mode: 'self_paid', digest }
}

/**
 * Broadcast a sponsored transaction through the backend's /api/gas/execute.
 * The backend verifies the user signature (= consent) and atomically reserves
 * the lifetime/daily quota before broadcasting, so the quota is only ever
 * consumed for a transaction the user actually signed.
 */
export async function executeSponsoredTx(params: {
  sponsoredTxBytes: string
  userSignature: string
  sponsorSignature: string
  backendUrl?: string
}): Promise<{ digest: string }> {
  const { sponsoredTxBytes, userSignature, sponsorSignature, backendUrl = '' } = params

  const res = await fetch(`${backendUrl}/api/gas/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sponsoredTxBytes, userSignature, sponsorSignature }),
  })
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ error: 'unknown', message: 'Sponsored execution failed' }))
    const errCode = typeof err.error === 'string' ? err.error : ''
    const msg = err.message || errCode || `Execute failed with status ${res.status}`
    if (errCode === 'PLATFORM_SPONSOR_LIMIT_REACHED') {
      throw new Error('PLATFORM_SPONSOR_LIMIT_REACHED')
    }
    throw new Error(msg)
  }
  return (await res.json()) as { digest: string }
}

export interface ClaimWithTicketParams {
  packageId: string
  vaultId: string
  surveyId: string
  passId: string
  issuerConfigId: string
  ticketSig: string
  ephemeralNullifier: string
  expiresAt: string
  encryptedAnswers?: string
  answerBlobId?: string
}

/** @deprecated Use buildClaimPtb with authKind=1 */
export function buildClaimWithTicketPtb(params: ClaimWithTicketParams): Transaction {
  return buildClaimPtb({
    ...params,
    authKind: 1,
  })
}

export interface ClaimWithNftMarkingParams {
  packageId: string
  vaultId: string
  surveyId: string
  nftId: string
  nftType: string
  issuerConfigId: string
  encryptedAnswers?: string
  answerBlobId?: string
  claimPassSentinelId?: string
}

/** @deprecated Use buildClaimPtb with nftId/nftType (unified claim). */
export function buildClaimWithNftMarkingPtb(params: ClaimWithNftMarkingParams): Transaction {
  return buildClaimPtb({
    packageId: params.packageId,
    vaultId: params.vaultId,
    surveyId: params.surveyId,
    nftId: params.nftId,
    nftType: params.nftType,
    issuerConfigId: params.issuerConfigId,
    encryptedAnswers: params.encryptedAnswers,
    answerBlobId: params.answerBlobId,
    claimPassSentinelId: params.claimPassSentinelId,
  })
}
