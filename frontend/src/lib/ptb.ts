import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'

// ── bonding curve constants ───────────────────────────────────────────────────

/** Mirrors `amm_pool::BONDING_DECAY` (1e12 MIST = 1000 SUI). */
export const BONDING_DECAY = 1_000_000_000_000n

/** Mirrors `amm_pool::INITIAL_SSR_PER_SUI` (1 MIST → 1000 SSR base at total=0). */
export const INITIAL_SSR_PER_SUI = 1000n

/** Vault fee in basis points (mirrors `survey_vault::VAULT_FEE_BPS`). */
export const VAULT_FEE_BPS = 30n

/** SSR & SR coins both use 9 decimals. */
export const SSR_BASE_PER_UNIT = 1_000_000_000n

/**
 * Auto-destroy grace period (ms) after a survey closes (or expires), before its
 * data may be purged. Env-tunable via `VITE_PURGE_GRACE_MS`; falls back to the
 * contract default (90 days). The create PTB writes this onto the vault.
 */
const getPurgeGraceMs = (): number => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return Number(import.meta.env.VITE_PURGE_GRACE_MS ?? 90 * 24 * 60 * 60 * 1000)
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env) {
      return Number(process.env.VITE_PURGE_GRACE_MS ?? 90 * 24 * 60 * 60 * 1000)
    }
  } catch {}
  return 90 * 24 * 60 * 60 * 1000
}

export const PURGE_GRACE_MS = BigInt(getPurgeGraceMs())

/** Mirrors `survey_vault::DEFAULT_MAX_INLINE_ANSWER_BYTES` (6 KiB). */
const getMaxInlineAnswerBytes = (): number => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      const kb = import.meta.env.VITE_ANSWER_SIZE_THRESHOLD_KB
      if (kb) return Math.floor(Number(kb) * 1024)
      const bytes = import.meta.env.VITE_MAX_INLINE_ANSWER_BYTES
      if (bytes) return Number(bytes)
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env) {
      const kb = process.env.MAX_INLINE_ANSWER_KB ?? process.env.VITE_ANSWER_SIZE_THRESHOLD_KB
      if (kb) return Math.floor(Number(kb) * 1024)
      const bytes = process.env.MAX_INLINE_ANSWER_BYTES
      if (bytes) return Number(bytes)
    }
  } catch {}
  return 6144
}

export const MAX_INLINE_ANSWER_BYTES = getMaxInlineAnswerBytes()

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
 * @deprecated Use `estimateFundCostV2`. Legacy V1 estimator (no repeat rewards).
 */
