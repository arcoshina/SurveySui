import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'

export interface ClaimPtbParams {
  packageId: string
  vaultId: string
  passId: string
  subHash: string // hex string
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
  
  const subHashBytes = hexToBytes(params.subHash)
  const encryptedAnswersBytes = hexToBytes(params.encryptedAnswers)

  tx.moveCall({
    target: `${params.packageId}::survey_vault::claim`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.passId),
      tx.pure.vector('u8', subHashBytes),
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
    if (res.status === 422) {
      throw new Error(`DRY_RUN_REJECTED: ${err.message || 'Simulation aborted'}`)
    }
    throw new Error(err.message || `Sponsorship failed with status ${res.status}`)
  }

  const result = await res.json() as SponsoredTxResult
  return result
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
