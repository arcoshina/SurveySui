/**
 * AES-256-GCM survey content encryption + post-quantum hybrid answer encryption.
 *
 * Survey content (already quantum-safe — symmetric only):
 *   encryptedBlob = [32B creator_x25519_pubkey | 12B iv | ciphertext]
 *   Stored in survey_registry::encrypted_content.
 *   contentKey (32B random) stored in URL fragment (#<base64url>).
 *   The 32B header is identification metadata only; content confidentiality
 *   rests on AES-256-GCM + the out-of-band URL-fragment key.
 *
 * Answers (hybrid KEM = X25519-ECDH + ML-KEM-768 + HKDF + AES-256-GCM):
 *   creatorPubKey published in survey_registry::creator_pub_key:
 *     [1B ver=0x01 | 32B x25519_pub | 1184B ml_kem768_ek]
 *   encryptedAnswers = [1B ver=0x01 | 32B ephemeral_x25519_pub | 1088B kem_ct | 12B iv | ciphertext]
 *   Stored in survey_vault::claim(..., encrypted_answers).
 *   The AES key derives from BOTH the X25519 and ML-KEM shared secrets, so the
 *   answer stays confidential as long as EITHER primitive is unbroken — defeating
 *   "harvest-now-decrypt-later" against a future quantum adversary.
 *   Only the creator can decrypt, via key pairs deterministically re-derived from
 *   their wallet signature.
 *
 * Key derivation message: KEY_DERIVE_MSG below.
 * Signing is done by the caller (wallet adapter); this module hashes the result.
 */

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'

// ── PKCS#8 DER prefix for X25519 private key (RFC 8410) ─────────────────────

const X25519_PKCS8_PREFIX = new Uint8Array([
  0x30,
  0x2e, // SEQUENCE(46)
  0x02,
  0x01,
  0x00, // INTEGER version=0
  0x30,
  0x05,
  0x06,
  0x03,
  0x2b,
  0x65,
  0x6e, // OID 1.3.101.110 (X25519)
  0x04,
  0x22,
  0x04,
  0x20, // OCTET STRING(34) > OCTET STRING(32)
])

// ── HKDF info constants ───────────────────────────────────────────────────────

/** Domain-separation prefix for the hybrid answer KEM key derivation. */
const ANSWERS_HKDF_INFO_PREFIX = new TextEncoder().encode('surveysui-answers-v2')
const HKDF_SALT = new Uint8Array(32) // all zeros

// ── Hybrid (X25519 + ML-KEM-768) constants ───────────────────────────────────

/** Version byte prefixing creatorPubKey and answer blobs (forward-compat hook). */
const HYBRID_VERSION = 0x01
const X25519_PUB_LEN = 32
const MLKEM_EK_LEN = 1184 // ml_kem768 encapsulation (public) key
const MLKEM_CT_LEN = 1088 // ml_kem768 ciphertext
const MLKEM_SEED_LEN = 64 // ml_kem768 deterministic keygen seed
const IV_LEN = 12

/** Info label for deriving the deterministic ML-KEM seed from the wallet signature. */
const MLKEM_SEED_INFO = new TextEncoder().encode('surveysui-mlkem768-v1')

// ── KEY_DERIVE_MSG ─────────────────────────────────────────────────────────────

/**
 * Wallet-signed message used to deterministically derive the creator's X25519
 * key pair. Global (not bound to a vault) so the Flow A PTB can stay atomic:
 * encrypting survey content before the PTB executes requires the creator's
 * public key, but vault_id only exists after `create vault` runs on-chain.
 *
 * Each encrypted blob carries the creator pubkey in its first 32 bytes, so the
 * dashboard can identify which key derived a given response — supporting
 * future key rotation (pass a `version` suffix here, e.g. `\nv2`) without
 * losing access to surveys encrypted under the previous key.
 */
export const KEY_DERIVE_MSG = 'SurveySui encryption key'

// ── helpers ───────────────────────────────────────────────────────────────────

