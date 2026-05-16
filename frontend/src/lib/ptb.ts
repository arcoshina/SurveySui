import { Transaction } from '@mysten/sui/transactions'

/**
 * CPMM 反向計算：若要從 swap_b_to_a 得到 rwdOut 數量的 coin_a，
 * 需要投入多少 coin_b (SUI)。
 *
 * 合約 compute_amount_out 公式：
 *   amount_out = reserve_out × amount_in × 997 / (reserve_in × 1000 + amount_in × 997)
 *
 * 對 amount_in 求解並取上整（ceiling）：
 *   amount_in = ceil(rwdOut × reserveSui × 1000 / (997 × (reserveRwd − rwdOut)))
 */
export function calcSuiInForRwdOut(
  reserveSui: bigint,
  reserveRwd: bigint,
  rwdOut: bigint,
): bigint {
  if (rwdOut <= 0n) throw new Error('rwdOut 須大於 0')
  if (rwdOut >= reserveRwd) throw new Error('RWD 供應不足，所需數量超過池子儲備')
  const numerator = rwdOut * reserveSui * 1000n
  const denominator = 997n * (reserveRwd - rwdOut)
  return (numerator + denominator - 1n) / denominator
}

export interface EstimateParams {
  perResponseRwd: bigint
  maxResponses: number
  reserveSui: bigint
  reserveRwd: bigint
}

/** 估算完成一次注資 PTB 所需投入的 SUI（MIST 單位） */
export function estimateSuiCost(params: EstimateParams): bigint {
  const { perResponseRwd, maxResponses, reserveSui, reserveRwd } = params
  const totalRwd = perResponseRwd * BigInt(maxResponses)
  return calcSuiInForRwdOut(reserveSui, reserveRwd, totalRwd)
}

export interface BuildPtbParams {
  packageId: string
  poolId: string
  perResponseMist: bigint
  maxResponses: number
  deadlineMs: bigint
  adminAddress: string
  suiToSpend: bigint
}

/**
 * 建構注資 PTB（Programmable Transaction Block）：
 *   1. splitCoins(gas, suiToSpend)               → suiCoin
 *   2. amm_pool::swap_b_to_a(pool, suiCoin)      → rwdCoin
 *   3. survey_vault::create(rwdCoin, params...)   → vault（未 share）
 *   4. survey_vault::share_vault(vault)           → shared object
 *
 * 任一步驟失敗時整筆 transaction 自動 rollback（Sui PTB atomic 語意）。
 */
export function buildFundSurveyPtb(params: BuildPtbParams): Transaction {
  const {
    packageId,
    poolId,
    perResponseMist,
    maxResponses,
    deadlineMs,
    adminAddress,
    suiToSpend,
  } = params

  const tx = new Transaction()

  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(suiToSpend)])

  const [rwdCoin] = tx.moveCall({
    target: `${packageId}::amm_pool::swap_b_to_a`,
    arguments: [tx.object(poolId), suiCoin],
    typeArguments: [
      `${packageId}::reward_coin::REWARD_COIN`,
      '0x2::sui::SUI',
    ],
  })

  const [vault] = tx.moveCall({
    target: `${packageId}::survey_vault::create`,
    arguments: [
      rwdCoin,
      tx.pure.u64(perResponseMist),
      tx.pure.u64(maxResponses),
      tx.pure.u64(deadlineMs),
      tx.pure.address(adminAddress),
    ],
    typeArguments: [`${packageId}::reward_coin::REWARD_COIN`],
  })

  tx.moveCall({
    target: `${packageId}::survey_vault::share_vault`,
    arguments: [vault],
    typeArguments: [`${packageId}::reward_coin::REWARD_COIN`],
  })

  return tx
}
