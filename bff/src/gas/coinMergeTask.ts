import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

export interface CoinMergeConfig {
  suiClient: SuiClient
  sponsorKeypair: Ed25519Keypair
  thresholdMist?: bigint
  triggerCount?: number
}

export async function checkAndMergeCoins(config: CoinMergeConfig): Promise<boolean> {
  const {
    suiClient,
    sponsorKeypair,
    thresholdMist = 100_000_000n, // 0.1 SUI = 100M MIST
    triggerCount = 50,
  } = config

  const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress()

  // 1. Fetch all SUI coins owned by sponsor
  const allCoins: any[] = []
  let cursor: string | null | undefined = undefined

  try {
    do {
      const res: any = await suiClient.getCoins({
        owner: sponsorAddress,
        coinType: '0x2::sui::SUI',
        cursor,
      })
      allCoins.push(...res.data)
      cursor = res.hasNextPage ? res.nextCursor : null
    } while (cursor)
  } catch (err) {
    console.error('[CoinMergeTask] Failed to fetch coins:', err)
    return false
  }

  if (allCoins.length === 0) {
    return false
  }

  // 2. Sort coins by balance descending
  const sortedCoins = [...allCoins].sort((a, b) => {
    const balA = BigInt(a.balance)
    const balB = BigInt(b.balance)
    return balA > balB ? -1 : balA < balB ? 1 : 0
  })

  // 3. Set the largest coin as the Gas payment coin to avoid conflicts
  const gasCoin = sortedCoins[0]

  // 4. Filter small coins (must be smaller than threshold and not the gasCoin)
  const smallCoins = sortedCoins
    .slice(1)
    .filter((c) => BigInt(c.balance) <= thresholdMist)

  // 5. Trigger merging only if count is equal or greater than triggerCount
  if (smallCoins.length < triggerCount) {
    return false
  }

  try {
    const tx = new Transaction()
    tx.setSender(sponsorAddress)
    tx.setGasPayment([
      {
        objectId: gasCoin.coinObjectId,
        version: gasCoin.version,
        digest: gasCoin.digest,
      },
    ])
    tx.setGasBudget(20_000_000) // 0.02 SUI budget

    // Choose the first small coin as the primary coin to merge others into
    const primaryCoinId = smallCoins[0].coinObjectId
    // Limit to 100 coins to merge per transaction to prevent size/gas limit errors
    const mergeTargets = smallCoins.slice(1, 101).map((c) => c.coinObjectId)

    tx.mergeCoins(
      tx.object(primaryCoinId),
      mergeTargets.map((id) => tx.object(id))
    )

    await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: sponsorKeypair,
    })

    console.log(
      `[CoinMergeTask] Successfully merged ${mergeTargets.length + 1} SUI coins into ${primaryCoinId}`
    )
    return true
  } catch (err) {
    console.error('[CoinMergeTask] Failed to execute coin merge transaction:', err)
    return false
  }
}

let coinMergeInterval: NodeJS.Timeout | null = null

export function startCoinMergeTask(
  suiClient: SuiClient,
  keypair: Ed25519Keypair,
  checkIntervalMs = 3600_000 // default to 1 hour
) {
  if (coinMergeInterval) {
    clearInterval(coinMergeInterval)
  }

  const thresholdMist = process.env.COIN_MERGE_THRESHOLD_SUI
    ? BigInt(parseFloat(process.env.COIN_MERGE_THRESHOLD_SUI) * 1_000_000_000)
    : 100_000_000n
  const triggerCount = process.env.COIN_MERGE_TRIGGER_COUNT
    ? parseInt(process.env.COIN_MERGE_TRIGGER_COUNT, 10)
    : 50

  const run = () => {
    checkAndMergeCoins({
      suiClient,
      sponsorKeypair: keypair,
      thresholdMist,
      triggerCount,
    }).catch((err) => {
      console.error('[CoinMergeTask] Error in background task:', err)
    })
  }

  // Delay first execution to avoid startup congestion
  const startupTimeout = setTimeout(run, 5000)

  coinMergeInterval = setInterval(run, checkIntervalMs)

  return () => {
    clearTimeout(startupTimeout)
    if (coinMergeInterval) {
      clearInterval(coinMergeInterval)
      coinMergeInterval = null
    }
  }
}
