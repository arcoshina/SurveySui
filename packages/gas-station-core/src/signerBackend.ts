import type { SuiClient } from '@mysten/sui/client'
import { Ed25519Keypair, Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519'
import { MultiSigPublicKey } from '@mysten/sui/multisig'
import type { Transaction } from '@mysten/sui/transactions'
export interface SignerBackend {
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>
  getSponsorAddress(): string
}
export interface SponsorSigner extends SignerBackend {
  asTransactionSigner(): TransactionSignerLike
}
export type TransactionSignerLike = {
  getPublicKey(): { toSuiAddress(): string }
  signTransaction(bytes: Uint8Array): Promise<{ signature: string }>
}
export class Ed25519SignerBackend implements SponsorSigner {
  constructor(private readonly keypair: Ed25519Keypair) {}
  getSponsorAddress(): string {
    return this.keypair.getPublicKey().toSuiAddress()
  }
  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    return this.keypair.signTransaction(txBytes)
  }
  asTransactionSigner(): TransactionSignerLike {
    return this.keypair
  }
}
export class MultisigSponsorSigner implements SponsorSigner {
  private readonly multisigPubkey: MultiSigPublicKey
  private readonly signer: ReturnType<MultiSigPublicKey['getSigner']>
  constructor(
    multisigPubkey: MultiSigPublicKey,
    signingKeypairs: Ed25519Keypair[]
  ) {
    this.multisigPubkey = multisigPubkey
    if (signingKeypairs.length < 2) {
      throw new Error('Multisig sponsor requires at least two signing keypairs')
    }
    this.signer = (
      multisigPubkey.getSigner as (
        ...signers: Ed25519Keypair[]
      ) => ReturnType<MultiSigPublicKey['getSigner']>
    )(signingKeypairs[0], signingKeypairs[1])
  }
  getSponsorAddress(): string {
    return this.multisigPubkey.toSuiAddress()
  }
  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    return this.signer.signTransaction(txBytes)
  }
  asTransactionSigner(): TransactionSignerLike {
    return this.signer
  }
}
const ED25519_SECRET_BYTE_LENGTH = 32

/** Reject malformed hex before constructing Ed25519 keys (F22/F23). */
export function parseStrictHex32(fieldName: string, input: string): Uint8Array {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error(`${fieldName}: value must not be empty`)
  }
  if (trimmed.toLowerCase().startsWith('suiprivkey')) {
    throw new Error(
      `${fieldName}: suiprivkey format is not supported; use 64-character raw Ed25519 secret hex ` +
        '(see setup-multisig-sponsor.ts output)'
    )
  }
  const clean = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed
  if (clean.length === 0 || clean.length % 2 !== 0) {
    throw new Error(`${fieldName}: hex string must have even length (got ${clean.length} nibbles)`)
  }
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${fieldName}: must contain only hex characters`)
  }
  const bytes = new Uint8Array(Buffer.from(clean, 'hex'))
  if (bytes.byteLength !== ED25519_SECRET_BYTE_LENGTH) {
    throw new Error(
      `${fieldName}: expected ${ED25519_SECRET_BYTE_LENGTH} bytes after decode, got ${bytes.byteLength}`
    )
  }
  return bytes
}

export function keypairFromHex(
  privKeyHex: string,
  fieldName = 'Ed25519 private key'
): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(parseStrictHex32(fieldName, privKeyHex))
}

export function pubkeyBytesFromHex(pubkeyHex: string): Uint8Array {
  return parseStrictHex32('GAS_SPONSOR_PUBKEY_3', pubkeyHex)
}
export function createMultisigSponsorSigner(
  priv1Hex: string,
  priv2Hex: string,
  coldPubkey3Hex: string,
  threshold = 2
): MultisigSponsorSigner {
  const kp1 = keypairFromHex(priv1Hex, 'GAS_SPONSOR_PRIV_1')
  const kp2 = keypairFromHex(priv2Hex, 'GAS_SPONSOR_PRIV_2')
  const pk3Bytes = pubkeyBytesFromHex(coldPubkey3Hex)
  const pk3 = new Ed25519PublicKey(pk3Bytes)
  const multisigPubkey = MultiSigPublicKey.fromPublicKeys({
    threshold,
    publicKeys: [
      { publicKey: kp1.getPublicKey(), weight: 1 },
      { publicKey: kp2.getPublicKey(), weight: 1 },
      { publicKey: pk3, weight: 1 },
    ],
  })
  return new MultisigSponsorSigner(multisigPubkey, [kp1, kp2])
}
export type SponsorSignerEnv = Record<string, string | undefined>
export function createSponsorSignerFromEnv(
  env: SponsorSignerEnv = process.env as SponsorSignerEnv
): SponsorSigner | null {
  const priv1 = env.GAS_SPONSOR_PRIV_1?.trim()
  const priv2 = env.GAS_SPONSOR_PRIV_2?.trim()
  const coldPubkey3 = env.GAS_SPONSOR_PUBKEY_3?.trim()
  if (priv1 && priv2 && coldPubkey3) {
    const threshold = parseInt(env.GAS_SPONSOR_MULTISIG_THRESHOLD ?? '2', 10)
    const signer = createMultisigSponsorSigner(priv1, priv2, coldPubkey3, threshold)
    const expected = env.GAS_SPONSOR_ADDRESS?.trim()
    if (expected) {
      const normalized = normalizeSuiAddress(expected)
      if (normalizeSuiAddress(signer.getSponsorAddress()) !== normalized) {
        throw new Error(
          `GAS_SPONSOR_ADDRESS mismatch: expected ${normalized}, got ${signer.getSponsorAddress()}`
        )
      }
    }
    return signer
  }
  if (env.SURVEY_PASS_ISSUER_PRIV?.trim()) {
    throw new Error(
      'SURVEY_PASS_ISSUER_PRIV must not be used as gas sponsor. ' +
        'Configure GAS_SPONSOR_PRIV_1, GAS_SPONSOR_PRIV_2, and GAS_SPONSOR_PUBKEY_3.'
    )
  }
  return null
}
function normalizeSuiAddress(addr: string): string {
  let clean = addr.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}
export async function signAndExecuteWithSponsor(
  suiClient: SuiClient,
  sponsorSigner: SponsorSigner,
  transaction: Transaction,
  options?: Parameters<SuiClient['signAndExecuteTransaction']>[0]['options']
) {
  return suiClient.signAndExecuteTransaction({
    transaction,
    signer: sponsorSigner.asTransactionSigner() as Ed25519Keypair,
    options,
  })
}
