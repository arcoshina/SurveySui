import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import { rateLimit } from '../http/rateLimit.js'
import {
  tryReserveSponsorLimit,
  releasePassReservation,
  checkSponsorLimit,
  getSponsorCount,
  __useInMemoryPassReservationsForTests,
} from './sponsorLedger.js'
import {
  assertTxSenderMatches,
  senderFromTransactionData,
  gasOwnerFromTransactionData,
  gasPaymentCoinIdsFromTransactionData,
  gasBudgetFromTransactionData,
  verifyTxSignatureBy,
} from './sponsorAuth.js'
import {
  availableVaultGasSlots,
  tryReserveVaultGasSlot,
  releaseVaultGasSlot,
} from './vaultGasLedger.js'
import { resolveCountScope } from './sponsorPolicy.js'
import { effectiveInlineLimit } from './inlineLimit.js'
import {
  getPlatformSponsorCount,
  tryIncrementPlatformSponsorCount,
  platformSponsorDailyLimit,
  todayUtcDate,
} from './platformSponsorLedger.js'
import { InMemoryCoinLockStore, runSponsorPipeline, validateSponsorTransaction } from '@surveysui/gas-station-core'
import { loadSponsorSigner, requireSponsorSigner } from './sponsorSigner.js'
import { getGasConfig, healthMinBalanceMist } from './gasConfig.js'
import { loadTicketIssuerKeypair } from '../auth/ticket.js'
import { assertPlatformSponsorTierEligible } from './platformSponsorEligibility.js'
import { SponsorCoinQueue } from './sponsorCoinQueue.js'
import {
  fetchGasStationHealth,
  forwardSponsorToGasStation,
  getGasStationMode,
  releaseGasStationCoins,
} from './gasStationClient.js'
import { getWalletSponsorRateLimitStore } from './stores/sqliteWalletRateLimitStore.js'