export function estimateFundCost(p: EstimateFundCostParams): EstimateFundCostResult {
  const netSsrBase = p.perResponse * BigInt(p.maxResponses) * SSR_BASE_PER_UNIT

  const vaultFeeBase = (netSsrBase * VAULT_FEE_BPS) / 10_000n
  const grossSsrBase = netSsrBase + vaultFeeBase

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
  /** SSR per repeat submission, integer in human units. 0 = no repeats allowed. */
  repeatReward?: bigint
  /** Max repeats per address. Only matters when repeatReward > 0. */
  repeatMaxTimes?: number
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
  /** Royalty on reward budget (base units): net × effectiveFeeBps / 10_000. */
  feeBase: bigint
  /** Total SSR (base units) creator deposits: net + feeBase. */
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
  const repeatReward = p.repeatReward ?? 0n
  const repeatMaxTimes = BigInt(p.repeatMaxTimes ?? 0)
  // Worst-case budget = perResponse * maxResponses + repeatReward * maxResponses * repeatMaxTimes
  // (every respondent submits 1 initial + repeatMaxTimes repeats).
  const baseSsr = p.perResponse * BigInt(p.maxResponses)
  const repeatSsr = repeatReward * BigInt(p.maxResponses) * repeatMaxTimes
  const netSsrBase = (baseSsr + repeatSsr) * SSR_BASE_PER_UNIT
  const effectiveFeeBps = (p.feeConfig.totalFeeBps * p.feeConfig.discountBps) / 10000n

  if (effectiveFeeBps >= 10000n) {
    throw new Error('Effective fee rate cannot be 100% or more')
  }

  const feeBase = (netSsrBase * effectiveFeeBps) / 10000n
  const grossSsrBase = netSsrBase + feeBase

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
    feeBase,
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
  /** SSR per repeat submission, integer in human units. 0 disables repeats. */
  repeatReward?: bigint
  /** Max repeats per address. Required by contract; defaults to 1 when omitted. */
  repeatMaxTimes?: number
  maxResponses: number
  deadlineMs: bigint
  /** Encrypted survey blob to store in `survey_registry::register`. If surveyBlobId is set, this is optional or ignored. */
  encryptedContent: Uint8Array
  /** MIST amount of SUI to invest into the pool. */
  suiToSpend: bigint
  /** 允許的憑證來源：如 [2, 6, 7, 5] (對應 Email=2, Google=6, GitHub=7, WorldID=5) */
  allowedSources?: number[]

  // Hybrid decentralized storage parameters
  surveyBlobId?: Uint8Array
  /** Walrus blob Sui object ID; required when surveyBlobId is set. */
  surveyBlobObjectId?: string
  storageCompensationAmount?: bigint // in MIST
  requiredStorageFund?: bigint // in MIST

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
  sponsorAddress?: string
  gasCompensationAmount?: bigint
  ticketFee?: bigint
  allowedNftType?: string
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

  // 1. Create gas_coin input & Create empty vault
  const repeatReward = p.repeatReward ?? 0n
  const repeatMaxTimes = BigInt(p.repeatMaxTimes ?? 1)
  const gasCompensationAmount = p.gasCompensationAmount ?? 0n
  const storageCompensationAmount = p.storageCompensationAmount ?? 0n
  const ticketFee = p.ticketFee ?? 0n

  const perResponseSui = gasCompensationAmount + storageCompensationAmount
  const perResponseGasAndFee = perResponseSui + ticketFee
  let requiredGas = 0n
  if (perResponseGasAndFee > 0n) {
    if (repeatReward > 0n) {
      requiredGas = BigInt(p.maxResponses) * (1n + repeatMaxTimes) * perResponseGasAndFee
    } else {
      requiredGas = BigInt(p.maxResponses) * perResponseGasAndFee
    }
  }

  let gasCoinInput
  if (requiredGas > 0n) {
    const [splitSui] = tx.splitCoins(tx.gas, [tx.pure.u64(requiredGas.toString())])
    gasCoinInput = splitSui
  } else {
    const [zeroSui] = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: ['0x2::sui::SUI'],
    })
    gasCoinInput = zeroSui
  }

  const sponsorAddr = p.sponsorAddress || '0x0000000000000000000000000000000000000000000000000000000000000000'

  const allowedNftTypeOpt = p.allowedNftType
    ? Array.from(new TextEncoder().encode(p.allowedNftType))
    : null

  const allowedNftTypeArg = tx.pure(
    bcs.option(bcs.vector(bcs.u8())).serialize(allowedNftTypeOpt).toBytes()
  )

  const [vault] = tx.moveCall({
    target: `${p.packageId}::survey_vault::create_empty`,
    arguments: [
      tx.pure.u64(p.perResponse * SSR_BASE_PER_UNIT),
      tx.pure.u64(repeatReward * SSR_BASE_PER_UNIT),
      tx.pure.u64(repeatMaxTimes),
      tx.pure.u64(p.maxResponses),
      tx.pure.u64(p.deadlineMs),
      tx.pure.address(p.adminTreasury),
      gasCoinInput,
      tx.pure.address(sponsorAddr),
      tx.pure.u64(gasCompensationAmount),
      tx.pure.u64(storageCompensationAmount),
      tx.pure.u64(ticketFee.toString()),
      allowedNftTypeArg,
    ],
  })

  // 1b. Set the env-configured auto-destroy grace period on the new vault.
  tx.moveCall({
    target: `${p.packageId}::survey_vault::set_purge_grace_ms`,
    arguments: [vault, tx.pure.u64(PURGE_GRACE_MS)],
  })

  // 1c. Set inline answer size cap from deployment env (Walrus above this threshold).
  tx.moveCall({
    target: `${p.packageId}::survey_vault::set_max_inline_answer_bytes`,
    arguments: [vault, tx.pure.u64(MAX_INLINE_ANSWER_BYTES)],
  })

  // 2. Deposit existing SSR offset
  let offsetCoinInput
  if (offsetIn > 0n) {
    if (creatorSsrCoins.length === 0) {
      throw new Error('No SSR coins available for offset')
    }
    const sortedCoins = [...creatorSsrCoins].sort((a, b) =>
      Number(BigInt(b.balance) - BigInt(a.balance))
    )
    const totalAvailable = sortedCoins.reduce((sum, c) => sum + BigInt(c.balance), 0n)
    if (totalAvailable < offsetIn) {
      throw new Error(
        `Insufficient SSR balance. Required: ${offsetIn}, Available: ${totalAvailable}`
      )
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
      tx.mergeCoins(
        primaryCoinInput,
        coinsToMerge.map((id) => tx.object(id))
      )
    }

    const [splitCoin] = tx.splitCoins(primaryCoinInput, [tx.pure.u64(offsetIn.toString())])
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
    const [suiCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(p.suiToSpend.toString())])
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
    arguments: [vault, mintedCoin, tx.object(p.poolId)],
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
        tx.pure.vector(
          'vector<u8>',
          (q.options_json || []).map((opt) => Array.from(new TextEncoder().encode(opt)))
        ),
        tx.pure.bool(q.required),
      ],
    })
  })

  const questionsVec = tx.makeMoveVec({
    type: `${p.packageId}::survey_registry::Question`,
    elements: questionsArgs,
  })

  // Get vault ID to pass to register
  const [vaultId] = tx.moveCall({
    target: '0x2::object::id',
    typeArguments: [`${p.packageId}::survey_vault::SurveyVault`],
    arguments: [vault],
  })

  const surveyBlobIdOpt = p.surveyBlobId ? p.surveyBlobId : null
  const surveyBlobObjectIdOpt = p.surveyBlobObjectId ?? null
  const encryptedContentOpt = p.surveyBlobId ? null : p.encryptedContent

  if (surveyBlobIdOpt && !surveyBlobObjectIdOpt) {
    throw new Error('surveyBlobObjectId is required when using Walrus storage')
  }

  const encryptedContentArg = tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(encryptedContentOpt).toBytes())
  const surveyBlobIdArg = tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(surveyBlobIdOpt).toBytes())
  const surveyBlobObjectIdArg = tx.pure(
    bcs.option(bcs.Address).serialize(surveyBlobObjectIdOpt).toBytes()
  )

  // 6. Register survey
  tx.moveCall({
    target: `${p.packageId}::survey_registry::register`,
    arguments: [
      tx.object(p.registryId),
      vaultId,
      tx.pure.vector('u8', Array.from(contentHash)),
      encryptedContentArg,
      surveyBlobIdArg,
      surveyBlobObjectIdArg,
      tx.pure.vector('u8', Array.from(schemaHash)),
      tx.pure.vector('u8', Array.from(creatorPubKey)),
      questionsVec,
      tx.pure.vector('u8', p.allowedSources ?? [2]),
      // Eligibility v1 placeholders (see docs/V4_Eligibility.md)
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([]).toBytes()), // allowed_nullifiers
      tx.pure.u64(0), // match_threshold
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null).toBytes()), // disclosure_rule_blob
      tx.pure(bcs.option(bcs.Address).serialize(null).toBytes()), // stage1_survey_id (Option<ID>)
      tx.pure.u8(0), // claim_mode
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

