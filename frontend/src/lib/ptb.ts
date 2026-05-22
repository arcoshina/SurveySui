import { Transaction } from '@mysten/sui/transactions'

// ── bonding curve constants ───────────────────────────────────────────────────

/** Mirrors `amm_pool::BONDING_DECAY` (1e12 MIST = 1000 SUI). */
export const BONDING_DECAY = 1_000_000_000_000n

/** Mirrors `amm_pool::INITIAL_SSR_PER_SUI` (1 MIST → 1000 SSR base at total=0). */
export const INITIAL_SSR_PER_SUI = 1000n

/** Vault fee in basis points (mirrors `survey_vault::VAULT_FEE_BPS`). */
export const VAULT_FEE_BPS = 30n

/** SSR & SR coins both use 9 decimals. */
export const SSR_BASE_PER_UNIT = 1_000_000_000n

// ── estimate fund cost ────────────────────────────────────────────────────────

export interface EstimateFundCostParams {
  /** SSR per response, integer in human units. */
  perResponse: bigint
  /** Max responses (quota). */
  maxResponses: number
  /** Current `Pool.total_sui_invested` in MIST. */
  totalSuiInvested: bigint
}

export interface EstimateFundCostResult {
  /** Total SSR (base units) the vault must hold to satisfy quota. */
  netSsrBase: bigint
  /** Gross SSR (base units) to mint via invest_and_mint (before vault fee). */
  grossSsrBase: bigint
  /** Vault fee deducted on `survey_vault::create` (base units). */
  vaultFeeBase: bigint
  /** SUI (MIST) to invest into the pool to receive `grossSsrBase` SSR. */
  suiToInvest: bigint
}

/**
 * Estimate funding cost for a survey vault.
 *
 * Bonding curve: `ssr_out = sui_in * INITIAL_SSR_PER_SUI * DECAY / (DECAY + total_sui_invested)`.
 * Inverse:       `sui_in   = ceil(ssr_out * (DECAY + total) / (DECAY * INITIAL_SSR_PER_SUI))`.
 *
 * Vault charges 30 bps on deposit → mint enough gross SSR so that after
 * the fee the vault still holds at least `perResponse * maxResponses` SSR.
 */
export function estimateFundCost(p: EstimateFundCostParams): EstimateFundCostResult {
  const netSsrBase = p.perResponse * BigInt(p.maxResponses) * SSR_BASE_PER_UNIT

  // grossSsr = ceil(net * 10000 / 9970)
  const grossSsrBase = (netSsrBase * 10_000n + 9_970n - 1n) / 9_970n
  const vaultFeeBase = (grossSsrBase * VAULT_FEE_BPS) / 10_000n

  // suiToInvest = ceil(gross * (DECAY + total) / (DECAY * INITIAL_SSR_PER_SUI))
  const denom = BONDING_DECAY * INITIAL_SSR_PER_SUI
  const numer = grossSsrBase * (BONDING_DECAY + p.totalSuiInvested)
  const suiToInvest = (numer + denom - 1n) / denom

  return { netSsrBase, grossSsrBase, vaultFeeBase, suiToInvest }
}

// ── estimate fund cost V2 ─────────────────────────────────────────────────────

export interface EstimateFundCostV2Params {
  /** SSR per response, integer in human units. */
  perResponse: bigint
  /** Max responses (quota). */
  maxResponses: number
  /** Current `Pool.total_sui_invested` in MIST. */
  totalSuiInvested: bigint
  /** FeeConfig parameters from Pool. */
  feeConfig: {
    totalFeeBps: bigint
    discountBps: bigint
  }
  /** Creator's current SSR balance in base units. */
  creatorSsrBalance: bigint
}

export interface EstimateFundCostV2Result {
  /** Total SSR (base units) the vault must hold to satisfy quota. */
  netSsrBase: bigint
  /** Effective fee in basis points. */
  effectiveFeeBps: bigint
  /** Gross SSR (base units) the vault needs to have before fee split. */
  grossSsrBase: bigint
  /** SSR (base units) from creator's balance used as offset. */
  offsetIn: bigint
  /** New SSR (base units) to mint. */
  minted: bigint
  /** SUI (MIST) to invest into the pool to mint `minted` SSR. */
  suiToInvest: bigint
}

/**
 * Estimate funding cost V2 for a survey vault.
 * Handles existing SSR balance offset and fee config from pool.
 */
