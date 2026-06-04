import { describe, it, expect } from 'vitest'
import {
  deriveCreatorKeyPair,
  buildCreatorPubKey,
  parseCreatorPubKey,
  encryptAnswers,
  decryptAnswers,
  encryptSurveyContent,
  decryptSurveyContent,
} from './crypto'

// Deterministic stand-in for a wallet personal-message signature.
function fakeSig(seedByte: number): Uint8Array {
  return new Uint8Array(64).fill(seedByte)
}

const X25519_PUB_LEN = 32
const MLKEM_EK_LEN = 1184
const MLKEM_CT_LEN = 1088
const IV_LEN = 12
const COMBINED_PUB_LEN = 1 + X25519_PUB_LEN + MLKEM_EK_LEN // 1217
const ANSWER_HEADER_LEN = 1 + X25519_PUB_LEN + MLKEM_CT_LEN + IV_LEN // 1133

describe('deriveCreatorKeyPair (hybrid X25519 + ML-KEM-768)', () => {
  it('derives keys of the expected sizes', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(1))
    expect(kp.x25519PublicKeyBytes.length).toBe(X25519_PUB_LEN)
    expect(kp.mlkemPublicKey.length).toBe(MLKEM_EK_LEN)
    expect(kp.mlkemSecretKey.length).toBe(2400)
  })

  it('is deterministic — same signature yields the same public keys', async () => {
    const a = await deriveCreatorKeyPair(fakeSig(7))
    const b = await deriveCreatorKeyPair(fakeSig(7))
    expect(Buffer.from(a.x25519PublicKeyBytes)).toEqual(Buffer.from(b.x25519PublicKeyBytes))
    expect(Buffer.from(a.mlkemPublicKey)).toEqual(Buffer.from(b.mlkemPublicKey))
  })

  it('different signatures yield different keys', async () => {
    const a = await deriveCreatorKeyPair(fakeSig(1))
    const b = await deriveCreatorKeyPair(fakeSig(2))
    expect(Buffer.from(a.x25519PublicKeyBytes)).not.toEqual(Buffer.from(b.x25519PublicKeyBytes))
    expect(Buffer.from(a.mlkemPublicKey)).not.toEqual(Buffer.from(b.mlkemPublicKey))
  })
})

describe('buildCreatorPubKey / parseCreatorPubKey', () => {
  it('round-trips symmetrically', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(3))
    const combined = buildCreatorPubKey(kp)
    expect(combined.length).toBe(COMBINED_PUB_LEN)

    const { x25519Pub, mlkemEk } = parseCreatorPubKey(combined)
    expect(Buffer.from(x25519Pub)).toEqual(Buffer.from(kp.x25519PublicKeyBytes))
    expect(Buffer.from(mlkemEk)).toEqual(Buffer.from(kp.mlkemPublicKey))
  })

  it('rejects wrong length', () => {
    expect(() => parseCreatorPubKey(new Uint8Array(32))).toThrow()
  })

  it('rejects unknown version byte', () => {
    const bad = new Uint8Array(COMBINED_PUB_LEN)
    bad[0] = 0x09
    expect(() => parseCreatorPubKey(bad)).toThrow()
  })
})

describe('encryptAnswers / decryptAnswers (hybrid KEM round-trip)', () => {
  it('round-trips an answer payload', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(11))
    const pub = buildCreatorPubKey(kp)
    const payload = JSON.stringify({ q1: 'Good', q2: 4, q3: ['a', 'b'] })

    const blob = await encryptAnswers(payload, pub)
    expect(blob[0]).toBe(0x01)
    const GCM_TAG_LEN = 16
    expect(blob.length).toBe(
      ANSWER_HEADER_LEN + new TextEncoder().encode(payload).length + GCM_TAG_LEN
    )

    const out = await decryptAnswers(blob, kp)
    expect(out).toBe(payload)
  })

  it('produces a different blob each call (ephemeral key + random IV)', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(12))
    const pub = buildCreatorPubKey(kp)
    const b1 = await encryptAnswers('hello', pub)
    const b2 = await encryptAnswers('hello', pub)
    expect(Buffer.from(b1)).not.toEqual(Buffer.from(b2))
  })

  it('cannot be decrypted by a different creator key pair', async () => {
    const kpA = await deriveCreatorKeyPair(fakeSig(13))
    const kpB = await deriveCreatorKeyPair(fakeSig(14))
    const blob = await encryptAnswers('secret', buildCreatorPubKey(kpA))
    await expect(decryptAnswers(blob, kpB)).rejects.toThrow()
  })

  it('fails when the ciphertext is tampered (AES-GCM auth)', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(15))
    const blob = await encryptAnswers('tamper-me', buildCreatorPubKey(kp))
    blob[blob.length - 1] ^= 0xff // flip last ciphertext byte
    await expect(decryptAnswers(blob, kp)).rejects.toThrow()
  })

  it('fails when the ML-KEM ciphertext is tampered (KEM binding)', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(16))
    const blob = await encryptAnswers('tamper-kem', buildCreatorPubKey(kp))
    blob[1 + X25519_PUB_LEN + 5] ^= 0xff // flip a byte inside kem_ct
    await expect(decryptAnswers(blob, kp)).rejects.toThrow()
  })

  it('rejects an unsupported answer blob version', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(17))
    const blob = await encryptAnswers('x', buildCreatorPubKey(kp))
    blob[0] = 0x02
    await expect(decryptAnswers(blob, kp)).rejects.toThrow()
  })
})

describe('survey content encryption (unchanged, symmetric)', () => {
  it('round-trips markdown content', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(21))
    const markdown = '# Title\n\nSome **survey** body.'
    const { encryptedBlob, contentKey } = await encryptSurveyContent(
      markdown,
      kp.x25519PublicKeyBytes
    )
    const { markdown: out, creatorPublicKeyBytes } = await decryptSurveyContent(
      encryptedBlob,
      contentKey
    )
    expect(out).toBe(markdown)
    expect(Buffer.from(creatorPublicKeyBytes)).toEqual(Buffer.from(kp.x25519PublicKeyBytes))
  })
})
