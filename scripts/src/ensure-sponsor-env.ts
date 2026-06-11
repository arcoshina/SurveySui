/**
 * Generate 2-of-3 multisig gas sponsor keys into root .env when missing.
 * Devnet deploy helper — does not print private keys.
 */
import { randomBytes } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { MultiSigPublicKey } from '@mysten/sui/multisig'
import { mergeEnvFile } from './init.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootEnv = resolve(__dirname, '../../.env')

function hasSponsorKeys(): boolean {
  if (!existsSync(rootEnv)) return false
  const text = readFileSync(rootEnv, 'utf8')
  return (
    /^GAS_SPONSOR_PRIV_1=/m.test(text) &&
    /^GAS_SPONSOR_PRIV_2=/m.test(text) &&
    /^GAS_SPONSOR_PUBKEY_3=/m.test(text)
  )
}

function generateMultisigEnv(): Record<string, string> {
  function gen() {
    const seed = randomBytes(32)
    const kp = Ed25519Keypair.fromSecretKey(seed)
    return {
      priv: Buffer.from(seed).toString('hex'),
      pub: Buffer.from(kp.getPublicKey().toRawBytes()).toString('hex'),
      kp,
    }
  }
  const k1 = gen()
  const k2 = gen()
  const k3 = gen()
  const multisig = MultiSigPublicKey.fromPublicKeys({
    threshold: 2,
    publicKeys: [
      { publicKey: k1.kp.getPublicKey(), weight: 1 },
      { publicKey: k2.kp.getPublicKey(), weight: 1 },
      { publicKey: k3.kp.getPublicKey(), weight: 1 },
    ],
  })
  return {
    GAS_SPONSOR_PRIV_1: k1.priv,
    GAS_SPONSOR_PRIV_2: k2.priv,
    GAS_SPONSOR_PUBKEY_3: k3.pub,
    GAS_SPONSOR_MULTISIG_THRESHOLD: '2',
    GAS_SPONSOR_ADDRESS: multisig.toSuiAddress(),
  }
}

async function main() {
  if (hasSponsorKeys()) {
    const text = readFileSync(rootEnv, 'utf8')
    const m = text.match(/^GAS_SPONSOR_ADDRESS=(.+)$/m)
    console.log(`Sponsor keys already present${m ? ` (${m[1].trim()})` : ''}`)
    return
  }
  const updates = generateMultisigEnv()
  mergeEnvFile(rootEnv, updates)
  console.log(`Generated multisig sponsor keys → GAS_SPONSOR_ADDRESS=${updates.GAS_SPONSOR_ADDRESS}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
