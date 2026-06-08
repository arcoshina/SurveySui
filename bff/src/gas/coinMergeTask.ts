import type { SuiClient } from '@mysten/sui/client'
import type { SponsorSigner } from '@surveysui/gas-station-core'
import { checkAndMergeCoins } from '@surveysui/gas-station-core'
import { getGasConfig } from './gasConfig.js'
import type { SponsorCoinQueue } from './sponsorCoinQueue.js'

export { checkAndMergeCoins }

let coinMergeInterval: NodeJS.Timeout | null = null

export function startCoinMergeTask(
  suiClient: SuiClient,
  sponsorSigner: SponsorSigner,
  coinQueue?: SponsorCoinQueue,
  checkIntervalMs?: number
) {
  if (coinMergeInterval) {
    clearInterval(coinMergeInterval)
  }

  const gasConfig = getGasConfig()
  const thresholdMist = gasConfig.coinMergeThresholdMist
  const triggerCount = gasConfig.coinMergeTriggerCount
  const intervalMs = checkIntervalMs ?? gasConfig.coinMergeIntervalMs

  const run = () => {
    checkAndMergeCoins({
      suiClient,
      sponsorSigner,
      thresholdMist,
      triggerCount,
      lockedCoinIds: coinQueue?.getLockedCoinIds() ?? new Set(),
    }).catch((err) => {
      console.error('[CoinMergeTask] Error in background task:', err)
    })
  }

  const startupTimeout = setTimeout(run, 5000)
  coinMergeInterval = setInterval(run, intervalMs)

  return () => {
    clearTimeout(startupTimeout)
    if (coinMergeInterval) {
      clearInterval(coinMergeInterval)
      coinMergeInterval = null
    }
  }
}
