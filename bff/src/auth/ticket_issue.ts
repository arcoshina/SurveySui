// 即時票券簽章原語（一次性票券 / 匿名投票預留機制）。
// 目前 fail-closed：/api/ticket/issue 未在 app.ts 掛載，此函式不會被生產路徑呼叫；保留供未來方案使用。
import { bcs } from '@mysten/sui/bcs'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
export const RealTimeTicketPayload = bcs.struct('RealTimeTicketPayload', {
  vault_id: bcs.Address,
  survey_id: bcs.Address,
  claimant: bcs.Address,
  ephemeral_nullifier: bcs.vector(bcs.u8()),
  expires_at: bcs.u64(),
})
export async function issueRealTimeTicket(
  vaultId: string,
  surveyId: string,
  claimant: string,
  ephemeralNullifier: Uint8Array,
  expiresAtMs: number
): Promise<{ ticket_sig: string; ephemeral_nullifier: string; expires_at: string }> {
  const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
  if (!privKeyHex) {
    throw new Error('SURVEY_PASS_ISSUER_PRIV is not set')
  }
  const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
  const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
  const keypairBytes = privateKeyBytes.slice(0, 32)
  const keypair = Ed25519Keypair.fromSecretKey(keypairBytes)
  const expires_at = BigInt(expiresAtMs).toString()
  const payloadBytes = RealTimeTicketPayload.serialize({
    vault_id: vaultId,
    survey_id: surveyId,
    claimant,
    ephemeral_nullifier: Array.from(ephemeralNullifier),
    expires_at,
  }).toBytes()
  const signatureBytes = await keypair.sign(payloadBytes)
  return {
    ticket_sig: Buffer.from(signatureBytes).toString('hex'),
    ephemeral_nullifier: Buffer.from(ephemeralNullifier).toString('hex'),
    expires_at,
  }
}
