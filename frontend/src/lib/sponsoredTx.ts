import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'

export interface ClaimPtbParams {
  packageId: string
  vaultId: string
  passId: string
  encryptedAnswers: string // hex string
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
  
  const encryptedAnswersBytes = hexToBytes(params.encryptedAnswers)

  tx.moveCall({
    target: `${params.packageId}::survey_vault::claim`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.passId),
      tx.pure.vector('u8', encryptedAnswersBytes),
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
    const err = await res.json().catch(() => ({ error: 'unknown', message: 'Sponsorship request failed' }))
    const msg = err.message || `Sponsorship failed with status ${res.status}`
    // Treat any 422 or server-reported dry-run/move-abort failure as a
    // pre-flight rejection — the user has not paid gas in this branch.
    if (res.status === 422 || /dry\s*run|MoveAbort/i.test(msg)) {
      throw new Error(`DRY_RUN_REJECTED: ${msg}`)
    }
    throw new Error(msg)
  }

  const result = await res.json() as SponsoredTxResult
  return result
}

export type SignAndExecuteFn = (tx: Transaction) => Promise<{ digest: string }>

export type FallbackResult =
  | { mode: 'sponsored'; sponsoredTxBytes: string; sponsorSignature: string }
  | { mode: 'self_paid'; digest: string }

/**
 * Try BFF-sponsored path; fall back to self-paid gas when BFF is unreachable.
 * Throws without fallback when the dry-run is rejected by the contract (DRY_RUN_REJECTED).
 */
export async function executeTxWithFallback(params: {
  tx: Transaction
  senderAddress: string
  client: SuiClient
  backendUrl?: string
  signAndExecute: SignAndExecuteFn
}): Promise<FallbackResult> {
  const { tx, senderAddress, client, backendUrl = '', signAndExecute } = params

  // Path 1: Try BFF-sponsored
  try {
    const { sponsoredTxBytes, sponsorSignature } = await dryRunAndSponsorTx({
      tx, senderAddress, client, backendUrl,
    })
    return { mode: 'sponsored', sponsoredTxBytes, sponsorSignature }
  } catch (err: any) {
    if (err.message?.startsWith('DRY_RUN_REJECTED')) {
      throw err  // Contract rejected — do NOT fallback to self-paid
    }
    // Any other error (network, 5xx) → BFF unreachable, attempt client dry-run
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
  console.warn('[gas-fallback] BFF unreachable, switching to self-paid gas mode')
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gas-fallback', { detail: { reason: 'bff_unreachable' } }))
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