export function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '==='.slice(0, (4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** Build PKCS#8 DER for X25519 from 32-byte seed. */
function seedToX25519Pkcs8(seed: Uint8Array): Uint8Array {
  const der = new Uint8Array(X25519_PKCS8_PREFIX.length + seed.length)
  der.set(X25519_PKCS8_PREFIX)
  der.set(seed, X25519_PKCS8_PREFIX.length)
  return der
}

// ── Creator key pair ──────────────────────────────────────────────────────────

export interface CreatorKeyPair {
  /** 32-byte X25519 public key. */
  x25519PublicKeyBytes: Uint8Array
  /** Non-extractable X25519 private key — kept in memory only. */
  x25519PrivateKey: CryptoKey
  /** 1184-byte ML-KEM-768 encapsulation (public) key. */
  mlkemPublicKey: Uint8Array
  /** 2400-byte ML-KEM-768 decapsulation (secret) key — kept in memory only. */
  mlkemSecretKey: Uint8Array
}

/**
 * Deterministically derive the creator's hybrid (X25519 + ML-KEM-768) key pair
 * from a wallet signature. Both halves are reproducible from the same signature,
 * so the creator can re-derive them later (e.g. on the dashboard) to decrypt.
 *
 * @param walletSignatureBytes — raw bytes returned by wallet.signPersonalMessage
 */
export async function deriveCreatorKeyPair(
  walletSignatureBytes: Uint8Array,
  salt: Uint8Array | null = null
): Promise<CreatorKeyPair> {
  let seed: Uint8Array
  let mlkemSeed: Uint8Array

  if (salt) {
    if (salt.length !== 32) {
      throw new Error(`Salt must be exactly 32 bytes, got ${salt.length}`)
    }
    // V2: Derive seeds using HKDF-SHA256 with the survey-specific salt
    const hkdfKey = await crypto.subtle.importKey(
      'raw',
      walletSignatureBytes as any,
      'HKDF',
      false,
      ['deriveBits']
    )
    
    // Derive 32-byte seed for X25519
    const x25519SeedBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt as any,
        info: new TextEncoder().encode('surveysui-x25519-v2')
      },
      hkdfKey,
      32 * 8
    )
    seed = new Uint8Array(x25519SeedBits)

    // Derive 64-byte seed for ML-KEM-768
    const mlkemSeedBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt as any,
        info: new TextEncoder().encode('surveysui-mlkem768-v2')
      },
      hkdfKey,
      64 * 8
    )
    mlkemSeed = new Uint8Array(mlkemSeedBits)
  } else {
    // V1 (Legacy):
    // ── X25519: seed = SHA-256(walletSig) ──
    seed = new Uint8Array(await crypto.subtle.digest('SHA-256', walletSignatureBytes as any))
    // ── ML-KEM-768: 64-byte seed = HKDF-SHA256(walletSig), domain-separated ──
    mlkemSeed = await _deriveMlkemSeed(walletSignatureBytes)
  }

  const der = seedToX25519Pkcs8(seed)
  const extractable = await crypto.subtle.importKey(
    'pkcs8',
    der as any,
    { name: 'X25519' },
    true, // extractable so we can export JWK to retrieve pubkey
    ['deriveBits']
  )
  const jwk = await crypto.subtle.exportKey('jwk', extractable)
  if (!jwk.x) throw new Error('Failed to derive X25519 public key from JWK')
  const x25519PublicKeyBytes = base64urlToBytes(jwk.x)

  // Re-import private key as non-extractable for the caller
  const x25519PrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    der as any,
    { name: 'X25519' },
    false, // non-extractable
    ['deriveBits']
  )

  const { publicKey: mlkemPublicKey, secretKey: mlkemSecretKey } = ml_kem768.keygen(mlkemSeed)

  return { x25519PublicKeyBytes, x25519PrivateKey, mlkemPublicKey, mlkemSecretKey }
}

/**
 * Combined, publishable creator public key:
 *   V1 (Legacy): [1B ver=0x01 | 32B x25519_pub | 1184B ml_kem768_ek]
 *   V2 (Salted): [1B ver=0x02 | 32B salt | 32B x25519_pub | 1184B ml_kem768_ek]
 * Stored on-chain in survey_registry::creator_pub_key.
 */
export function buildCreatorPubKey(kp: CreatorKeyPair, salt: Uint8Array | null = null): Uint8Array {
  if (salt) {
    if (salt.length !== 32) {
      throw new Error(`Salt must be exactly 32 bytes, got ${salt.length}`)
    }
    const out = new Uint8Array(1 + 32 + X25519_PUB_LEN + MLKEM_EK_LEN)
    out[0] = 0x02 // V2 version
    out.set(salt, 1)
    out.set(kp.x25519PublicKeyBytes, 1 + 32)
    out.set(kp.mlkemPublicKey, 1 + 32 + X25519_PUB_LEN)
    return out
  } else {
    const out = new Uint8Array(1 + X25519_PUB_LEN + MLKEM_EK_LEN)
    out[0] = 0x01 // V1 version
    out.set(kp.x25519PublicKeyBytes, 1)
    out.set(kp.mlkemPublicKey, 1 + X25519_PUB_LEN)
    return out
  }
}

