import { SuiClient } from '@mysten/sui/client'
import { buildApp } from './app.js'
import { loadSponsorSigner } from './gas/sponsorSigner.js'
import { createStatsCache } from './stats/cache.js'
import { assertSecureEnv } from './security.js'
import { assertGasConfig } from './gas/gasConfig.js'
import { startCoinMergeTask } from './gas/coinMergeTask.js'
import { startCoinPoolTask } from './gas/coinPoolTask.js'
import { InMemoryCoinLockStore } from '@surveysui/gas-station-core'
import { getGasConfig } from './gas/gasConfig.js'
import { startPurgeTask } from './purge/purgeTask.js'
import { startCloseTask } from './purge/closeTask.js'

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

const sponsorSigner = loadSponsorSigner()
if (sponsorSigner) {
  startCoinMergeTask(suiClient, sponsorSigner, sponsorCoinQueue)
  console.log('[BFF] SUI Coin merge background task started.')

  startCoinPoolTask(suiClient, sponsorSigner, sponsorCoinQueue)
  console.log('[BFF] SUI sponsor coin pool background task started.')

  // Lifecycle: close expired OPEN vaults, then purge after grace window.
  startCloseTask(suiClient, sponsorSigner, packageId)
  startPurgeTask(suiClient, sponsorSigner, packageId)
}

await app.listen({ port, host: '0.0.0.0' })