// ── build purge PTB ───────────────────────────────────────────────────────────

export interface BuildPurgePtbParams {
  packageId: string
  registryId: string
  surveyId: string
  vaultId: string
}

/**
 * Build the purge PTB that permanently destroys a survey + its vault (and every
 * stored answer) once the grace period has elapsed. The BFF cron is the normal
 * trigger; this is also used for the manual / permissionless fallback. `purge`
 * is gated on-chain, so calling early simply aborts.
 */
export function buildPurgePtb(p: BuildPurgePtbParams): Transaction {
  const tx = new Transaction()

  tx.moveCall({
    target: `${p.packageId}::survey_vault::purge`,
    arguments: [
      tx.object(p.registryId),
      tx.object(p.surveyId),
      tx.object(p.vaultId),
      tx.object('0x6'), // Clock
    ],
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
  suffix: string
): string | null {
  if (!changes) return null
  const hit = changes.find(
    (c) => c.type !== 'deleted' && typeof c.objectType === 'string' && c.objectType.endsWith(suffix)
  )
  return hit?.objectId ?? null
}

/** Extract the newly-created SurveyVault object ID from `objectChanges`. */
export function extractVaultIdFromEffects(
  objectChanges: readonly ObjectChangeLike[] | undefined
): string | null {
  return findCreatedBySuffix(objectChanges, '::survey_vault::SurveyVault')
}

/** Extract the newly-created Survey object ID from `objectChanges`. */
export function extractSurveyIdFromEffects(
  objectChanges: readonly ObjectChangeLike[] | undefined
): string | null {
  return findCreatedBySuffix(objectChanges, '::survey_registry::Survey')
}

// ── SurveyPass PTB helpers ───────────────────────────────────────────────────

export interface BuildMintPassPtbParams {
  packageId: string
  registryId: string
  configId: string
  owner: string
  // 支付儲存押金的一方：代付鑄造 = sponsor 位址；自付 fallback = owner。
  // 決定刪除授權與儲存返還流向，後端代付時會驗證此值 == sponsor。
  depositPayer: string
  source: number
  nullifiers: Uint8Array[]
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
      tx.pure.address(p.depositPayer),
      tx.pure.u8(p.source),
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(p.nullifiers.map((n) => Array.from(n))).toBytes()),
      tx.pure.vector('u8', Array.from(p.commitment)),
      tx.pure.u64(BigInt(p.expiresAt).toString()),
      tx.pure.vector('u8', Array.from(p.bffSig)),
      tx.object('0x6'), // Clock
    ],
  })
  return tx
}

