import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import type { SponsorSigner } from './signerBackend.js'
import { signAndExecuteWithSponsor } from './signerBackend.js'

const MAX_SPLITS_PER_TX = 100
const SPLIT_TX_GAS_BUDGET = 100_000_000

export interface CoinSplitConfig {
  suiClient: SuiClient
  sponsorSigner: SponsorSigner
  /** Desired number of coins eligible for gas payment (balance >= eligibleMinMist). */
  targetCount: number
  /** Balance of each newly split coin. */
  unitMist: bigint
  /** Coins at or above this balance count toward targetCount (gas budget cap). */
  eligibleMinMist: bigint
  lockedCoinIds?: Set<string>
}

/**
 * Keep the sponsor's gas coin pool topped up: with a single coin, every signed
 * sponsorship locks it for the full TTL and concurrent requests fail with
 * sponsor_coin_unavailable. Splits the largest unlocked coin until targetCount
 * eligible coins exist. Counterpart of checkAndMergeCoins, which recycles
 * spent-down coins back into the source.
 */
export async function checkAndSplitCoins(config: CoinSplitConfig): Promise<boolean> {
  const {
    suiClient,
    sponsorSigner,
    targetCount,
    unitMist,
    eligibleMinMist,
    lockedCoinIds = new Set<string>(),
  } = config

  const sponsorAddress = sponsorSigner.getSponsorAddress()
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
    console.error('[CoinSplit] Failed to fetch coins:', err)
    return false
  }

  // Locked coins still count: they return to the pool when their TTL expires.
  const eligibleCount = allCoins.filter((c) => BigInt(c.balance) >= eligibleMinMist).length
  const deficit = targetCount - eligibleCount
  if (deficit <= 0) return false

  const sourceCoin = [...allCoins]
    .filter((c) => !lockedCoinIds.has(c.coinObjectId))
    .sort((a, b) => {
      const balA = BigInt(a.balance)
      const balB = BigInt(b.balance)
      return balA > balB ? -1 : balA < balB ? 1 : 0
    })[0]
  if (!sourceCoin) return false

  // The source coin pays the splits, the tx gas budget, and keeps a reserve so
  // it stays eligible as a gas coin itself.
  const spendable =
    BigInt(sourceCoin.balance) - unitMist * 2n - BigInt(SPLIT_TX_GAS_BUDGET)
  const affordable = spendable > 0n ? Number(spendable / unitMist) : 0
  const splitCount = Math.min(deficit, affordable, MAX_SPLITS_PER_TX)
  if (splitCount <= 0) {
    console.warn(
      `[CoinSplit] Pool below target (${eligibleCount}/${targetCount}) but largest unlocked coin ` +
        `(${sourceCoin.balance} MIST) cannot fund more splits of ${unitMist} MIST`
    )
    return false
  }

  try {
    const tx = new Transaction()
    tx.setSender(sponsorAddress)
    tx.setGasPayment([
      {
        objectId: sourceCoin.coinObjectId,
        version: sourceCoin.version,
        digest: sourceCoin.digest,
      },
    ])
    tx.setGasBudget(SPLIT_TX_GAS_BUDGET)

    const amounts = Array.from({ length: splitCount }, () => tx.pure.u64(unitMist))
    const newCoins = tx.splitCoins(tx.gas, amounts)
    tx.transferObjects(
      Array.from({ length: splitCount }, (_, i) => newCoins[i]),
      sponsorAddress
    )

    await signAndExecuteWithSponsor(suiClient, sponsorSigner, tx)

    console.log(
      `[CoinSplit] Split ${splitCount} coins of ${unitMist} MIST from ${sourceCoin.coinObjectId} ` +
        `(pool was ${eligibleCount}/${targetCount})`
    )
    return true
  } catch (err) {
    console.error('[CoinSplit] Failed to execute split transaction:', err)
    return false
  }
}
