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

function fakeSalt(seedByte: number): Uint8Array {
  return new Uint8Array(32).fill(seedByte)
}

const X25519_PUB_LEN = 32
const MLKEM_EK_LEN = 1184
const MLKEM_CT_LEN = 1088
const IV_LEN = 12
const COMBINED_PUB_LEN = 1 + X25519_PUB_LEN + MLKEM_EK_LEN // 1217
const COMBINED_PUB_LEN_V2 = 1 + 32 + X25519_PUB_LEN + MLKEM_EK_LEN // 1249
const ANSWER_HEADER_LEN = 1 + X25519_PUB_LEN + MLKEM_CT_LEN + IV_LEN // 1133

describe('deriveCreatorKeyPair (hybrid X25519 + ML-KEM-768)', () => {
  it('derives keys of the expected sizes without salt', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(1))
    expect(kp.x25519PublicKeyBytes.length).toBe(X25519_PUB_LEN)
    expect(kp.mlkemPublicKey.length).toBe(MLKEM_EK_LEN)
    expect(kp.mlkemSecretKey.length).toBe(2400)
  })

  it('derives keys of the expected sizes with salt', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(1), fakeSalt(9))
    expect(kp.x25519PublicKeyBytes.length).toBe(X25519_PUB_LEN)
    expect(kp.mlkemPublicKey.length).toBe(MLKEM_EK_LEN)
    expect(kp.mlkemSecretKey.length).toBe(2400)
  })

  it('is deterministic — same signature and salt yields the same public keys', async () => {
    const a = await deriveCreatorKeyPair(fakeSig(7), fakeSalt(2))
    const b = await deriveCreatorKeyPair(fakeSig(7), fakeSalt(2))
    expect(Buffer.from(a.x25519PublicKeyBytes)).toEqual(Buffer.from(b.x25519PublicKeyBytes))
    expect(Buffer.from(a.mlkemPublicKey)).toEqual(Buffer.from(b.mlkemPublicKey))
  })

  it('different signatures yield different keys', async () => {
    const a = await deriveCreatorKeyPair(fakeSig(1), fakeSalt(2))
    const b = await deriveCreatorKeyPair(fakeSig(2), fakeSalt(2))
    expect(Buffer.from(a.x25519PublicKeyBytes)).not.toEqual(Buffer.from(b.x25519PublicKeyBytes))
    expect(Buffer.from(a.mlkemPublicKey)).not.toEqual(Buffer.from(b.mlkemPublicKey))
  })

  it('different salts yield different keys for same signature', async () => {
    const a = await deriveCreatorKeyPair(fakeSig(5), fakeSalt(2))
    const b = await deriveCreatorKeyPair(fakeSig(5), fakeSalt(3))
    expect(Buffer.from(a.x25519PublicKeyBytes)).not.toEqual(Buffer.from(b.x25519PublicKeyBytes))
    expect(Buffer.from(a.mlkemPublicKey)).not.toEqual(Buffer.from(b.mlkemPublicKey))
  })
})

