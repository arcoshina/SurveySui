import { describe, it, expect } from 'vitest'
import {
  deriveCreatorKeyPair,
  encryptSurveyContent,
  decryptSurveyContent,
  encryptAnswers,
  decryptAnswers,
  bytesToBase64url,
  KEY_DERIVE_MSG,
} from '../lib/crypto'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Fake wallet sign: deterministic — SHA-256 of the message bytes. */
async function fakeSign(message: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', message as any))
}

/**
 * Build a creator keypair from a wallet-like signature.
 * `salt` simulates different wallets — same wallet → same keypair, different
 * wallet → different keypair. (KEY_DERIVE_MSG itself is now global, so the
 * differentiator comes from the signature input.)
 */
async function makeCreatorKeyPair(salt = 'wallet-A') {
  const msg = new TextEncoder().encode(`${salt}:${KEY_DERIVE_MSG}`)
  const sig = await fakeSign(msg)
  return deriveCreatorKeyPair(sig)
}

// ── test_encrypted_blob_round_trip ────────────────────────────────────────────

describe('T3.2 — Encryption Round Trip', () => {
  it('test_encrypted_blob_round_trip — survey content encrypts and decrypts correctly', async () => {
    const markdown = '# Test Survey\n1. How are you?\n   - Good\n   - Bad\n'
    const { publicKeyBytes, privateKey: _priv } = await makeCreatorKeyPair()

    // Creator encrypts content
    const { encryptedBlob, contentKey } = await encryptSurveyContent(markdown, publicKeyBytes)

    // Verify blob structure: 32B pubkey + 12B iv + ciphertext
    expect(encryptedBlob.length).toBeGreaterThan(44)
    const blobPubKey = encryptedBlob.slice(0, 32)
    expect(Array.from(blobPubKey)).toEqual(Array.from(publicKeyBytes))

    // Content key length
    expect(contentKey.length).toBe(32)

    // Respondent decrypts with contentKey from URL fragment
    const { markdown: decrypted, creatorPublicKeyBytes } = await decryptSurveyContent(encryptedBlob, contentKey)
    expect(decrypted).toBe(markdown)
    expect(Array.from(creatorPublicKeyBytes)).toEqual(Array.from(publicKeyBytes))
  })

  it('test_encrypted_blob_round_trip — answer encrypts and decrypts correctly', async () => {
    const answers = JSON.stringify({ q1: 'Good', q2: 4 })
    const { publicKeyBytes, privateKey } = await makeCreatorKeyPair()

    // Respondent encrypts with creator's public key
    const encryptedAnswers = await encryptAnswers(answers, publicKeyBytes)

    // Output format: 32B ephemeral_pubkey + 12B iv + ciphertext
    expect(encryptedAnswers.length).toBeGreaterThan(44)

    // Creator decrypts on dashboard
    const decrypted = await decryptAnswers(encryptedAnswers, privateKey)
    expect(decrypted).toBe(answers)
  })

  it('test_encrypted_blob_round_trip — same wallet signature yields same public key (deterministic)', async () => {
    const wallet = 'wallet-determinism-test'
    const kp1 = await makeCreatorKeyPair(wallet)
    const kp2 = await makeCreatorKeyPair(wallet)
    expect(bytesToBase64url(kp1.publicKeyBytes)).toBe(bytesToBase64url(kp2.publicKeyBytes))
  })
})

// ── test_third_party_cannot_decrypt ───────────────────────────────────────────

describe('T3.2 — Third Party Cannot Decrypt', () => {
  it('test_third_party_cannot_decrypt — wrong content key fails to decrypt survey', async () => {
    const markdown = 'Secret survey content'
    const { publicKeyBytes } = await makeCreatorKeyPair()
    const { encryptedBlob } = await encryptSurveyContent(markdown, publicKeyBytes)

    const wrongKey = crypto.getRandomValues(new Uint8Array(32))

    await expect(decryptSurveyContent(encryptedBlob, wrongKey)).rejects.toThrow()
  })

  it('test_third_party_cannot_decrypt — different creator key cannot decrypt answers', async () => {
    const answers = JSON.stringify({ q1: 'Answer' })

    // Creator A's key pair
    const creatorA = await makeCreatorKeyPair('wallet-a')
    // Creator B (attacker) has a different key pair
    const creatorB = await makeCreatorKeyPair('wallet-b-attacker')

    // Respondent encrypts for Creator A
    const encryptedAnswers = await encryptAnswers(answers, creatorA.publicKeyBytes)

    // Creator B tries to decrypt — should throw
    await expect(decryptAnswers(encryptedAnswers, creatorB.privateKey)).rejects.toThrow()
  })

  it('test_third_party_cannot_decrypt — different wallets yield different key pairs', async () => {
    const kp1 = await makeCreatorKeyPair('wallet-111')
    const kp2 = await makeCreatorKeyPair('wallet-222')
    expect(bytesToBase64url(kp1.publicKeyBytes)).not.toBe(bytesToBase64url(kp2.publicKeyBytes))
  })

  it('test_third_party_cannot_decrypt — tampered ciphertext is rejected', async () => {
    const answers = JSON.stringify({ q1: 'Tamper test' })
    const { publicKeyBytes, privateKey } = await makeCreatorKeyPair()
    const encrypted = await encryptAnswers(answers, publicKeyBytes)

    // Flip a byte in the ciphertext
    const tampered = new Uint8Array(encrypted)
    tampered[50] ^= 0xff

    await expect(decryptAnswers(tampered, privateKey)).rejects.toThrow()
  })
})
