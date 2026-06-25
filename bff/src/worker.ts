import { SuiClient } from '@mysten/sui/client'
import { InMemoryCoinLockStore } from '@surveysui/gas-station-core'
import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types'
import { buildApp, type BffApp } from './app.js'
import { setD1 } from './d1.js'
import { setGasStationFetcher } from './gas/gasStationBinding.js'
import { ensureBffSchema } from './security/db.js'
import { assertSecureEnv } from './security.js'
import { getGasConfig } from './gas/gasConfig.js'
import { loadSponsorSigner } from './gas/sponsorSigner.js'
import { checkAndMergeCoins } from './gas/coinMergeTask.js'
import { checkAndSplitCoins } from './gas/coinPoolTask.js'
import { checkAndClose } from './purge/closeTask.js'
import { checkAndPurge } from './purge/purgeTask.js'
import type { BffEnv } from './env.js'

interface Runtime {
  app: BffApp
  suiClient: SuiClient
  coinQueue: InMemoryCoinLockStore
  packageId: string
}

let runtime: Runtime | null = null

/** 每個 isolate 惰性建構一次（SuiClient / coin queue / Hono app）。env.DB 另由 setD1 每請求更新。 */
function getRuntime(): Runtime {
  if (runtime) return runtime
  assertSecureEnv()
  const rpcUrl = process.env.SUI_RPC_URL ?? 'https://fullnode.testnet.sui.io:443'
  const packageId = process.env.SUI_PACKAGE_ID
  if (!packageId) throw new Error('Missing SUI_PACKAGE_ID')
  const frontendUrl = process.env.FRONTEND_URL
  if (!frontendUrl) throw new Error('Missing FRONTEND_URL')
  const suiClient = new SuiClient({ url: rpcUrl })
  const coinQueue = InMemoryCoinLockStore.fromGasConfig(getGasConfig())
  const app = buildApp({
    suiClient,
    packageId,
    frontendUrl,
    sponsorCoinQueue: coinQueue,
  })
  runtime = { app, suiClient, coinQueue, packageId }
  return runtime
}

export default {
  async fetch(request: Request, env: BffEnv): Promise<Response> {
    setD1(env.DB)
    if (env.GAS_STATION) setGasStationFetcher(env.GAS_STATION)
    return getRuntime().app.fetch(request)
  },

  // Cron Triggers（取代原 setInterval 背景任務）。依 event.cron 分派頻率。
  async scheduled(event: ScheduledController, env: BffEnv, _ctx: ExecutionContext): Promise<void> {
    setD1(env.DB)
    await ensureBffSchema()
    const { suiClient, coinQueue, packageId } = getRuntime()
    const signer = loadSponsorSigner()
    if (!signer) {
      console.warn('[Cron] No sponsor signer configured; skipping maintenance tasks.')
      return
    }
    const gasConfig = getGasConfig()
    const lockedCoinIds = coinQueue.getLockedCoinIds()

    // 高頻（*/10 * * * *）：coin 池維護（合併 / 切分）。
    if (event.cron === '*/10 * * * *') {
      await checkAndMergeCoins({
        suiClient,
        sponsorSigner: signer,
        thresholdMist: gasConfig.coinMergeThresholdMist,
        triggerCount: gasConfig.coinMergeTriggerCount,
        lockedCoinIds,
      }).catch((e) => console.error('[Cron] coin merge failed', e))

      await checkAndSplitCoins({
        suiClient,
        sponsorSigner: signer,
        targetCount: gasConfig.sponsorCoinPoolTarget,
        unitMist: gasConfig.sponsorCoinPoolUnitMist,
        eligibleMinMist: gasConfig.gasBudgetCapMist,
        lockedCoinIds,
      }).catch((e) => console.error('[Cron] coin split failed', e))
      return
    }

    // 低頻（0 */6 * * *）：生命週期 close → purge（env 旗標把關；maxPerCycle 有界推進）。
    if (event.cron === '0 */6 * * *') {
      if (process.env.CLOSE_TASK_ENABLED === 'true') {
        await checkAndClose({
          suiClient,
          sponsorSigner: signer,
          packageId,
          maxPerCycle: Number(process.env.CLOSE_MAX_PER_CYCLE ?? '10'),
        }).catch((e) => console.error('[Cron] close failed', e))
      }
      if (process.env.PURGE_TASK_ENABLED === 'true') {
        const registryId = process.env.SURVEY_REGISTRY_ID
        const protocolConfigId = process.env.PROTOCOL_CONFIG_ID
        if (registryId && protocolConfigId) {
          await checkAndPurge({
            suiClient,
            sponsorSigner: signer,
            packageId,
            registryId,
            protocolConfigId,
            maxPerCycle: Number(process.env.PURGE_MAX_PER_CYCLE ?? '10'),
          }).catch((e) => console.error('[Cron] purge failed', e))
        } else {
          console.warn('[Cron] PURGE enabled but SURVEY_REGISTRY_ID / PROTOCOL_CONFIG_ID missing.')
        }
      }
    }
  },
}
