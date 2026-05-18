import { SuiClient } from '@mysten/sui/client'
import { buildApp } from './app.js'
import { createStatsCache } from './stats/cache.js'
import { assertSecureEnv } from './security.js'

assertSecureEnv()

const rpcUrl = process.env.SUI_RPC_URL ?? 'https://fullnode.devnet.sui.io:443'
const packageId = process.env.SUI_PACKAGE_ID
if (!packageId) throw new Error('Missing SUI_PACKAGE_ID')
const port = Number(process.env.PORT) || 3100
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

const app = await buildApp({
  suiClient: new SuiClient({ url: rpcUrl }),
  cache: createStatsCache(),
  packageId,
  frontendUrl,
  logger: true,
})
await app.listen({ port, host: '0.0.0.0' })
