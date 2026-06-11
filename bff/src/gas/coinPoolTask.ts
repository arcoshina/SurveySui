import type { SuiClient } from '@mysten/sui/client'
import type { SponsorSigner } from '@surveysui/gas-station-core'
import { checkAndSplitCoins } from '@surveysui/gas-station-core'
import { getGasConfig } from './gasConfig.js'
import type { SponsorCoinQueue } from './sponsorCoinQueue.js'

export { checkAndSplitCoins }

let coinPoolInterval: NodeJS.Timeout | null = null

export function startCoinPoolTask(
  suiClient: SuiClient,
  sponsorSigner: SponsorSigner,
  coinQueue?: SponsorCoinQueue,
  checkIntervalMs?: number
) {
  if (coinPoolInterval) {
    clearInterval(coinPoolInterval)
  }

  const gasConfig = getGasConfig()
  const targetCount = gasConfig.sponsorCoinPoolTarget
  const unitMist = gasConfig.sponsorCoinPoolUnitMist
  const eligibleMinMist = gasConfig.gasBudgetCapMist
  const intervalMs = checkIntervalMs ?? gasConfig.sponsorCoinPoolCheckIntervalMs

  const run = () => {
    checkAndSplitCoins({
      suiClient,
      sponsorSigner,
      targetCount,
      unitMist,
      eligibleMinMist,
      lockedCoinIds: coinQueue?.getLockedCoinIds() ?? new Set(),
    }).catch((err) => {
      console.error('[CoinPoolTask] Error in background task:', err)
    })
  }

  const startupTimeout = setTimeout(run, 5000)
  coinPoolInterval = setInterval(run, intervalMs)

  return () => {
    clearTimeout(startupTimeout)
    if (coinPoolInterval) {
      clearInterval(coinPoolInterval)
      coinPoolInterval = null
    }
  }
}
