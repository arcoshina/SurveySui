import type { SuiClient } from '@mysten/sui/client'
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { checkAndMergeCoins } from '@surveysui/gas-station-core'
import { getGasConfig } from './gasConfig.js'
import type { SponsorCoinQueue } from './sponsorCoinQueue.js'

export { checkAndMergeCoins }

let coinMergeInterval: NodeJS.Timeout | null = null

export function startCoinMergeTask(
  suiClient: SuiClient,
  keypair: Ed25519Keypair,
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
      sponsorKeypair: keypair,
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