export interface PassTicketPtbFields {
  source: number
  nullifiers: Uint8Array[]
  commitment: Uint8Array
  expiresAt: bigint | string
  bffSig: Uint8Array
}

export interface BuildMintPassWithExtraCredentialsPtbParams extends BuildMintPassPtbParams {
  extraTickets: PassTicketPtbFields[]
}

/**
 * Mint a new SurveyPass with additional credentials in a single transaction (OAuth dual-ticket).
 */
export function buildMintPassWithExtraCredentialsPtb(p: BuildMintPassWithExtraCredentialsPtbParams): Transaction {
  const tx = new Transaction()
  const extra = p.extraTickets
  const extraSources = extra.map((t) => t.source)
  const extraNullifiers = extra.map((t) =>
    t.nullifiers.map((n) => Array.from(n))
  )
  const extraCommitments = extra.map((t) => Array.from(t.commitment))
  const extraExpiresAt = extra.map((t) => BigInt(t.expiresAt).toString())
  const extraBffSigs = extra.map((t) => Array.from(t.bffSig))

  tx.moveCall({
    target: `${p.packageId}::survey_pass::mint_pass_with_extra_credentials`,
    arguments: [
      tx.object(p.registryId),
      tx.object(p.configId),
      tx.pure.address(p.owner),
      tx.pure.address(p.depositPayer),
      tx.pure.u8(p.source),
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(p.nullifiers.map((n) => Array.from(n))).toBytes()),
      tx.pure.vector('u8', Array.from(p.commitment)),
      tx.pure.u64(BigInt(p.expiresAt).toString()),
      tx.pure.vector('u8', Array.from(p.bffSig)),
      tx.pure(bcs.vector(bcs.u8()).serialize(extraSources).toBytes()),
      tx.pure(
        bcs
          .vector(bcs.vector(bcs.vector(bcs.u8())))
          .serialize(extraNullifiers)
          .toBytes()
      ),
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(extraCommitments).toBytes()),
      tx.pure(bcs.vector(bcs.u64()).serialize(extraExpiresAt.map((v) => BigInt(v))).toBytes()),
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(extraBffSigs).toBytes()),
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
  nullifiers: Uint8Array[]
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
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(p.nullifiers.map((n) => Array.from(n))).toBytes()),
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
 * Builds a PTB to delete a SurveyPass via `delete_pass`.
 * 授權依鏈上 `deposit_payer` 分流：自付鑄造的 Pass 由 owner 自行送出；
 * 代付鑄造的 Pass 須由 admin（後端）送出（使用者自送會 abort ENotAdmin）。
 */
export function buildDeletePassPtb(p: BuildDeletePassPtbParams): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${p.packageId}::survey_pass::delete_pass`,
    arguments: [tx.object(p.registryId), tx.object(p.passId)],
  })
  return tx
}

export interface BuildSelfDeleteSponsoredPassPtbParams {
  packageId: string
  registryId: string
  passId: string
  // 須 >= 合約 REBATE_FEE_FLOOR（MIST），用於抵銷使用者自付刪除時拿到的儲存返還
  feeMist: bigint | string
}

/**
 * 自付逃生門 PTB：後端代付不可用時，使用者自付刪除「代付鑄造」的 Pass。
 * 從 gas coin 切出 feeMist 作為費用轉回項目方，確保使用者無利可圖。
 */
export function buildSelfDeleteSponsoredPassPtb(p: BuildSelfDeleteSponsoredPassPtbParams): Transaction {
  const tx = new Transaction()
  const [fee] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(p.feeMist).toString())])
  tx.moveCall({
    target: `${p.packageId}::survey_pass::self_delete_sponsored_pass`,
    arguments: [tx.object(p.registryId), tx.object(p.passId), fee],
  })
  return tx
}
