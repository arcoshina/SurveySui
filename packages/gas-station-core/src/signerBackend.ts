import type { SuiClient } from '@mysten/sui/client'
import { Ed25519Keypair, Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519'
import { MultiSigPublicKey } from '@mysten/sui/multisig'
import type { Transaction } from '@mysten/sui/transactions'

/** Reserved for Phase 2 multisig / KMS sponsor signing. */
export interface SignerBackend {
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>
  getSponsorAddress(): string
}

/** Signer for gas sponsor paths (pipeline, merge, purge, pass delete). */
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
    // SDK runtime: getSigner(...signers); published types may only list a single Signer.
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

export function keypairFromHex(privKeyHex: string): Ed25519Keypair {
  const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
  const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
  return Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(0, 32))
}

export function pubkeyBytesFromHex(pubkeyHex: string): Uint8Array {
  const clean = pubkeyHex.startsWith('0x') ? pubkeyHex.slice(2) : pubkeyHex
  return new Uint8Array(Buffer.from(clean, 'hex'))
}

export function createMultisigSponsorSigner(
  priv1Hex: string,
  priv2Hex: string,
  coldPubkey3Hex: string,
  threshold = 2
): MultisigSponsorSigner {
  const kp1 = keypairFromHex(priv1Hex)
  const kp2 = keypairFromHex(priv2Hex)
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

/**
 * Loads gas sponsor signer from env.
 * Multisig: GAS_SPONSOR_PRIV_1 + GAS_SPONSOR_PRIV_2 + GAS_SPONSOR_PUBKEY_3 (cold).
 * Dev fallback: SURVEY_PASS_ISSUER_PRIV when not production.
 */
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

  const legacyPriv = env.SURVEY_PASS_ISSUER_PRIV?.trim()
  if (legacyPriv) {
    const isProd = env.NODE_ENV === 'production'
    if (isProd) {
      throw new Error(
        'Production requires GAS_SPONSOR_PRIV_1, GAS_SPONSOR_PRIV_2, and GAS_SPONSOR_PUBKEY_3'
      )
    }
    console.warn(
      '[SponsorSigner] Using SURVEY_PASS_ISSUER_PRIV as single-key sponsor (dev only). ' +
        'Set GAS_SPONSOR_PRIV_1/2 + GAS_SPONSOR_PUBKEY_3 for multisig.'
    )
    return new Ed25519SignerBackend(keypairFromHex(legacyPriv))
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