export function estimateFundCostV2(p: EstimateFundCostV2Params): EstimateFundCostV2Result {
  const netSsrBase = p.perResponse * BigInt(p.maxResponses) * SSR_BASE_PER_UNIT
  const effectiveFeeBps = (p.feeConfig.totalFeeBps * p.feeConfig.discountBps) / 10000n

  if (effectiveFeeBps >= 10000n) {
    throw new Error('Effective fee rate cannot be 100% or more')
  }

  // Calculate the required gross SSR
  // grossSsrBase - (grossSsrBase * effectiveFeeBps / 10000n) >= netSsrBase
  let grossSsrBase = (netSsrBase * 10000n) / (10000n - effectiveFeeBps)
  while (grossSsrBase - (grossSsrBase * effectiveFeeBps) / 10000n < netSsrBase) {
    grossSsrBase++
  }

  let offsetIn = 0n
  let minted = 0n

  if (p.creatorSsrBalance >= grossSsrBase) {
    offsetIn = grossSsrBase
    minted = 0n
  } else {
    offsetIn = p.creatorSsrBalance
    minted = grossSsrBase - offsetIn
  }

  let suiToInvest = 0n
  if (minted > 0n) {
    const denom = BONDING_DECAY * INITIAL_SSR_PER_SUI
    const numer = minted * (BONDING_DECAY + p.totalSuiInvested)
    suiToInvest = (numer + denom - 1n) / denom
  }

  return {
    netSsrBase,
    effectiveFeeBps,
    grossSsrBase,
    offsetIn,
    minted,
    suiToInvest,
  }
}

// ── build PTB ─────────────────────────────────────────────────────────────────

export interface BuildCreateSurveyPtbParams {
  packageId: string
  poolId: string
  srTreasuryId: string
  ssrTreasuryId: string
  registryId: string
  /** Address that receives the vault deposit fee. */
  adminTreasury: string
  /** SSR per response, integer in human units. */
  perResponse: bigint
  maxResponses: number
  deadlineMs: bigint
  /** Encrypted survey blob to store in `survey_registry::register`. */
  encryptedContent: Uint8Array
  /** MIST amount of SUI to invest into the pool. */
  suiToSpend: bigint
  /** 身分門檻：0 無門檻，1-3 對應 KYC tier。預設 0 以維持既有測試呼叫相容。 */
  minTier?: number

  // V2 specific parameters (optional for backward compatibility in tests)
  contentHash?: Uint8Array
  schemaHash?: Uint8Array
  creatorPubKey?: Uint8Array
  questions?: Array<{
    id: string
    type: string
    prompt: string
    options_json: string[] | null
    required: boolean
  }>
  offsetIn?: bigint
  creatorSsrCoins?: { coinObjectId: string; balance: string }[]
}

/**
 * One-click V2 7-Step PTB:
 *   1. survey_vault::create_empty                                          → vault
 *   2. survey_vault::deposit_existing_ssr(vault, offsetCoin)
 *   3. amm_pool::invest_and_mint (if suiToSpend > 0)                       → mintedCoin
 *   4. survey_vault::merge_balances(vault, mintedCoin)
 *   5. survey_vault::split_fee_to_treasury(vault, feeConfig)
 *   6. survey_registry::register(registry, vaultId, contentHash, ...)
 *   7. survey_vault::share_vault(vault)
 */
