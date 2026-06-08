import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

export interface CoinMergeConfig {
  suiClient: SuiClient
  sponsorKeypair: Ed25519Keypair
  thresholdMist?: bigint
  triggerCount?: number
  lockedCoinIds?: Set<string>
}

export async function checkAndMergeCoins(config: CoinMergeConfig): Promise<boolean> {
  const {
    suiClient,
    sponsorKeypair,
    thresholdMist = 100_000_000n,
    triggerCount = 50,
    lockedCoinIds = new Set<string>(),
  } = config

  const sponsorAddress = sponsorKeypair.getPublicKey().toSuiAddress()
  const allCoins: Awaited<ReturnType<SuiClient['getCoins']>>['data'] = []
  let cursor: string | null | undefined = undefined

  try {
    do {
      const res = await suiClient.getCoins({
        owner: sponsorAddress,
        coinType: '0x2::sui::SUI',
        cursor,
      })
      allCoins.push(...res.data)
      cursor = res.hasNextPage ? res.nextCursor : null
    } while (cursor)
  } catch (err) {
    console.error('[CoinMerge] Failed to fetch coins:', err)
    return false
  }

  if (allCoins.length === 0) return false

  const sortedCoins = [...allCoins].sort((a, b) => {
    const balA = BigInt(a.balance)
    const balB = BigInt(b.balance)
    return balA > balB ? -1 : balA < balB ? 1 : 0
  })

  const gasCoin = sortedCoins.find((c) => !lockedCoinIds.has(c.coinObjectId))
  if (!gasCoin) return false

  const smallCoins = sortedCoins
    .filter((c) => c.coinObjectId !== gasCoin.coinObjectId)
    .filter((c) => !lockedCoinIds.has(c.coinObjectId))
    .filter((c) => BigInt(c.balance) <= thresholdMist)

  if (smallCoins.length < triggerCount) return false

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
    tx.setGasBudget(20_000_000)

    const primaryCoinId = smallCoins[0].coinObjectId
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
      `[CoinMerge] Merged ${mergeTargets.length + 1} SUI coins into ${primaryCoinId}`
    )
    return true
  } catch (err) {
    console.error('[CoinMerge] Failed to execute merge transaction:', err)
    return false
  }
}
