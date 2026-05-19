import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { fileURLToPath } from 'node:url'
import { requireEnv } from './env.js'

export const HD_PATHS = [0, 1, 2, 3, 4].map((i) => `m/44'/784'/${i}'/0'/0'`)

export interface DevAccount {
  path: string
  address: string
}

export function deriveAccounts(): DevAccount[] {
  const mnemonic = requireEnv('DEV_MNEMONIC')
  return HD_PATHS.map((path) => {
    const keypair = Ed25519Keypair.deriveKeypair(mnemonic, path)
    return { path, address: keypair.getPublicKey().toSuiAddress() }
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const accounts = deriveAccounts()
  for (const { path, address } of accounts) {
    console.log(`${path}  ${address}`)
  }
}