describe('buildCreatorPubKey / parseCreatorPubKey', () => {
  it('round-trips V1 (legacy) symmetrically', async () => {
    const kp = await deriveCreatorKeyPair(fakeSig(3))
    const combined = buildCreatorPubKey(kp)
    expect(combined.length).toBe(COMBINED_PUB_LEN)

    const parsed = parseCreatorPubKey(combined)
    expect(parsed.version).toBe(0x01)
    expect(parsed.salt).toBeNull()
    expect(Buffer.from(parsed.x25519Pub)).toEqual(Buffer.from(kp.x25519PublicKeyBytes))
    expect(Buffer.from(parsed.mlkemEk)).toEqual(Buffer.from(kp.mlkemPublicKey))
  })

  it('round-trips V2 (salted) symmetrically', async () => {
    const salt = fakeSalt(88)
    const kp = await deriveCreatorKeyPair(fakeSig(3), salt)
    const combined = buildCreatorPubKey(kp, salt)
    expect(combined.length).toBe(COMBINED_PUB_LEN_V2)

    const parsed = parseCreatorPubKey(combined)
    expect(parsed.version).toBe(0x02)
    expect(Buffer.from(parsed.salt!)).toEqual(Buffer.from(salt))
    expect(Buffer.from(parsed.x25519Pub)).toEqual(Buffer.from(kp.x25519PublicKeyBytes))
    expect(Buffer.from(parsed.mlkemEk)).toEqual(Buffer.from(kp.mlkemPublicKey))
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
  it('round-trips a V1 answer payload', async () => {
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

  it('round-trips a V2 (salted) answer payload', async () => {
    const salt = fakeSalt(42)
    const kp = await deriveCreatorKeyPair(fakeSig(11), salt)
    const pub = buildCreatorPubKey(kp, salt)
    const payload = JSON.stringify({ q1: 'Best', q2: 5, q3: ['c'] })

    const blob = await encryptAnswers(payload, pub)
    expect(blob[0]).toBe(0x01) // answer blob version is still 0x01
    const GCM_TAG_LEN = 16
    expect(blob.length).toBe(
      ANSWER_HEADER_LEN + new TextEncoder().encode(payload).length + GCM_TAG_LEN
    )

    const out = await decryptAnswers(blob, kp)
    expect(out).toBe(payload)
  })

  it('produces a different blob each call (ephemeral key + random IV)', async () => {
    const salt = fakeSalt(12)
    const kp = await deriveCreatorKeyPair(fakeSig(12), salt)
    const pub = buildCreatorPubKey(kp, salt)
    const b1 = await encryptAnswers('hello', pub)
    const b2 = await encryptAnswers('hello', pub)
    expect(Buffer.from(b1)).not.toEqual(Buffer.from(b2))
  })

  it('cannot be decrypted by a different creator key pair', async () => {
    const salt = fakeSalt(13)
    const kpA = await deriveCreatorKeyPair(fakeSig(13), salt)
    const kpB = await deriveCreatorKeyPair(fakeSig(14), salt)
    const blob = await encryptAnswers('secret', buildCreatorPubKey(kpA, salt))
    await expect(decryptAnswers(blob, kpB)).rejects.toThrow()
  })

  it('cannot be decrypted by keypair derived with a different salt', async () => {
    const sig = fakeSig(13)
    const kpA = await deriveCreatorKeyPair(sig, fakeSalt(1))
    const kpB = await deriveCreatorKeyPair(sig, fakeSalt(2))
    const blob = await encryptAnswers('secret', buildCreatorPubKey(kpA, fakeSalt(1)))
    await expect(decryptAnswers(blob, kpB)).rejects.toThrow()
  })

  it('fails when the ciphertext is tampered (AES-GCM auth)', async () => {
    const salt = fakeSalt(15)
    const kp = await deriveCreatorKeyPair(fakeSig(15), salt)
    const blob = await encryptAnswers('tamper-me', buildCreatorPubKey(kp, salt))
    blob[blob.length - 1] ^= 0xff // flip last ciphertext byte
    await expect(decryptAnswers(blob, kp)).rejects.toThrow()
  })

  it('fails when the ML-KEM ciphertext is tampered (KEM binding)', async () => {
    const salt = fakeSalt(16)
    const kp = await deriveCreatorKeyPair(fakeSig(16), salt)
    const blob = await encryptAnswers('tamper-kem', buildCreatorPubKey(kp, salt))
    blob[1 + X25519_PUB_LEN + 5] ^= 0xff // flip a byte inside kem_ct
    await expect(decryptAnswers(blob, kp)).rejects.toThrow()
  })

  it('rejects an unsupported answer blob version', async () => {
    const salt = fakeSalt(17)
    const kp = await deriveCreatorKeyPair(fakeSig(17), salt)
    const blob = await encryptAnswers('x', buildCreatorPubKey(kp, salt))
    blob[0] = 0x02
    await expect(decryptAnswers(blob, kp)).rejects.toThrow()
  })
})

describe('survey content encryption (unchanged, symmetric)', () => {
  it('round-trips markdown content', async () => {
    const salt = fakeSalt(21)
    const kp = await deriveCreatorKeyPair(fakeSig(21), salt)
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
