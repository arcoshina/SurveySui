import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

export class AdminKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdminKeyError'
  }
}

export interface AdminKeyConfig {
  keypair: Ed25519Keypair
  address: string
}

export function loadAndVerifyAdminKey(): AdminKeyConfig {
  const privateKey = process.env.SUI_ADMIN_PRIVATE_KEY
  if (!privateKey) {
    throw new AdminKeyError('Missing required env var: SUI_ADMIN_PRIVATE_KEY')
  }

  const expectedAddress = process.env.SUI_ADMIN_ADDRESS
  if (!expectedAddress) {
    throw new AdminKeyError('Missing required env var: SUI_ADMIN_ADDRESS')
  }

  let keypair: Ed25519Keypair
  try {
    keypair = Ed25519Keypair.fromSecretKey(privateKey)
  } catch (err) {
    throw new AdminKeyError(
      `Invalid SUI_ADMIN_PRIVATE_KEY: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const derivedAddress = keypair.getPublicKey().toSuiAddress()
  if (derivedAddress !== expectedAddress) {
    throw new AdminKeyError(
      `Admin address mismatch: key derives ${derivedAddress} but SUI_ADMIN_ADDRESS is ${expectedAddress}`,
    )
  }

  return { keypair, address: derivedAddress }
}
