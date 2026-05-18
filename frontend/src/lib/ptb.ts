import { Transaction } from '@mysten/sui/transactions'

// ── bonding curve constants ───────────────────────────────────────────────────

/** Mirrors `amm_pool::BONDING_DECAY` (1e12 MIST = 1000 SUI). */
export const BONDING_DECAY = 1_000_000_000_000n

/** Vault fee in basis points (mirrors `survey_vault::VAULT_FEE_BPS`). */
export const VAULT_FEE_BPS = 30n

/** sSSR & SSR coins both use 9 decimals. */
export const SSSR_BASE_PER_UNIT = 1_000_000_000n

// ── estimate fund cost ────────────────────────────────────────────────────────

export interface EstimateFundCostParams {
  /** sSSR per response, integer in human units. */
  perResponse: bigint
  /** Max responses (quota). */
  maxResponses: number
  /** Current `Pool.total_sui_invested` in MIST. */
  totalSuiInvested: bigint
}

export interface EstimateFundCostResult {
  /** Total sSSR (base units) the vault must hold to satisfy quota. */
  netSssrBase: bigint
  /** Gross sSSR (base units) to mint via invest_and_mint (before vault fee). */
  grossSssrBase: bigint
  /** Vault fee deducted on `survey_vault::create` (base units). */
  vaultFeeBase: bigint
  /** SUI (MIST) to invest into the pool to receive `grossSssrBase` sSSR. */
  suiToInvest: bigint
}

/**
 * Estimate funding cost for a survey vault.
 *
 * Bonding curve: `sssr_out = sui_in * DECAY / (DECAY + total_sui_invested)`.
 * Inverse:       `sui_in   = ceil(sssr_out * (DECAY + total) / DECAY)`.
 *
 * Vault charges 30 bps on deposit → mint enough gross sSSR so that after
 * the fee the vault still holds at least `perResponse * maxResponses` sSSR.
 */
export function estimateFundCost(p: EstimateFundCostParams): EstimateFundCostResult {
  const netSssrBase = p.perResponse * BigInt(p.maxResponses) * SSSR_BASE_PER_UNIT

  // grossSssr = ceil(net * 10000 / 9970)
  const grossSssrBase = (netSssrBase * 10_000n + 9_970n - 1n) / 9_970n
  const vaultFeeBase = (grossSssrBase * VAULT_FEE_BPS) / 10_000n

  // suiToInvest = ceil(gross * (DECAY + total) / DECAY)
  const denom = BONDING_DECAY
  const numer = grossSssrBase * (BONDING_DECAY + p.totalSuiInvested)
  const suiToInvest = (numer + denom - 1n) / denom

  return { netSssrBase, grossSssrBase, vaultFeeBase, suiToInvest }
}

// ── build PTB ─────────────────────────────────────────────────────────────────

export interface BuildCreateSurveyPtbParams {
  packageId: string
  poolId: string
  ssrTreasuryId: string
  sssrTreasuryId: string
  registryId: string
  /** Address that receives the 0.3% vault deposit fee. */
  adminTreasury: string
  /** sSSR per response, integer in human units. */
  perResponse: bigint
  maxResponses: number
  deadlineMs: bigint
  /** Encrypted survey blob to store in `survey_registry::register`. */
  encryptedContent: Uint8Array
  /** MIST amount of SUI to invest into the pool. */
  suiToSpend: bigint
}

/**
 * One-click PTB:
 *   1. splitCoins(gas, suiToSpend)                                        → suiCoin
 *   2. amm_pool::invest_and_mint(pool, ssrT, sssrT, suiCoin)              → sssrCoin
 *   3. survey_vault::create(sssrCoin, per, max, deadline, adminTreasury)   → vault
 *   4. survey_vault::id_of(&vault)                                         → vaultId
 *   5. survey_registry::register(registry, vaultId, encryptedContent, clk)
 *   6. survey_vault::share_vault(vault)
 *
 * The three logical steps the spec cares about are 2/3/5
 * (invest_and_mint → create → register); steps 1/4/6 are PTB plumbing.
 */
export function buildCreateSurveyPtb(p: BuildCreateSurveyPtbParams): Transaction {
  const tx = new Transaction()

  // 1. carve SUI out of gas
  const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(p.suiToSpend)])

  // 2. invest SUI → mint sSSR
  const [sssrCoin] = tx.moveCall({
    target: `${p.packageId}::amm_pool::invest_and_mint`,
    arguments: [
      tx.object(p.poolId),
      tx.object(p.ssrTreasuryId),
      tx.object(p.sssrTreasuryId),
      suiCoin,
    ],
  })

  // 3. deposit sSSR into a new vault (returns unshared SurveyVault)
  const [vault] = tx.moveCall({
    target: `${p.packageId}::survey_vault::create`,
    arguments: [
      sssrCoin,
      tx.pure.u64(p.perResponse * SSSR_BASE_PER_UNIT),
      tx.pure.u64(p.maxResponses),
      tx.pure.u64(p.deadlineMs),
      tx.pure.address(p.adminTreasury),
    ],
  })

  // 4. read the vault's on-chain ID so we can pass it to register
  const [vaultIdValue] = tx.moveCall({
    target: `${p.packageId}::survey_vault::id_of`,
    arguments: [vault],
  })

  // 5. register survey with encrypted content blob
  tx.moveCall({
    target: `${p.packageId}::survey_registry::register`,
    arguments: [
      tx.object(p.registryId),
      vaultIdValue,
      tx.pure.vector('u8', Array.from(p.encryptedContent)),
      tx.object('0x6'), // Clock
    ],
  })

  // 6. share the vault so respondents can call `claim` on it
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
  sssrTreasuryId: string
  sssrCoinId: string
  senderAddress: string
}

/**
 * Build redeem PTB:
 *   1. amm_pool::redeem(pool, sssrTreasury, sssrCoin) -> ssrCoin
 *   2. transferObjects([ssrCoin], senderAddress)
 */
export function buildRedeemPtb(p: BuildRedeemPtbParams): Transaction {
  const tx = new Transaction()

  const [ssrCoin] = tx.moveCall({
    target: `${p.packageId}::amm_pool::redeem`,
    arguments: [
      tx.object(p.poolId),
      tx.object(p.sssrTreasuryId),
      tx.object(p.sssrCoinId),
    ],
  })

  tx.transferObjects([ssrCoin], tx.pure.address(p.senderAddress))

  return tx
}

// ── build close PTB ───────────────────────────────────────────────────────────

export interface BuildClosePtbParams {
  packageId: string
  vaultId: string
}

/**
 * Build close PTB for the survey creator:
 *   1. survey_vault::close(vault)
 *
 * `close` refunds the remaining sSSR balance back to `vault.creator` on-chain,
 * so the transaction simply needs the shared vault — no transfer step needed.
 */
export function buildClosePtb(p: BuildClosePtbParams): Transaction {
  const tx = new Transaction()

  tx.moveCall({
    target: `${p.packageId}::survey_vault::close`,
    arguments: [tx.object(p.vaultId)],
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
      c.type === 'created' &&
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
