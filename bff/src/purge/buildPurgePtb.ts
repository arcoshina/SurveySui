import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'

export interface BuildPurgePtbParams {
  packageId: string
  registryId: string
  protocolConfigId: string
  surveyId: string
  vaultId: string
  /** When set with transferAmount, rebate is split from gas and sent to creator. */
  creator?: string
  transferAmount?: bigint
}

export function appendPurgeMoveCall(tx: Transaction, p: BuildPurgePtbParams): void {
  tx.moveCall({
    target: `${p.packageId}::survey_vault::purge`,
    arguments: [
      tx.object(p.registryId),
      tx.object(p.surveyId),
      tx.object(p.vaultId),
      tx.object(p.protocolConfigId),
      tx.object('0x6'),
    ],
  })
}

/** Build a purge PTB, optionally forwarding storage rebate surplus to the creator. */
export function buildPurgePtb(p: BuildPurgePtbParams): Transaction {
  const tx = new Transaction()
  appendPurgeMoveCall(tx, p)

  if (p.creator && p.transferAmount !== undefined && p.transferAmount > 0n) {
    const [rebateCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(p.transferAmount.toString())])
    tx.transferObjects([rebateCoin], p.creator)
  }

  return tx
}

const DEFAULT_GAS_BUDGET_CAP_MIST = 300_000_000n

/** Select a sponsor gas coin and attach it to the transaction. */
export async function prepareGasPayment(
  tx: Transaction,
  suiClient: SuiClient,
  sponsorAddress: string,
  minBalance: bigint = DEFAULT_GAS_BUDGET_CAP_MIST
): Promise<void> {
  const coinsRes = await suiClient.getCoins({
    owner: sponsorAddress,
    coinType: '0x2::sui::SUI',
    limit: 50,
  })

  if (coinsRes.data.length === 0) {
    throw new Error(`Sponsor (${sponsorAddress}) has no SUI coins to pay for gas`)
  }

  const gasCoin = coinsRes.data.find((c) => BigInt(c.balance) >= minBalance)
  if (!gasCoin) {
    throw new Error(
      `Sponsor (${sponsorAddress}) has no SUI coin with balance >= ${minBalance} MIST`
    )
  }

  tx.setGasPayment([
    {
      objectId: gasCoin.coinObjectId,
      version: gasCoin.version,
      digest: gasCoin.digest,
    },
  ])
}

export { DEFAULT_GAS_BUDGET_CAP_MIST }
