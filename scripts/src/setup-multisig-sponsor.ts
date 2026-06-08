/**
 * Generate a 2-of-3 Sui multisig gas sponsor address for Phase 2-lite.
 *
 * K1 + K2 → runtime secrets (BFF / Gas Station Worker)
 * K3      → offline backup only (public key goes to GAS_SPONSOR_PUBKEY_3)
 *
 * Usage:
 *   pnpm --filter @surveysui/scripts exec tsx src/setup-multisig-sponsor.ts
 *   pnpm --filter @surveysui/scripts exec tsx src/setup-multisig-sponsor.ts --from-env
 */
import { randomBytes } from 'node:crypto'
import { Ed25519Keypair, Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519'
import { MultiSigPublicKey } from '@mysten/sui/multisig'

const THRESHOLD = 2

function keypairFromPrivHex(privHex: string): Ed25519Keypair {
  const clean = privHex.startsWith('0x') ? privHex.slice(2) : privHex
  return Ed25519Keypair.fromSecretKey(new Uint8Array(Buffer.from(clean, 'hex')).slice(0, 32))
}

function generateKeypair(): { keypair: Ed25519Keypair; privHex: string; pubHex: string } {
  const seed = randomBytes(32)
  const keypair = Ed25519Keypair.fromSecretKey(seed)
  return {
    keypair,
    privHex: Buffer.from(seed).toString('hex'),
    pubHex: Buffer.from(keypair.getPublicKey().toRawBytes()).toString('hex'),
  }
}

function loadOrGenerate(name: string, envVar: string): ReturnType<typeof generateKeypair> {
  const fromEnv = process.env[envVar]?.trim()
  if (fromEnv) {
    const keypair = keypairFromPrivHex(fromEnv)
    return {
      keypair,
      privHex: fromEnv.startsWith('0x') ? fromEnv.slice(2) : fromEnv,
      pubHex: Buffer.from(keypair.getPublicKey().toRawBytes()).toString('hex'),
    }
  }
  const generated = generateKeypair()
  console.log(`# Generated fresh ${name} (set ${envVar} to reuse)`)
  return generated
}

function main() {
  const fromEnv = process.argv.includes('--from-env')

  const k1 = fromEnv
    ? loadOrGenerate('K1', 'GAS_SPONSOR_PRIV_1')
    : generateKeypair()
  const k2 = fromEnv
    ? loadOrGenerate('K2', 'GAS_SPONSOR_PRIV_2')
    : generateKeypair()
  const k3 = fromEnv
    ? loadOrGenerate('K3', 'GAS_SPONSOR_PRIV_3_OFFLINE')
    : generateKeypair()

  const multisigPubkey = MultiSigPublicKey.fromPublicKeys({
    threshold: THRESHOLD,
    publicKeys: [
      { publicKey: k1.keypair.getPublicKey(), weight: 1 },
      { publicKey: k2.keypair.getPublicKey(), weight: 1 },
      { publicKey: k3.keypair.getPublicKey(), weight: 1 },
    ],
  })

  const sponsorAddress = multisigPubkey.toSuiAddress()

  console.log('')
  console.log('=== SurveySui Gas Sponsor Multisig (2-of-3) ===')
  console.log('')
  console.log(`Sponsor address (fund this): ${sponsorAddress}`)
  console.log('')
  console.log('--- Runtime secrets (BFF + gas-station Worker) ---')
  console.log(`GAS_SPONSOR_PRIV_1=${k1.privHex}`)
  console.log(`GAS_SPONSOR_PRIV_2=${k2.privHex}`)
  console.log(`GAS_SPONSOR_PUBKEY_3=${k3.pubHex}`)
  console.log(`GAS_SPONSOR_MULTISIG_THRESHOLD=${THRESHOLD}`)
  console.log(`GAS_SPONSOR_ADDRESS=${sponsorAddress}`)
  console.log('')
  console.log('--- Wrangler (gas-station Worker) ---')
  console.log(`wrangler secret put GAS_SPONSOR_PRIV_1`)
  console.log(`wrangler secret put GAS_SPONSOR_PRIV_2`)
  console.log(`wrangler secret put GAS_SPONSOR_PUBKEY_3`)
  console.log('')
  console.log('--- OFFLINE ONLY — store K3 securely, never deploy ---')
  console.log(`GAS_SPONSOR_PRIV_3_OFFLINE=${k3.privHex}`)
  console.log(`K3 public key (already in GAS_SPONSOR_PUBKEY_3): ${k3.pubHex}`)
  console.log('')
  console.log('--- Manual steps ---')
  console.log('1. Back up K3 private key offline (paper / password manager / cold storage).')
  console.log('2. Inject K1/K2 + GAS_SPONSOR_PUBKEY_3 into BFF .env and Worker secrets.')
  console.log('3. Transfer sponsor-pool SUI to the multisig address above (not the old single-key address).')
  console.log('4. Keep SURVEY_PASS_ISSUER_PRIV on BFF only (ticket signing); do not put it on Gas Worker.')
  console.log('5. Set GAS_STATION_MODE=do and verify /health + a mint/claim sponsor flow on testnet.')
  console.log('')

  // Sanity: cold pubkey reconstructs same address
  const pk3 = new Ed25519PublicKey(Buffer.from(k3.pubHex, 'hex'))
  const check = MultiSigPublicKey.fromPublicKeys({
    threshold: THRESHOLD,
    publicKeys: [
      { publicKey: k1.keypair.getPublicKey(), weight: 1 },
      { publicKey: k2.keypair.getPublicKey(), weight: 1 },
      { publicKey: pk3, weight: 1 },
    ],
  })
  if (check.toSuiAddress() !== sponsorAddress) {
    throw new Error('Internal error: cold pubkey address mismatch')
  }
}

main()
