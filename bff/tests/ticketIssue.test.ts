import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { issueRealTimeTicket, RealTimeTicketPayload } from '../src/auth/ticket_issue.js'

const VAULT = '0x0000000000000000000000000000000000000000000000000000000000000008'
const SURVEY = '0x0000000000000000000000000000000000000000000000000000000000000009'
const CLAIMANT = '0x0000000000000000000000000000000000000000000000000000000000000003'

describe('Real-time ticket claimant binding (F2/F32)', () => {
  const priv = '0101010101010101010101010101010101010101010101010101010101010101'
  let keypair: Ed25519Keypair

  beforeEach(() => {
    process.env.SURVEY_PASS_ISSUER_PRIV = priv
    keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(Buffer.from(priv, 'hex')).slice(0, 32))
  })

  afterEach(() => {
    delete process.env.SURVEY_PASS_ISSUER_PRIV
  })

  it('signs ticket payload that includes claimant address', async () => {
    const nullifier = new Uint8Array(32)
    nullifier[0] = 1
    const expiresAt = Date.now() + 300_000

    const ticket = await issueRealTimeTicket(VAULT, SURVEY, CLAIMANT, nullifier, expiresAt)
    const payloadBytes = RealTimeTicketPayload.serialize({
      vault_id: VAULT,
      survey_id: SURVEY,
      claimant: CLAIMANT,
      ephemeral_nullifier: Array.from(nullifier),
      expires_at: BigInt(expiresAt).toString(),
    }).toBytes()

    const sigBytes = Buffer.from(ticket.ticket_sig, 'hex')
    const ok = await keypair.getPublicKey().verify(payloadBytes, sigBytes)
    expect(ok).toBe(true)

    const wrongClaimantPayload = RealTimeTicketPayload.serialize({
      vault_id: VAULT,
      survey_id: SURVEY,
      claimant: '0x0000000000000000000000000000000000000000000000000000000000000001',
      ephemeral_nullifier: Array.from(nullifier),
      expires_at: BigInt(expiresAt).toString(),
    }).toBytes()
    const bad = await keypair.getPublicKey().verify(wrongClaimantPayload, sigBytes)
    expect(bad).toBe(false)
  })
})