/** Reverse of {@link buildCreatorPubKey}. */
export function parseCreatorPubKey(bytes: Uint8Array): {
  version: number
  salt: Uint8Array | null
  x25519Pub: Uint8Array
  mlkemEk: Uint8Array
} {
  const version = bytes[0]
  if (version === 0x01) {
    if (bytes.length !== 1 + X25519_PUB_LEN + MLKEM_EK_LEN) {
      throw new Error(`Unexpected creator pub key length for V1: ${bytes.length}`)
    }
    return {
      version,
      salt: null,
      x25519Pub: bytes.slice(1, 1 + X25519_PUB_LEN),
      mlkemEk: bytes.slice(1 + X25519_PUB_LEN),
    }
  } else if (version === 0x02) {
    const SALT_LEN = 32
    if (bytes.length !== 1 + SALT_LEN + X25519_PUB_LEN + MLKEM_EK_LEN) {
      throw new Error(`Unexpected creator pub key length for V2: ${bytes.length}`)
    }
    return {
      version,
      salt: bytes.slice(1, 1 + SALT_LEN),
      x25519Pub: bytes.slice(1 + SALT_LEN, 1 + SALT_LEN + X25519_PUB_LEN),
      mlkemEk: bytes.slice(1 + SALT_LEN + X25519_PUB_LEN),
    }
  } else {
    throw new Error(`Unsupported creator pub key version: ${version}`)
  }
}

// ── Survey content encryption ─────────────────────────────────────────────────

export interface EncryptedSurveyContent {
  /**
   * Binary blob to store in survey_registry::encrypted_content.
   * Layout: [32B creator_x25519_pubkey | 12B iv | ciphertext]
   */
  encryptedBlob: Uint8Array
  /**
   * 32-byte AES-256-GCM content key for URL fragment.
   * Encode as base64url and append to survey URL after '#'.
   */
  contentKey: Uint8Array
}

/**
 * Encrypt survey Markdown content for on-chain storage.
 * The random AES key is returned separately — embed it in the URL fragment.
 */
export async function encryptSurveyContent(
  markdown: string,
  creatorPublicKeyBytes: Uint8Array
): Promise<EncryptedSurveyContent> {
  const contentKey = crypto.getRandomValues(new Uint8Array(32))
  const aesKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, [
    'encrypt',
  ])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(markdown))
  )

  // blob = creatorPubKey(32) || iv(12) || ciphertext
  const encryptedBlob = new Uint8Array(creatorPublicKeyBytes.length + iv.length + ciphertext.length)
  encryptedBlob.set(creatorPublicKeyBytes, 0)
  encryptedBlob.set(iv, creatorPublicKeyBytes.length)
  encryptedBlob.set(ciphertext, creatorPublicKeyBytes.length + iv.length)

  return { encryptedBlob, contentKey }
}

/**
 * Decrypt survey content blob fetched from chain.
 * @param encryptedBlob — the encrypted_content field from survey_registry
 * @param contentKey — 32B AES key from URL fragment
 * Returns decrypted Markdown string and the creator's X25519 public key bytes.
 */
export async function decryptSurveyContent(
  encryptedBlob: Uint8Array,
  contentKey: Uint8Array
): Promise<{ markdown: string; creatorPublicKeyBytes: Uint8Array }> {
  const creatorPublicKeyBytes = encryptedBlob.slice(0, 32)
  const iv = encryptedBlob.slice(32, 44)
  const ciphertext = encryptedBlob.slice(44)

  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentKey as any,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext)
  return {
    markdown: new TextDecoder().decode(plaintext),
    creatorPublicKeyBytes,
  }
}

// ── Answer encryption (hybrid KEM = X25519-ECDH + ML-KEM-768 + HKDF + AES-256-GCM) ──

/**
 * Encrypt survey answers for the creator using a post-quantum hybrid KEM.
 * The AES key binds BOTH an X25519 ECDH secret and an ML-KEM-768 encapsulated
 * secret, so confidentiality holds as long as EITHER primitive is unbroken.
 *
 * @param answers — JSON-serialisable answer payload (pass JSON.stringify result)
 * @param creatorPubKeyCombined — survey_registry::creator_pub_key bytes
 *   (`[1B ver | 32B x25519_pub | 1184B ml_kem768_ek]`)
 * Returns: [1B ver | 32B ephemeral_x25519_pub | 1088B kem_ct | 12B iv | ciphertext]
 */