export function buildCreateSurveyPtb(p: BuildCreateSurveyPtbParams): Transaction {
  const tx = new Transaction()

  const contentHash = p.contentHash || new Uint8Array(32)
  const schemaHash = p.schemaHash || new Uint8Array(32)
  const creatorPubKey = p.creatorPubKey || new Uint8Array(0)
  const questions = p.questions || []
  const offsetIn = p.offsetIn || 0n
  const creatorSsrCoins = p.creatorSsrCoins || []

  // 1. Create empty vault
  const [vault] = tx.moveCall({
    target: `${p.packageId}::survey_vault::create_empty`,
    arguments: [
      tx.pure.u64(p.perResponse * SSR_BASE_PER_UNIT),
      tx.pure.u64(p.maxResponses),
      tx.pure.u64(p.deadlineMs),
      tx.pure.address(p.adminTreasury),
    ],
  })

  // 2. Deposit existing SSR offset
  let offsetCoinInput
  if (offsetIn > 0n) {
    if (creatorSsrCoins.length === 0) {
      throw new Error('No SSR coins available for offset')
    }
    const sortedCoins = [...creatorSsrCoins].sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))
    const totalAvailable = sortedCoins.reduce((sum, c) => sum + BigInt(c.balance), 0n)
    if (totalAvailable < offsetIn) {
      throw new Error(`Insufficient SSR balance. Required: ${offsetIn}, Available: ${totalAvailable}`)
    }

    const primaryCoinId = sortedCoins[0].coinObjectId
    const primaryCoinInput = tx.object(primaryCoinId)

    let currentSum = BigInt(sortedCoins[0].balance)
    const coinsToMerge: string[] = []
    for (let i = 1; i < sortedCoins.length; i++) {
      if (currentSum >= offsetIn) break
      coinsToMerge.push(sortedCoins[i].coinObjectId)
      currentSum += BigInt(sortedCoins[i].balance)
    }

    if (coinsToMerge.length > 0) {
      tx.mergeCoins(primaryCoinInput, coinsToMerge.map((id) => tx.object(id)))
    }

    const [splitCoin] = tx.splitCoins(primaryCoinInput, [tx.pure.u64(offsetIn)])
    offsetCoinInput = splitCoin
  } else {
    const [zeroCoin] = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [`${p.packageId}::stacked_survey_reward::STACKED_SURVEY_REWARD`],
    })
    offsetCoinInput = zeroCoin
  }

  tx.moveCall({
    target: `${p.packageId}::survey_vault::deposit_existing_ssr`,
    arguments: [vault, offsetCoinInput],
  })

  // 3. Invest & Mint new SSR
  let mintedCoin
  if (p.suiToSpend > 0n) {
    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(p.suiToSpend)])
    const [newSsrCoin] = tx.moveCall({
      target: `${p.packageId}::amm_pool::invest_and_mint`,
      arguments: [
        tx.object(p.poolId),
        tx.object(p.srTreasuryId),
        tx.object(p.ssrTreasuryId),
        suiCoin,
      ],
    })
    mintedCoin = newSsrCoin
  } else {
    const [zeroSsr] = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [`${p.packageId}::stacked_survey_reward::STACKED_SURVEY_REWARD`],
    })
    mintedCoin = zeroSsr
  }

  // 4. Merge balances
  tx.moveCall({
    target: `${p.packageId}::survey_vault::merge_balances`,
    arguments: [vault, mintedCoin],
  })

  // 5. Split fee to treasury
  tx.moveCall({
    target: `${p.packageId}::survey_vault::split_fee_to_treasury`,
    arguments: [vault, tx.object(p.poolId)],
  })

  // Build questions vector
  const questionsArgs = questions.map((q) => {
    return tx.moveCall({
      target: `${p.packageId}::survey_registry::new_question`,
      arguments: [
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(q.id))),
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(q.type))),
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(q.prompt))),
        tx.pure.vector('vector<u8>', (q.options_json || []).map((opt) => Array.from(new TextEncoder().encode(opt)))),
        tx.pure.bool(q.required),
      ],
    })
  })

  const questionsVec = tx.makeMoveVec({
    type: `${p.packageId}::survey_registry::Question`,
    elements: questionsArgs,
  })

  // 6. Register survey
  tx.moveCall({
    target: `${p.packageId}::survey_registry::register`,
    arguments: [
      tx.object(p.registryId),
      vault,
      tx.pure.vector('u8', Array.from(contentHash)),
      tx.pure.vector('u8', Array.from(p.encryptedContent)),
      tx.pure.vector('u8', Array.from(schemaHash)),
      tx.pure.vector('u8', Array.from(creatorPubKey)),
      questionsVec,
      tx.pure.u8(p.minTier ?? 0),
      tx.object('0x6'), // Clock
    ],
  })

  // 7. Share vault
  tx.moveCall({
    target: `${p.packageId}::survey_vault::share_vault`,
    arguments: [vault],
  })

  return tx
}

// ── build redeem PTB ──────────────────────────────────────────────────────────

export interface BuildRedeemPtbParams {
  packageId: string
  poolId: string
  ssrTreasuryId: string
  ssrCoinId: string
  senderAddress: string
}

/**
 * Build redeem PTB:
 *   1. amm_pool::redeem(pool, ssrTreasury, ssrCoin) -> srCoin
 *   2. transferObjects([srCoin], senderAddress)
 */
export function buildRedeemPtb(p: BuildRedeemPtbParams): Transaction {
  const tx = new Transaction()

  const [srCoin] = tx.moveCall({
    target: `${p.packageId}::amm_pool::redeem`,
    arguments: [
      tx.object(p.poolId),
      tx.object(p.ssrTreasuryId),
      tx.object(p.ssrCoinId),
    ],
  })

  tx.transferObjects([srCoin], tx.pure.address(p.senderAddress))

  return tx
}

