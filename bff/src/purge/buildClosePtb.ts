import { Transaction } from '@mysten/sui/transactions'

export interface BuildClosePtbParams {
  packageId: string
  vaultId: string
}

/** Sponsor-sent close for vaults past deadline (non-creator path on-chain). */
export function buildClosePtb(p: BuildClosePtbParams): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${p.packageId}::survey_vault::close`,
    arguments: [tx.object(p.vaultId), tx.object('0x6')],
  })
  return tx
}
