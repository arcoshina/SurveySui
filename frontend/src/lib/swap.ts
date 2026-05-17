import { Transaction } from '@mysten/sui/transactions'

/** CPMM 公式：與合約 compute_amount_out 完全一致（0.3% fee，整數除法取下整） */
export function calcAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): bigint {
  if (amountIn <= 0n) throw new Error('amountIn 須大於 0')
  if (reserveIn <= 0n || reserveOut <= 0n) throw new Error('儲備量不能為零')
  const numerator = reserveOut * amountIn * 997n
  const denominator = reserveIn * 1000n + amountIn * 997n
  return numerator / denominator
}

/** 計算價格影響百分比 (0–100)，與合約 0.3% fee 對齊 */
export function calcPriceImpact(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): number {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0
  const amountOut = calcAmountOut(amountIn, reserveIn, reserveOut)
  if (amountOut <= 0n) return 0
  // price impact = 1 - (amountOut * reserveIn) / (amountIn * reserveOut)
  const ratio =
    (Number(amountOut) * Number(reserveIn)) / (Number(amountIn) * Number(reserveOut))
  return (1 - ratio) * 100
}

export interface BuildSwapPtbParams {
  packageId: string
  poolId: string
  amountIn: bigint
  direction: 'sui_to_rwd' | 'rwd_to_sui'
  senderAddress: string
  rwdCoinId?: string
}

/**
 * 建構 swap PTB：
 * - sui_to_rwd：splitCoins(gas) → swap_b_to_a → transferObjects(RWD, sender)
 * - rwd_to_sui：splitCoins(rwdCoin) → swap_a_to_b → transferObjects(SUI, sender)
 */
export function buildSwapPtb(params: BuildSwapPtbParams): Transaction {
  const { packageId, poolId, amountIn, direction, senderAddress, rwdCoinId } = params
  const rwdType = `${packageId}::reward_coin::REWARD_COIN`
  const suiType = '0x2::sui::SUI'
  const tx = new Transaction()

  if (direction === 'sui_to_rwd') {
    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountIn)])
    const [rwdOut] = tx.moveCall({
      target: `${packageId}::amm_pool::swap_b_to_a`,
      arguments: [tx.object(poolId), suiCoin],
      typeArguments: [rwdType, suiType],
    })
    tx.transferObjects([rwdOut], tx.pure.address(senderAddress))
  } else {
    if (!rwdCoinId) throw new Error('RWD→SUI 需要提供 rwdCoinId')
    const [rwdSplit] = tx.splitCoins(tx.object(rwdCoinId), [tx.pure.u64(amountIn)])
    const [suiOut] = tx.moveCall({
      target: `${packageId}::amm_pool::swap_a_to_b`,
      arguments: [tx.object(poolId), rwdSplit],
      typeArguments: [rwdType, suiType],
    })
    tx.transferObjects([suiOut], tx.pure.address(senderAddress))
  }

  return tx
}