export async function encryptAnswers(
  answers: string,
  creatorPubKeyCombined: Uint8Array
): Promise<Uint8Array> {
  const { x25519Pub, mlkemEk } = parseCreatorPubKey(creatorPubKeyCombined)

  const creatorPub = await crypto.subtle.importKey(
    'raw',
    x25519Pub as any,
    { name: 'X25519' },
    false,
    []
  )

  // X25519: ephemeral key pair → ECDH shared secret (ss1)
  const ephemeral = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const ephemeralPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', ephemeral.publicKey as any)
  )
  const ss1 = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'X25519', public: creatorPub }, ephemeral.privateKey as any, 256)
  )

  // ML-KEM-768: encapsulate to creator ek → ciphertext + shared secret (ss2)
  const { cipherText: kemCt, sharedSecret: ss2 } = ml_kem768.encapsulate(mlkemEk)

  // Hybrid combine → AES key, transcript-bound (ephemeral pub ‖ kem ct)
  const aesKey = await _deriveHybridAesKey(ss1, ss2, ephemeralPubRaw, kemCt, ['encrypt'])

  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(answers))
  )

  // output = ver(1) || ephemeralPub(32) || kemCt(1088) || iv(12) || ciphertext
  const headerLen = 1 + X25519_PUB_LEN + MLKEM_CT_LEN + IV_LEN
  const out = new Uint8Array(headerLen + ciphertext.length)
  let off = 0
  out[off] = HYBRID_VERSION
  off += 1
  out.set(ephemeralPubRaw, off)
  off += X25519_PUB_LEN
  out.set(kemCt, off)
  off += MLKEM_CT_LEN
  out.set(iv, off)
  off += IV_LEN
  out.set(ciphertext, off)
  return out
}

/**
 * Decrypt answers using the creator's hybrid key pair.
 * @param encryptedAnswers — bytes stored in SurveyClaimed event
 * @param kp — creator key pair re-derived via deriveCreatorKeyPair
 */
export async function decryptAnswers(
  encryptedAnswers: Uint8Array,
  kp: CreatorKeyPair
): Promise<string> {
  const minLen = 1 + X25519_PUB_LEN + MLKEM_CT_LEN + IV_LEN
  if (encryptedAnswers.length < minLen) {
    throw new Error(`Answer blob too short: ${encryptedAnswers.length}`)
  }
  if (encryptedAnswers[0] !== HYBRID_VERSION) {
    throw new Error(`Unsupported answer blob version: ${encryptedAnswers[0]}`)
  }
  let off = 1
  const ephemeralPubRaw = encryptedAnswers.slice(off, off + X25519_PUB_LEN)
  off += X25519_PUB_LEN
  const kemCt = encryptedAnswers.slice(off, off + MLKEM_CT_LEN)
  off += MLKEM_CT_LEN
  const iv = encryptedAnswers.slice(off, off + IV_LEN)
  off += IV_LEN
  const ciphertext = encryptedAnswers.slice(off)

  const ephemeralPub = await crypto.subtle.importKey(
    'raw',
    ephemeralPubRaw as any,
    { name: 'X25519' },
    false,
    []
  )
  const ss1 = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'X25519', public: ephemeralPub }, kp.x25519PrivateKey as any, 256)
  )
  const ss2 = ml_kem768.decapsulate(kemCt, kp.mlkemSecretKey)

  const aesKey = await _deriveHybridAesKey(ss1, ss2, ephemeralPubRaw, kemCt, ['decrypt'])

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext)
  return new TextDecoder().decode(plaintext)
}

// ── private helpers ───────────────────────────────────────────────────────────

/** Derive a 64-byte deterministic ML-KEM seed from the wallet signature. */
async function _deriveMlkemSeed(walletSignatureBytes: Uint8Array): Promise<Uint8Array> {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    walletSignatureBytes as any,
    'HKDF',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: MLKEM_SEED_INFO },
    hkdfKey,
    MLKEM_SEED_LEN * 8
  )
  return new Uint8Array(bits)
}

/**
 * Hybrid KEM combiner: AES-256-GCM key = HKDF-SHA256 over (ss1 ‖ ss2), with the
 * transcript (ephemeral X25519 pub ‖ ML-KEM ciphertext) bound via `info`.
 *
 * The transcript is first hashed to a fixed 32-byte digest before going into
 * `info`: WebCrypto HKDF caps `info` at 1024 bytes (the 1088-byte ML-KEM
 * ciphertext alone would overflow it), and hashing keeps the binding intact
 * while staying well within that limit.
 */
async function _deriveHybridAesKey(
  ss1: Uint8Array,
  ss2: Uint8Array,
  ephemeralPub: Uint8Array,
  kemCt: Uint8Array,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const ikm = new Uint8Array(ss1.length + ss2.length)
  ikm.set(ss1, 0)
  ikm.set(ss2, ss1.length)

  const transcript = new Uint8Array(ephemeralPub.length + kemCt.length)
  transcript.set(ephemeralPub, 0)
  transcript.set(kemCt, ephemeralPub.length)
  const transcriptHash = new Uint8Array(await crypto.subtle.digest('SHA-256', transcript as any))

  const info = new Uint8Array(ANSWERS_HKDF_INFO_PREFIX.length + transcriptHash.length)
  info.set(ANSWERS_HKDF_INFO_PREFIX, 0)
  info.set(transcriptHash, ANSWERS_HKDF_INFO_PREFIX.length)

  const hkdfKey = await crypto.subtle.importKey('raw', ikm as any, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  )
}
