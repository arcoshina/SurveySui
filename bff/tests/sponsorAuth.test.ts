import { describe, it, expect, beforeAll } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import {
  assertTxSenderMatches,
  senderFromTransactionData,
  gasOwnerFromTransactionData,
  verifyTxSignatureBy,
} from '../src/gas/sponsorAuth.js'

const PKG = '0x' + 'ab'.repeat(32)

// 構造一筆「已附 gas」的完整 TransactionData(沿用 /sponsor 輸出的形狀)。
async function buildSponsoredBytes(sender: string, sponsor: string): Promise<string> {
  const tx = new Transaction()
  tx.moveCall({ target: `${PKG}::survey_pass::mint_pass`, arguments: [tx.pure.u64(1)] })
  tx.setSender(sender)
  tx.setGasOwner(sponsor)
  tx.setGasPayment([
    { objectId: '0x' + 'cd'.repeat(32), version: '1', digest: '11111111111111111111111111111111' },
  ])
  tx.setGasBudget(1_000_000)
  tx.setGasPrice(1000n)
  // build 完全離線:已手動提供 sender/gasOwner/gasPayment/budget/price,且無未解析輸入。
  const bytes = await tx.build()
  return Buffer.from(bytes).toString('base64')
}

describe('sponsorAuth transaction-signature helpers', () => {
  const user = new Ed25519Keypair()
  const sponsor = new Ed25519Keypair()
  const stranger = new Ed25519Keypair()
  let sponsoredTxBytes: string

  beforeAll(async () => {
    sponsoredTxBytes = await buildSponsoredBytes(user.toSuiAddress(), sponsor.toSuiAddress())
  })

  it('extracts sender and gas owner from full TransactionData', () => {
    expect(senderFromTransactionData(sponsoredTxBytes)).toBe(user.toSuiAddress())
    expect(gasOwnerFromTransactionData(sponsoredTxBytes)).toBe(sponsor.toSuiAddress())
  })

  it('verifies a transaction signature bound to its signer', async () => {
    const { signature } = await user.signTransaction(
      new Uint8Array(Buffer.from(sponsoredTxBytes, 'base64'))
    )
    expect(await verifyTxSignatureBy(sponsoredTxBytes, signature, user.toSuiAddress())).toBe(true)
  })

  it('rejects a signature that does not match the claimed signer (forged consent)', async () => {
    const { signature } = await stranger.signTransaction(
      new Uint8Array(Buffer.from(sponsoredTxBytes, 'base64'))
    )
    // 攻擊者用自己的金鑰簽,卻聲稱是 user 的同意 → 必須被擋。
    expect(await verifyTxSignatureBy(sponsoredTxBytes, signature, user.toSuiAddress())).toBe(false)
  })

  it('rejects a malformed signature without throwing', async () => {
    expect(await verifyTxSignatureBy(sponsoredTxBytes, 'not-a-signature', user.toSuiAddress())).toBe(
      false
    )
  })

  it('assertTxSenderMatches throws on sender mismatch', async () => {
    const tx = new Transaction()
    tx.moveCall({ target: `${PKG}::survey_pass::mint_pass`, arguments: [tx.pure.u64(1)] })
    tx.setSender(user.toSuiAddress())
    const kind = Buffer.from(await tx.build({ onlyTransactionKind: true })).toString('base64')
    // kind-only bytes carry no sender → no-op (does not throw)
    expect(() => assertTxSenderMatches(kind, stranger.toSuiAddress())).not.toThrow()
  })
})
