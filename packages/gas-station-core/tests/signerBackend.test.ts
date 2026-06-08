import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import {
  createMultisigSponsorSigner,
  createSponsorSignerFromEnv,
  Ed25519SignerBackend,
  keypairFromHex,
} from '../src/signerBackend.js'

const PRIV1 = '0101010101010101010101010101010101010101010101010101010101010101'
const PRIV2 = '0202020202020202020202020202020202020202020202020202020202020202'
const PRIV3 = '0303030303030303030303030303030303030303030303030303030303030303'

describe('createMultisigSponsorSigner', () => {
  it('derives a stable 2-of-3 sponsor address from K1+K2+K3 pubkey', () => {
    const kp3 = keypairFromHex(PRIV3)
    const coldPub = Buffer.from(kp3.getPublicKey().toRawBytes()).toString('hex')

    const signer = createMultisigSponsorSigner(PRIV1, PRIV2, coldPub, 2)
    const again = createMultisigSponsorSigner(PRIV1, PRIV2, coldPub, 2)

    expect(signer.getSponsorAddress()).toBe(again.getSponsorAddress())
    expect(signer.getSponsorAddress()).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('signs arbitrary transaction bytes with K1+K2 only', async () => {
    const kp3 = keypairFromHex(PRIV3)
    const coldPub = Buffer.from(kp3.getPublicKey().toRawBytes()).toString('hex')
    const signer = createMultisigSponsorSigner(PRIV1, PRIV2, coldPub, 2)

    const { signature } = await signer.signTransaction(new Uint8Array([1, 2, 3, 4]))
    expect(signature).toBeTruthy()
    expect(signature.length).toBeGreaterThan(10)
  })
})

describe('createSponsorSignerFromEnv', () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...origEnv }
    vi.restoreAllMocks()
  })

  it('loads multisig when GAS_SPONSOR_PRIV_1/2 and PUBKEY_3 are set', () => {
    const kp3 = keypairFromHex(PRIV3)
    const coldPub = Buffer.from(kp3.getPublicKey().toRawBytes()).toString('hex')

    const signer = createSponsorSignerFromEnv({
      GAS_SPONSOR_PRIV_1: PRIV1,
      GAS_SPONSOR_PRIV_2: PRIV2,
      GAS_SPONSOR_PUBKEY_3: coldPub,
      GAS_SPONSOR_MULTISIG_THRESHOLD: '2',
    })

    expect(signer).not.toBeNull()
    expect(signer!.getSponsorAddress()).toMatch(/^0x/)
  })

  it('validates GAS_SPONSOR_ADDRESS when provided', () => {
    const kp3 = keypairFromHex(PRIV3)
    const coldPub = Buffer.from(kp3.getPublicKey().toRawBytes()).toString('hex')
    const expected = createMultisigSponsorSigner(PRIV1, PRIV2, coldPub, 2).getSponsorAddress()

    expect(() =>
      createSponsorSignerFromEnv({
        GAS_SPONSOR_PRIV_1: PRIV1,
        GAS_SPONSOR_PRIV_2: PRIV2,
        GAS_SPONSOR_PUBKEY_3: coldPub,
        GAS_SPONSOR_ADDRESS: expected,
      })
    ).not.toThrow()

    expect(() =>
      createSponsorSignerFromEnv({
        GAS_SPONSOR_PRIV_1: PRIV1,
        GAS_SPONSOR_PRIV_2: PRIV2,
        GAS_SPONSOR_PUBKEY_3: coldPub,
        GAS_SPONSOR_ADDRESS: '0x' + 'ab'.repeat(32),
      })
    ).toThrow(/GAS_SPONSOR_ADDRESS mismatch/)
  })

  it('falls back to SURVEY_PASS_ISSUER_PRIV in non-production', () => {
    const signer = createSponsorSignerFromEnv({
      NODE_ENV: 'development',
      SURVEY_PASS_ISSUER_PRIV: PRIV1,
    })
    expect(signer).toBeInstanceOf(Ed25519SignerBackend)
    expect(signer!.getSponsorAddress()).toBe(keypairFromHex(PRIV1).getPublicKey().toSuiAddress())
    expect(console.warn).toHaveBeenCalled()
  })

  it('rejects issuer-only fallback in production', () => {
    expect(() =>
      createSponsorSignerFromEnv({
        NODE_ENV: 'production',
        SURVEY_PASS_ISSUER_PRIV: PRIV1,
      })
    ).toThrow(/Production requires/)
  })
})