// ── build close PTB ───────────────────────────────────────────────────────────

export interface BuildClosePtbParams {
  packageId: string
  vaultId: string
}

/**
 * Build close PTB for the survey creator:
 *   1. survey_vault::close(vault, clock)
 *
 * `close` refunds the remaining SSR balance back to `vault.creator` on-chain,
 * records the close timestamp, and emits `SurveyClosed`.
 */
export function buildClosePtb(p: BuildClosePtbParams): Transaction {
  const tx = new Transaction()

  tx.moveCall({
    target: `${p.packageId}::survey_vault::close`,
    arguments: [tx.object(p.vaultId), tx.object('0x6')],
  })

  return tx
}

// ── effects extraction ────────────────────────────────────────────────────────

export interface ObjectChangeLike {
  type: string
  objectId?: string
  objectType?: string
}

function findCreatedBySuffix(
  changes: readonly ObjectChangeLike[] | undefined,
  suffix: string,
): string | null {
  if (!changes) return null
  const hit = changes.find(
    (c) =>
      c.type !== 'deleted' &&
      typeof c.objectType === 'string' &&
      c.objectType.endsWith(suffix),
  )
  return hit?.objectId ?? null
}

/** Extract the newly-created SurveyVault object ID from `objectChanges`. */
export function extractVaultIdFromEffects(
  objectChanges: readonly ObjectChangeLike[] | undefined,
): string | null {
  return findCreatedBySuffix(objectChanges, '::survey_vault::SurveyVault')
}

/** Extract the newly-created Survey object ID from `objectChanges`. */
export function extractSurveyIdFromEffects(
  objectChanges: readonly ObjectChangeLike[] | undefined,
): string | null {
  return findCreatedBySuffix(objectChanges, '::survey_registry::Survey')
}

// ── SurveyPass PTB helpers ───────────────────────────────────────────────────

export interface BuildMintPassPtbParams {
  packageId: string
  registryId: string
  configId: string
  owner: string
  source: number
  nullifierHash: Uint8Array
  commitment: Uint8Array
  expiresAt: bigint | string
  bffSig: Uint8Array
}

/**
 * Builds a PTB to mint a new SurveyPass.
 */
export function buildMintPassPtb(p: BuildMintPassPtbParams): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${p.packageId}::survey_pass::mint_pass`,
    arguments: [
      tx.object(p.registryId),
      tx.object(p.configId),
      tx.pure.address(p.owner),
      tx.pure.u8(p.source),
      tx.pure.vector('u8', Array.from(p.nullifierHash)),
      tx.pure.vector('u8', Array.from(p.commitment)),
      tx.pure.u64(BigInt(p.expiresAt).toString()),
      tx.pure.vector('u8', Array.from(p.bffSig)),
      tx.object('0x6'), // Clock
    ],
  })
  return tx
}

export interface BuildUpdatePassCredentialPtbParams {
  packageId: string
  passId: string
  registryId: string
  configId: string
  source: number
  nullifierHash: Uint8Array
  commitment: Uint8Array
  expiresAt: bigint | string
  bffSig: Uint8Array
}

/**
 * Builds a PTB to update credentials on an existing SurveyPass.
 */
export function buildUpdatePassCredentialPtb(p: BuildUpdatePassCredentialPtbParams): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${p.packageId}::survey_pass::update_pass_credential`,
    arguments: [
      tx.object(p.passId),
      tx.object(p.registryId),
      tx.object(p.configId),
      tx.pure.u8(p.source),
      tx.pure.vector('u8', Array.from(p.nullifierHash)),
      tx.pure.vector('u8', Array.from(p.commitment)),
      tx.pure.u64(BigInt(p.expiresAt).toString()),
      tx.pure.vector('u8', Array.from(p.bffSig)),
      tx.object('0x6'), // Clock
    ],
  })
  return tx
}

export interface BuildDeletePassPtbParams {
  packageId: string
  registryId: string
  passId: string
}

/**
 * Builds a PTB to permanently delete a revoked SurveyPass.
 */
export function buildDeletePassPtb(p: BuildDeletePassPtbParams): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${p.packageId}::survey_pass::delete_pass`,
    arguments: [tx.object(p.registryId), tx.object(p.passId)],
  })
  return tx
}
