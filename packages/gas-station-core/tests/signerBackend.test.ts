import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import {
  createMultisigSponsorSigner,
  createSponsorSignerFromEnv,
  keypairFromHex,
  parseStrictHex32,
  pubkeyBytesFromHex,
} from '../src/signerBackend.js'

const PRIV1 = '0101010101010101010101010101010101010101010101010101010101010101'
const PRIV2 = '0202020202020202020202020202020202020202020202020202020202020202'
const PRIV3 = '0303030303030303030303030303030303030303030303030303030303030303'

describe('parseStrictHex32 / keypairFromHex / pubkeyBytesFromHex', () => {
  it('accepts valid 64-char hex with or without 0x prefix', () => {
    const withPrefix = parseStrictHex32('test', `0x${PRIV1}`)
    const without = parseStrictHex32('test', PRIV1)
    expect(withPrefix).toEqual(without)
    expect(withPrefix.byteLength).toBe(32)
    expect(keypairFromHex(PRIV1).getPublicKey().toRawBytes().byteLength).toBe(32)
  })

  it('rejects odd-length hex (F22: silent nibble drop)', () => {
    expect(() => pubkeyBytesFromHex(PRIV1 + 'a')).toThrow(/even length/)
  })

  it('rejects non-hex characters (F22: silent decode stop)', () => {
    const kp3 = keypairFromHex(PRIV3)
    const coldPub = Buffer.from(kp3.getPublicKey().toRawBytes()).toString('hex')
    expect(() => pubkeyBytesFromHex(coldPub.slice(0, 10) + 'zz' + coldPub.slice(12))).toThrow(
      /only hex characters/
    )
  })

  it('rejects decoded length other than 32 bytes', () => {
    expect(() => parseStrictHex32('test', 'aa'.repeat(31))).toThrow(/expected 32 bytes/)
    expect(() => parseStrictHex32('test', 'aa'.repeat(33))).toThrow(/expected 32 bytes/)
  })

  it('rejects 33-byte raw hex private key without silent slice (F23)', () => {
    const schemePlusSecret = '00' + PRIV1
    expect(() => keypairFromHex(schemePlusSecret)).toThrow(/expected 32 bytes/)
  })

  it('rejects suiprivkey format with clear message (F23)', () => {
    expect(() => keypairFromHex('suiprivkey1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq')).toThrow(
      /suiprivkey format is not supported/
    )
  })

  it('rejects malformed multisig cold pubkey via createMultisigSponsorSigner (F22)', () => {
    const kp3 = keypairFromHex(PRIV3)
    const coldPub = Buffer.from(kp3.getPublicKey().toRawBytes()).toString('hex')
    expect(() => createMultisigSponsorSigner(PRIV1, PRIV2, coldPub + 'ff', 2)).toThrow(
      /GAS_SPONSOR_PUBKEY_3/
    )
  })
})

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

  it('rejects SURVEY_PASS_ISSUER_PRIV as sponsor even in development', () => {
    expect(() =>
      createSponsorSignerFromEnv({
        NODE_ENV: 'development',
        SURVEY_PASS_ISSUER_PRIV: PRIV1,
      })
    ).toThrow(/must not be used as gas sponsor/)
  })

  it('returns null when multisig keys are missing', () => {
    expect(createSponsorSignerFromEnv({ NODE_ENV: 'development' })).toBeNull()
  })

  it('throws when only partial multisig keys are set', () => {
    expect(() =>
      createSponsorSignerFromEnv({
        GAS_SPONSOR_PRIV_1: PRIV1,
        GAS_SPONSOR_PRIV_2: PRIV2,
      })
    ).not.toThrow()
    expect(
      createSponsorSignerFromEnv({
        GAS_SPONSOR_PRIV_1: PRIV1,
        GAS_SPONSOR_PRIV_2: PRIV2,
      })
    ).toBeNull()
  })
})