interface GasSponsorRequestBody {
  txBytes: string
  senderAddress: string
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

interface GasExecuteRequestBody {
  sponsoredTxBytes: string
  userSignature: string
  sponsorSignature: string
}

const DYNAMIC_GAS_CAP_MULTIPLIER = 3n
// 樣本數超過此門檻才丟棄排序後最高的一筆以濾除離群峰值；否則樣本太少全留
const MIN_SAMPLES_FOR_TRIM = 2

export { __useInMemoryPassReservationsForTests }
export interface GasHealthResponse {
  available: boolean
  reason?: 'no_key' | 'low_balance' | 'unknown'
  sponsorAddress?: string
  gasCompensationAmount?: string
  gasStationMode?: 'local' | 'do'
  unlockedCoinCount?: number
  lockedCoinCount?: number
  queueDepth?: number
}
let cachedDynamicGas: bigint | null = null
let lastFetchedTime = 0
const CACHE_DURATION_MS = 60_000
export function __resetDynamicGasCache(): void {
  cachedDynamicGas = null
  lastFetchedTime = 0
}
export async function calculateDynamicGasCompensation(
  suiClient: SuiClient,
  packageId: string,
  minAmount: bigint
): Promise<bigint> {
  const now = Date.now()
  if (cachedDynamicGas !== null && now - lastFetchedTime < CACHE_DURATION_MS) {
    return cachedDynamicGas > minAmount ? cachedDynamicGas : minAmount
  }
  try {
    const res = await suiClient.queryTransactionBlocks({
      filter: {
        MoveFunction: {
          package: packageId,
          module: 'survey_vault',
          function: 'claim',
        },
      },
      limit: 10,
      options: {
        showEffects: true,
      },
    })
    const samples: bigint[] = []
    if (res?.data && res.data.length > 0) {
      for (const txBlock of res.data) {
        if (txBlock.effects?.status?.status === 'success' && txBlock.effects.gasUsed) {
          const computationCost = BigInt(txBlock.effects.gasUsed.computationCost || '0')
          const storageCost = BigInt(txBlock.effects.gasUsed.storageCost || '0')
          const storageRebate = BigInt(txBlock.effects.gasUsed.storageRebate || '0')
          const netGas = computationCost + storageCost - storageRebate
          if (netGas > 0n) samples.push(netGas)
        }
      }
    }
    let maxGas = minAmount
    if (samples.length > 0) {
      samples.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      const trimmed =
        samples.length > MIN_SAMPLES_FOR_TRIM ? samples.slice(0, samples.length - 1) : samples
      const dynamicPeak = trimmed[trimmed.length - 1] ?? minAmount
      const hardCap = minAmount * DYNAMIC_GAS_CAP_MULTIPLIER
      maxGas = dynamicPeak < hardCap ? dynamicPeak : hardCap
    }
    cachedDynamicGas = maxGas
    lastFetchedTime = now
    return maxGas
  } catch (error) {
    console.error('[GasStation] Failed to query dynamic gas compensation on-chain:', error)
    return minAmount
  }
}
export function registerGasRoutes(
  app: Hono,
  deps: { suiClient: SuiClient; packageId: string; coinQueue?: SponsorCoinQueue }
): void {
  const coinQueue = deps.coinQueue ?? InMemoryCoinLockStore.fromGasConfig(getGasConfig())

  app.get('/api/gas/health', async (c) => {
    try {
      const gasConfig = getGasConfig()
      const sponsorSigner = loadSponsorSigner()
      if (!sponsorSigner) {
        return c.json({ available: false, reason: 'no_key' } as GasHealthResponse)
      }
      const sponsorAddress = sponsorSigner.getSponsorAddress()
      const balance = await deps.suiClient.getBalance({
        owner: sponsorAddress,
        coinType: '0x2::sui::SUI',
      })
      const minAmount = gasConfig.minGasCompensationAmount
      const dynamicAmount = await calculateDynamicGasCompensation(
        deps.suiClient,
        deps.packageId,
        minAmount
      )
      const gasStationMode = getGasStationMode()
      const doHealth = gasStationMode === 'do' ? await fetchGasStationHealth() : null
      const unlockedCoinCount =
        typeof doHealth?.unlockedCoinCount === 'number' ? doHealth.unlockedCoinCount : undefined
      const lockedCoinCount =
        typeof doHealth?.lockedCoinCount === 'number' ? doHealth.lockedCoinCount : undefined
      const queueDepth =
        typeof doHealth?.queueDepth === 'number' ? doHealth.queueDepth : undefined
      if (BigInt(balance.totalBalance) < healthMinBalanceMist(gasConfig)) {
        return c.json({
          available: false,
          reason: 'low_balance',
          sponsorAddress,
          gasCompensationAmount: dynamicAmount.toString(),
          gasStationMode,
          unlockedCoinCount,
          lockedCoinCount,
          queueDepth,
        } as GasHealthResponse)
      }
      return c.json({
        available: doHealth?.available === false ? false : true,
        sponsorAddress,
        gasCompensationAmount: dynamicAmount.toString(),
        gasStationMode,
        unlockedCoinCount,
        lockedCoinCount,
        queueDepth,
        reason: doHealth?.available === false ? 'unknown' : undefined,
      } as GasHealthResponse)
    } catch (err) {
      console.warn('[GasStation] health probe failed', errorMessage(err))
      return c.json({ available: false, reason: 'unknown' } as GasHealthResponse)
    }
  })

  app.get('/api/gas/sponsor-count', async (c) => {
    const address = c.req.query('address')
    if (!address) {
      return c.json({ error: 'Missing address' }, 400)
    }
    try {
      const sponsorSigner = requireSponsorSigner()
      const sponsorAddress = sponsorSigner.getSponsorAddress()
      const scope = resolveCountScope()
      const count = await getSponsorCount({
        suiClient: deps.suiClient,
        senderAddress: address,
        sponsorAddress,
        packageId: scope.packageId,
        sinceMs: scope.sinceMs,
      })
      const maxLimit = scope.passMax
      return c.json({
        count,
        maxLimit,
        remaining: Math.max(0, maxLimit - count),
      })
    } catch (err) {
      console.error('[GasStation] sponsor-count failed', err)
      return c.json({ error: 'failed_to_get_count', message: errorMessage(err) }, 500)
    }
  })

  const sponsorRateLimit = getGasConfig()
  const sponsorLimiter = rateLimit({
    max: sponsorRateLimit.gasSponsorRateLimitMax,
    windowMs: sponsorRateLimit.gasSponsorRateLimitWindowMs,
    key: 'gas-sponsor',
  })
  const executeLimiter = rateLimit({
    max: sponsorRateLimit.gasSponsorRateLimitMax,
    windowMs: sponsorRateLimit.gasSponsorRateLimitWindowMs,
    key: 'gas-execute',
  })

  // 共用 PTB 白名單驗證(/sponsor 與 /execute 皆用,確保兩端對「能代付什麼」判定一致)。
  const runValidation = (txKindBytes: string, senderAddress: string, sponsorAddress: string) => {
    const gasConfig = getGasConfig()
    return validateSponsorTransaction({
      txBytes: txKindBytes,
      senderAddress,
      packageId: deps.packageId,
      sponsorAddress,
      suiClient: deps.suiClient,
      ticketIssuerKeypair: loadTicketIssuerKeypair(),
      options: {
        enforcePassLimit: false,
        platformClaimEnabled: gasConfig.platformClaimSponsorEnabled,
      },
      hooks: {
        effectiveInlineLimit,
        todayUtcDate,
        platformSponsorDailyLimit,
        getPlatformSponsorDailyCount: getPlatformSponsorCount,
        assertPlatformTierEligible: async ({ senderAddress: sender, passId }) => {
          const tierCheck = await assertPlatformSponsorTierEligible(
            deps.suiClient,
            deps.packageId,
            sender,
            gasConfig.minPlatformSponsorTier,
            passId
          )
          if (!tierCheck.ok) {
            return { ok: false as const, status: 403, error: tierCheck.error, message: tierCheck.message }
          }
          return { ok: true as const }
        },
      },
    })
  }

  // 試算 + 代簽,不消耗任何額度。額度在 /api/gas/execute 以使用者交易簽章為憑證原子預留。
  // 無使用者前置授權簽章:代簽後的 bytes 對攻擊者無用(無法廣播,quota 不會被扣),
  // 空耗 dry-run 由端點/錢包 rate limit 擋。
  app.post('/api/gas/sponsor', sponsorLimiter, async (c) => {
    const gasConfig = getGasConfig()
    const { txBytes, senderAddress } = await c.req
      .json<GasSponsorRequestBody>()
      .catch(() => ({}) as GasSponsorRequestBody)
    if (!txBytes || !senderAddress) {
      return c.json({ error: 'missing_params', message: 'txBytes and senderAddress are required' }, 400)
    }
    try {
      assertTxSenderMatches(txBytes, senderAddress)
    } catch {
      return c.json(
        { error: 'tx_sender_mismatch', message: 'Transaction sender does not match senderAddress' },
        400
      )
    }
    const walletLimit = await getWalletSponsorRateLimitStore().checkAndIncrement(
      senderAddress,
      gasConfig.gasSponsorRateLimitMaxPerWallet,
      gasConfig.gasSponsorRateLimitWalletWindowMs
    )
    if (!walletLimit.allowed) {
      return c.json(
        {
          error: 'wallet_rate_limit_exceeded',
          message: `Wallet sponsor rate limit exceeded; retry in ${Math.ceil((walletLimit.retryAfterMs ?? 0) / 1000)} seconds`,
        },
        429
      )
    }
    try {
      const sponsorSigner = requireSponsorSigner()
      const sponsorAddress = sponsorSigner.getSponsorAddress()
      const scope = resolveCountScope()
      const validation = await runValidation(txBytes, senderAddress, sponsorAddress)
      if (!validation.ok) {
        return c.json(
          { error: validation.error, message: validation.message },
          validation.status as ContentfulStatusCode
        )
      }
      const { pipelineContext, isPassSponsor } = validation
      // 唯讀額度檢查:提早擋明顯超額(不預留;硬上限由 /execute 原子保證)。
      if (isPassSponsor) {
        const quota = await checkSponsorLimit({
          suiClient: deps.suiClient,
          senderAddress,
          sponsorAddress,
          maxLimit: scope.passMax,
          packageId: scope.packageId,
          sinceMs: scope.sinceMs,
        })
        if (!quota.allowed) {
          return c.json(
            {
              error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
              message: 'SurveyPass lifetime sponsor limit reached for this wallet address',
            },
            403
          )
        }
      }
      const requestId = c.req.header('x-request-id') ?? undefined
      if (getGasStationMode() === 'do') {
        const forwarded = await forwardSponsorToGasStation({
          txBytes,
          senderAddress,
          sponsorAddress,
        })
        if (!forwarded.ok) {
          return c.json(
            { error: forwarded.error, message: forwarded.message },
            forwarded.status as ContentfulStatusCode
          )
        }
        return c.json(forwarded.data)
      }
      const outcome = await runSponsorPipeline({
        txBytes,
        senderAddress,
        suiClient: deps.suiClient,
        signer: sponsorSigner,
        sponsorAddress,
        coinStore: coinQueue,
        gasConfig,
        context: pipelineContext,
        requestId,
      })
      console.info('[GasStation] sponsor pipeline', {
        requestId,
        sender: senderAddress,
        outcome: outcome.metrics.outcome,
        queueWaitMs: outcome.metrics.queueWaitMs,
        dryRunMs: outcome.metrics.dryRunMs,
        coinObjectId: outcome.metrics.coinObjectId,
      })
      if (!outcome.ok) {
        if (outcome.error === 'dry_run_failed') {
          console.warn(`[GasStation] Dry run rejected: ${outcome.message}`)
        }
        return c.json(
          { error: outcome.error, message: outcome.message },
          outcome.status as ContentfulStatusCode
        )
      }
      return c.json(outcome.result)
    } catch (err) {
      console.error('[GasStation] sponsor failed', err)
      return c.json({ error: 'sponsor_failed', message: errorMessage(err) }, 500)
    }
  })

  // 廣播代付交易並在此原子消耗額度。使用者的交易簽章 = 同意憑證;攻擊者偽造不出,
  // 故無法替他人預留/消耗終生額度。硬上限由 tryReserveSponsorLimit 的原子預留保證。
  app.post('/api/gas/execute', executeLimiter, async (c) => {
    const { sponsoredTxBytes, userSignature, sponsorSignature } = await c.req
      .json<GasExecuteRequestBody>()
      .catch(() => ({}) as GasExecuteRequestBody)
    if (!sponsoredTxBytes || !userSignature || !sponsorSignature) {
      return c.json(
        {
          error: 'missing_params',
          message: 'sponsoredTxBytes, userSignature and sponsorSignature are required',
        },
        400
      )
    }

    const sponsorSigner = requireSponsorSigner()
    const sponsorAddress = sponsorSigner.getSponsorAddress()

    // 1. 確認 gas owner 與 sponsor 簽章皆為我方 → 這串 bytes 確實出自本服務的 /sponsor
    //    (已通過 PTB 白名單),後端才肯廣播,杜絕廣播任意 bytes。
    const gasOwner = gasOwnerFromTransactionData(sponsoredTxBytes)
    if (!gasOwner || normalizeAddr(gasOwner) !== normalizeAddr(sponsorAddress)) {
      return c.json(
        { error: 'not_sponsored_by_us', message: 'Transaction gas owner is not this sponsor' },
        400
      )
    }
    if (!(await verifyTxSignatureBy(sponsoredTxBytes, sponsorSignature, sponsorAddress))) {
      return c.json(
        { error: 'invalid_sponsor_signature', message: 'Sponsor signature does not match these transaction bytes' },
        400
      )
    }

    // 2. 驗使用者交易簽章 = 同意憑證(sender 自 bytes 取出)。
    const sender = senderFromTransactionData(sponsoredTxBytes)
    if (!sender) {
      return c.json({ error: 'invalid_transaction', message: 'Missing sender in transaction' }, 400)
    }
    if (!(await verifyTxSignatureBy(sponsoredTxBytes, userSignature, sender))) {
      return c.json(
        { error: 'invalid_user_signature', message: 'User signature is invalid or not signed by the transaction sender' },
        401
      )
    }

    let passReserved = false
    // vault 補償槽預留(M5):成功廣播或失敗回滾時釋放。
    let vaultGasReservedId: string | null = null
    try {
      // 3. 還原 transaction kind,重跑白名單驗證取得權威分類(Pass / platform-claim / vault-claim)。
      const kindBytes = Buffer.from(
        await Transaction.from(Buffer.from(sponsoredTxBytes, 'base64')).build({
          client: deps.suiClient,
          onlyTransactionKind: true,
        })
      ).toString('base64')
      const validation = await runValidation(kindBytes, sender, sponsorAddress)
      if (!validation.ok) {
        return c.json(
          { error: validation.error, message: validation.message },
          validation.status as ContentfulStatusCode
        )
      }
      const { isPassSponsor, vaultId, vaultGasBalance } = validation
      const scope = resolveCountScope()

      // 4. 原子記帳(硬上限):Pass 終生額度預留 / claim 走 vault 或平台代付。超限即拒,不廣播。
      if (isPassSponsor) {
        const reserveRes = await tryReserveSponsorLimit({
          suiClient: deps.suiClient,
          senderAddress: sender,
          sponsorAddress,
          maxLimit: scope.passMax,
          packageId: scope.packageId,
          sinceMs: scope.sinceMs,
        })
        if (!reserveRes.allowed) {
          return c.json(
            {
              error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
              message: 'SurveyPass lifetime sponsor limit reached for this wallet address',
            },
            403
          )
        }
        passReserved = true
      } else {
        // claim 代付:用 vault 補償槽的原子預留決定 vault vs 平台代付,取代 racy 鏈上讀數
        // (M5)。先試原子預留一個 vault 槽;預留失敗代表 vault 預算(鏈上+在途)已滿,
        // 該筆為溢出交易 → 走平台代付,計入每日額度並夾住單筆上限。
        const compensation = BigInt(validation.pipelineContext.claimGasCompensationAmount ?? '0')
        const slots = availableVaultGasSlots(BigInt(vaultGasBalance ?? '0'), compensation)
        const vaultReserved = vaultId ? await tryReserveVaultGasSlot(vaultId, slots) : false
        if (vaultReserved && vaultId) {
          vaultGasReservedId = vaultId
        } else {
          // 平台代付:斷言簽出的 gas budget 不超過平台單筆上限,杜絕沿用 vault 寬預算的超額。
          // M3:budget 解析為 null(欄位缺失/非數值)時無法確認上限,視同驗證失敗一律拒絕
          // (fail-closed),不可放行;正經走 /sponsor 出來的 bytes budget 必非 null。
          const signedBudget = gasBudgetFromTransactionData(sponsoredTxBytes)
          if (signedBudget === null || signedBudget > getGasConfig().maxPlatformClaimGasMist) {
            return c.json(
              {
                error: 'gas_exceeds_compensation',
                message:
                  signedBudget === null
                    ? 'Signed gas budget is missing or unparseable; re-sponsor required'
                    : `Signed gas budget ${signedBudget} exceeds platform claim cap ${getGasConfig().maxPlatformClaimGasMist}; re-sponsor required`,
              },
              422
            )
          }
          // M2(刻意設計,非缺陷):此遞增是廣播前的最後一個 await,中間無任何會拋例外的步驟。
          // 一旦遞增成功,後續失敗一律「不回退」每日計數——因為失敗交易 sponsor 仍已付 gas
          // (見下方 failure 與 catch 分支)。回退反而會讓人用反覆 abort 繞過每日額度。
          const inc = await tryIncrementPlatformSponsorCount(sender, todayUtcDate())
          if (!inc.ok) {
            return c.json(
              {
                error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
                message: 'Daily platform sponsorship limit reached for this wallet address',
              },
              403
            )
          }
        }
      }

      // 5. 雙簽廣播。
      const result = await deps.suiClient.executeTransactionBlock({
        transactionBlock: sponsoredTxBytes,
        signature: [userSignature, sponsorSignature],
        options: { showEffects: true },
      })
      if (result.effects?.status.status === 'failure') {
        // 交易已上鏈、僅 Move 執行 abort:Sui 上 sponsor 仍已付 gas,故平台每日計數
        // 「刻意不釋放」(計入額度才正確),只釋放尚未消耗的在途預留。
        if (passReserved) await releasePassReservation(sender, sponsorAddress, 1).catch(() => undefined)
        if (vaultGasReservedId) await releaseVaultGasSlot(vaultGasReservedId, 1).catch(() => undefined)
        return c.json(
          {
            error: 'execution_failed',
            message: result.effects.status.error ?? 'Transaction execution failed',
          },
          422
        )
      }
      // Coin is now spent on-chain; free its lock immediately instead of waiting
      // for the TTL, raising coin-pool turnover. Best-effort, never blocks the response.
      const spentCoinIds = gasPaymentCoinIdsFromTransactionData(sponsoredTxBytes)
      if (spentCoinIds.length > 0) {
        if (getGasStationMode() === 'do') {
          void releaseGasStationCoins(spentCoinIds).catch(() => undefined)
        } else {
          for (const id of spentCoinIds) await coinQueue.invalidateCoin(id)
        }
      }
      // vault 代付已上鏈,gas_balance 隨之下降接手計數;立即釋放在途預留(TTL 為安全網)。
      if (vaultGasReservedId) await releaseVaultGasSlot(vaultGasReservedId, 1).catch(() => undefined)
      return c.json({ digest: result.digest })
    } catch (err) {
      // 平台每日計數遞增後唯一可能拋例外者為 executeTransactionBlock 本身,此時交易
      // 已送至節點(逾時/連線中斷的模糊地帶),無法確定 gas 未被消耗,故「刻意不回退」
      // 每日計數,避免開出反覆 abort 繞過額度的後門;僅釋放尚未消耗的在途預留。
      if (passReserved) {
        await releasePassReservation(sender, sponsorAddress, 1).catch(() => undefined)
      }
      if (vaultGasReservedId) {
        await releaseVaultGasSlot(vaultGasReservedId, 1).catch(() => undefined)
      }
      console.error('[GasStation] execute failed', err)
      return c.json({ error: 'execute_failed', message: errorMessage(err) }, 500)
    }
  })
}

function normalizeAddr(addr: string): string {
  let clean = addr.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}
