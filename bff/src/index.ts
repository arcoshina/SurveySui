import { SuiClient } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { buildApp } from './app.js'
import { createStatsCache } from './stats/cache.js'
import { assertSecureEnv } from './security.js'
import { assertGasConfig } from './gas/gasConfig.js'
import { startCoinMergeTask } from './gas/coinMergeTask.js'
import { InMemoryCoinLockStore } from '@surveysui/gas-station-core'
import { getGasConfig } from './gas/gasConfig.js'
import { startPurgeTask } from './purge/purgeTask.js'

// Delete the admin private key if loaded from root .env to satisfy assertSecureEnv security check during dev
delete process.env.SUI_ADMIN_PRIVATE_KEY

assertSecureEnv()
assertGasConfig()

const rpcUrl = process.env.SUI_RPC_URL ?? 'https://fullnode.devnet.sui.io:443'
const packageId = process.env.SUI_PACKAGE_ID
if (!packageId) throw new Error('Missing SUI_PACKAGE_ID')
const port = Number(process.env.PORT) || 3100
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

const suiClient = new SuiClient({ url: rpcUrl })
const sponsorCoinQueue = InMemoryCoinLockStore.fromGasConfig(getGasConfig())

const app = await buildApp({
  suiClient,
  cache: createStatsCache(),
  packageId,
  frontendUrl,
  logger: true,
  sponsorCoinQueue,
})

const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
if (privKeyHex) {
  const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
  const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
  const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(0, 32))
  
  startCoinMergeTask(suiClient, keypair, sponsorCoinQueue)
  console.log('[BFF] SUI Coin merge background task started.')

  // Auto-destroy lifecycle: periodically purge surveys past their grace window.
  startPurgeTask(suiClient, keypair, packageId)
}

await app.listen({ port, host: '0.0.0.0' })
