/**
 * T3.2 — AES-256-GCM survey content encryption + X25519-ECIES answer encryption.
 *
 * Survey content:
 *   encryptedBlob = [32B creator_x25519_pubkey | 12B iv | ciphertext]
 *   Stored in survey_registry::encrypted_content.
 *   contentKey (32B random) stored in URL fragment (#<base64url>).
 *
 * Answers (ECIES):
 *   encryptedAnswers = [32B ephemeral_x25519_pubkey | 12B iv | ciphertext]
 *   Stored in survey_vault::claim(..., encrypted_answers).
 *   Only creator can decrypt via their deterministic X25519 private key.
 *
 * Key derivation message: "SurveySui encryption key\nvault:<vaultId>"
 * Signing is done by the caller (wallet adapter); this module hashes the result.
 */

// ── PKCS#8 DER prefix for X25519 private key (RFC 8410) ─────────────────────

const X25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, // SEQUENCE(46)
  0x02, 0x01, 0x00, // INTEGER version=0
  0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, // OID 1.3.101.110 (X25519)
  0x04, 0x22, 0x04, 0x20, // OCTET STRING(34) > OCTET STRING(32)
])

// ── HKDF info constants ───────────────────────────────────────────────────────

const ANSWERS_HKDF_INFO = new TextEncoder().encode('surveysui-answers-v1')
const HKDF_SALT = new Uint8Array(32) // all zeros

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
  return Uint8Array.from(binary, c => c.charCodeAt(0))
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
  /** 32-byte X25519 public key — stored on-chain (in content blob). */
  publicKeyBytes: Uint8Array
  /** Non-extractable X25519 private key — kept in memory only. */
  privateKey: CryptoKey
}

/**
 * Deterministically derive an X25519 key pair from a wallet signature.
 *
 * @param walletSignatureBytes — raw bytes returned by wallet.signPersonalMessage
 */
export async function deriveCreatorKeyPair(
  walletSignatureBytes: Uint8Array,
): Promise<CreatorKeyPair> {
  const seed = new Uint8Array(
    await crypto.subtle.digest('SHA-256', walletSignatureBytes as any),
  )
  const der = seedToX25519Pkcs8(seed)
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    der as any,
    { name: 'X25519' },
    true, // extractable=true so we can export JWK to retrieve pubkey
    ['deriveBits'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', privateKey)
  if (!jwk.x) throw new Error('Failed to derive X25519 public key from JWK')
  const publicKeyBytes = base64urlToBytes(jwk.x)

  // Re-import private key as non-extractable for the caller
  const privateKeyFinal = await crypto.subtle.importKey(
    'pkcs8',
    der as any,
    { name: 'X25519' },
    false, // non-extractable
    ['deriveBits'],
  )

  return { publicKeyBytes, privateKey: privateKeyFinal }
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
  creatorPublicKeyBytes: Uint8Array,
): Promise<EncryptedSurveyContent> {
  const contentKey = crypto.getRandomValues(new Uint8Array(32))
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(markdown),
    ),
  )

  // blob = creatorPubKey(32) || iv(12) || ciphertext
  const encryptedBlob = new Uint8Array(
    creatorPublicKeyBytes.length + iv.length + ciphertext.length,
  )
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
  contentKey: Uint8Array,
): Promise<{ markdown: string; creatorPublicKeyBytes: Uint8Array }> {
  const creatorPublicKeyBytes = encryptedBlob.slice(0, 32)
  const iv = encryptedBlob.slice(32, 44)
  const ciphertext = encryptedBlob.slice(44)

  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentKey as any,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext,
  )
  return {
    markdown: new TextDecoder().decode(plaintext),
    creatorPublicKeyBytes,
  }
}

// ── Answer encryption (ECIES = X25519-ECDH + HKDF + AES-256-GCM) ─────────────

/**
 * Encrypt survey answers for the creator using ECIES.
 * @param answers — JSON-serialisable answer payload (pass JSON.stringify result)
 * @param creatorPublicKeyBytes — 32B creator X25519 public key from content blob
 * Returns: [32B ephemeral_pubkey | 12B iv | ciphertext]
 */
export async function encryptAnswers(
  answers: string,
  creatorPublicKeyBytes: Uint8Array,
): Promise<Uint8Array> {
  const creatorPub = await crypto.subtle.importKey(
    'raw',
    creatorPublicKeyBytes as any,
    { name: 'X25519' },
    false,
    [],
  )

  // Ephemeral key pair
  const ephemeral = (await crypto.subtle.generateKey(
    { name: 'X25519' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const ephemeralPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', ephemeral.publicKey as any),
  )

  // Shared secret → HKDF → AES-GCM key
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: creatorPub },
    ephemeral.privateKey as any,
    256,
  )
  const aesKey = await _deriveAesKey(sharedBits, ['encrypt'])

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(answers),
    ),
  )

  // output = ephemeralPub(32) || iv(12) || ciphertext
  const out = new Uint8Array(32 + 12 + ciphertext.length)
  out.set(ephemeralPubRaw, 0)
  out.set(iv, 32)
  out.set(ciphertext, 44)
  return out
}

/**
 * Decrypt answers using the creator's X25519 private key.
 * @param encryptedAnswers — bytes stored in SurveyClaimed event
 * @param creatorPrivateKey — non-extractable CryptoKey from deriveCreatorKeyPair
 */
export async function decryptAnswers(
  encryptedAnswers: Uint8Array,
  creatorPrivateKey: CryptoKey,
): Promise<string> {
  const ephemeralPubRaw = encryptedAnswers.slice(0, 32)
  const iv = encryptedAnswers.slice(32, 44)
  const ciphertext = encryptedAnswers.slice(44)

  const ephemeralPub = await crypto.subtle.importKey(
    'raw',
    ephemeralPubRaw as any,
    { name: 'X25519' },
    false,
    [],
  )

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: ephemeralPub },
    creatorPrivateKey as any,
    256,
  )
  const aesKey = await _deriveAesKey(sharedBits, ['decrypt'])

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext,
  )
  return new TextDecoder().decode(plaintext)
}

// ── private helpers ───────────────────────────────────────────────────────────

async function _deriveAesKey(
  sharedBits: ArrayBuffer,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    'HKDF',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: ANSWERS_HKDF_INFO,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}
