import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
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
  verifyTxSignatureBy,
} from './sponsorAuth.js'
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
import { assertPlatformSponsorTierEligible } from './platformSponsorEligibility.js'
import { SponsorCoinQueue } from './sponsorCoinQueue.js'
import {
  fetchGasStationHealth,
  forwardSponsorToGasStation,
  getGasStationMode,
} from './gasStationClient.js'
import { getWalletSponsorRateLimitStore } from './stores/sqliteWalletRateLimitStore.js'
interface GasSponsorRequestBody {
  txBytes: string
  senderAddress: string
}

interface GasExecuteRequestBody {
  sponsoredTxBytes: string
  userSignature: string
  sponsorSignature: string
}

const DYNAMIC_GAS_CAP_MULTIPLIER = 3n

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
function loadTicketIssuerKeypair(): Ed25519Keypair {
  const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
  if (!privKeyHex) {
    throw new Error('SURVEY_PASS_ISSUER_PRIV is not set')
  }
  const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
  const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
  return Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(0, 32))
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
        samples.length > 2 ? samples.slice(0, samples.length - 1) : samples
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
  app: FastifyInstance,
  deps: { suiClient: SuiClient; packageId: string; coinQueue?: SponsorCoinQueue }
): void {
  const coinQueue = deps.coinQueue ?? InMemoryCoinLockStore.fromGasConfig(getGasConfig())
  app.get('/api/gas/health', async (_req, reply): Promise<GasHealthResponse> => {
    try {
      const gasConfig = getGasConfig()
      const sponsorSigner = loadSponsorSigner()
      if (!sponsorSigner) {
        return { available: false, reason: 'no_key' }
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
      const doHealth =
        gasStationMode === 'do' ? await fetchGasStationHealth() : null
      const unlockedCoinCount =
        typeof doHealth?.unlockedCoinCount === 'number'
          ? doHealth.unlockedCoinCount
          : undefined
      const lockedCoinCount =
        typeof doHealth?.lockedCoinCount === 'number' ? doHealth.lockedCoinCount : undefined
      const queueDepth =
        typeof doHealth?.queueDepth === 'number' ? doHealth.queueDepth : undefined
      if (BigInt(balance.totalBalance) < healthMinBalanceMist(gasConfig)) {
        return {
          available: false,
          reason: 'low_balance',
          sponsorAddress,
          gasCompensationAmount: dynamicAmount.toString(),
          gasStationMode,
          unlockedCoinCount,
          lockedCoinCount,
          queueDepth,
        }
      }
      return {
        available: doHealth?.available === false ? false : true,
        sponsorAddress,
        gasCompensationAmount: dynamicAmount.toString(),
        gasStationMode,
        unlockedCoinCount,
        lockedCoinCount,
        queueDepth,
        reason: doHealth?.available === false ? 'unknown' : undefined,
      }
    } catch (err: any) {
      reply.log.warn({ err: err?.message }, '[GasStation] health probe failed')
      return { available: false, reason: 'unknown' }
    }
  })
  app.get(
    '/api/gas/sponsor-count',
    async (req: FastifyRequest<{ Querystring: { address?: string } }>, reply: FastifyReply) => {
      const { address } = req.query
      if (!address) {
        return reply.status(400).send({ error: 'Missing address' })
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
        return {
          count,
          maxLimit,
          remaining: Math.max(0, maxLimit - count),
        }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: 'failed_to_get_count', message: err.message })
      }
    }
  )
  const sponsorRateLimit = getGasConfig()

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
      options: { enforcePassLimit: false },
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
  app.post(
    '/api/gas/sponsor',
    {
      config: {
        rateLimit: {
          max: sponsorRateLimit.gasSponsorRateLimitMax,
          timeWindow: sponsorRateLimit.gasSponsorRateLimitWindowMs,
        },
      },
    },
    async (req: FastifyRequest<{ Body: GasSponsorRequestBody }>, reply: FastifyReply) => {
      const gasConfig = getGasConfig()
      const { txBytes, senderAddress } = req.body
      if (!txBytes || !senderAddress) {
        return reply.status(400).send({
          error: 'missing_params',
          message: 'txBytes and senderAddress are required',
        })
      }
      try {
        assertTxSenderMatches(txBytes, senderAddress)
      } catch {
        return reply.status(400).send({
          error: 'tx_sender_mismatch',
          message: 'Transaction sender does not match senderAddress',
        })
      }
      const walletLimit = await getWalletSponsorRateLimitStore().checkAndIncrement(
        senderAddress,
        gasConfig.gasSponsorRateLimitMaxPerWallet,
        gasConfig.gasSponsorRateLimitWalletWindowMs
      )
      if (!walletLimit.allowed) {
        return reply.status(429).send({
          error: 'wallet_rate_limit_exceeded',
          message: `Wallet sponsor rate limit exceeded; retry in ${Math.ceil((walletLimit.retryAfterMs ?? 0) / 1000)} seconds`,
        })
      }
      try {
        const sponsorSigner = requireSponsorSigner()
        const sponsorAddress = sponsorSigner.getSponsorAddress()
        const scope = resolveCountScope()
        const validation = await runValidation(txBytes, senderAddress, sponsorAddress)
        if (!validation.ok) {
          return reply.status(validation.status).send({
            error: validation.error,
            message: validation.message,
          })
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
            return reply.status(403).send({
              error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
              message: 'SurveyPass lifetime sponsor limit reached for this wallet address',
            })
          }
        }
        const requestId =
          typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined
        if (getGasStationMode() === 'do') {
          const forwarded = await forwardSponsorToGasStation({
            txBytes,
            senderAddress,
            sponsorAddress,
            requestId,
            pipelineContext,
          })
          if (!forwarded.ok) {
            return reply.status(forwarded.status).send({
              error: forwarded.error,
              message: forwarded.message,
            })
          }
          return forwarded.data
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
        req.log.info(
          {
            requestId,
            sender: senderAddress,
            outcome: outcome.metrics.outcome,
            queueWaitMs: outcome.metrics.queueWaitMs,
            dryRunMs: outcome.metrics.dryRunMs,
            coinObjectId: outcome.metrics.coinObjectId,
          },
          '[GasStation] sponsor pipeline'
        )
        if (!outcome.ok) {
          if (outcome.error === 'dry_run_failed') {
            req.log.warn(`[GasStation] Dry run rejected: ${outcome.message}`)
          }
          return reply.status(outcome.status).send({
            error: outcome.error,
            message: outcome.message,
          })
        }
        return outcome.result
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: 'sponsor_failed', message: err.message })
      }
    }
  )

  // 廣播代付交易並在此原子消耗額度。使用者的交易簽章 = 同意憑證;攻擊者偽造不出,
  // 故無法替他人預留/消耗終生額度。硬上限由 tryReserveSponsorLimit 的原子預留保證。
  app.post(
    '/api/gas/execute',
    {
      config: {
        rateLimit: {
          max: sponsorRateLimit.gasSponsorRateLimitMax,
          timeWindow: sponsorRateLimit.gasSponsorRateLimitWindowMs,
        },
      },
    },
    async (req: FastifyRequest<{ Body: GasExecuteRequestBody }>, reply: FastifyReply) => {
      const { sponsoredTxBytes, userSignature, sponsorSignature } = req.body ?? ({} as GasExecuteRequestBody)
      if (!sponsoredTxBytes || !userSignature || !sponsorSignature) {
        return reply.status(400).send({
          error: 'missing_params',
          message: 'sponsoredTxBytes, userSignature and sponsorSignature are required',
        })
      }

      const sponsorSigner = requireSponsorSigner()
      const sponsorAddress = sponsorSigner.getSponsorAddress()

      // 1. 確認 gas owner 與 sponsor 簽章皆為我方 → 這串 bytes 確實出自本服務的 /sponsor
      //    (已通過 PTB 白名單),後端才肯廣播,杜絕廣播任意 bytes。
      const gasOwner = gasOwnerFromTransactionData(sponsoredTxBytes)
      if (!gasOwner || normalizeAddr(gasOwner) !== normalizeAddr(sponsorAddress)) {
        return reply.status(400).send({
          error: 'not_sponsored_by_us',
          message: 'Transaction gas owner is not this sponsor',
        })
      }
      if (!(await verifyTxSignatureBy(sponsoredTxBytes, sponsorSignature, sponsorAddress))) {
        return reply.status(400).send({
          error: 'invalid_sponsor_signature',
          message: 'Sponsor signature does not match these transaction bytes',
        })
      }

      // 2. 驗使用者交易簽章 = 同意憑證(sender 自 bytes 取出)。
      const sender = senderFromTransactionData(sponsoredTxBytes)
      if (!sender) {
        return reply.status(400).send({ error: 'invalid_transaction', message: 'Missing sender in transaction' })
      }
      if (!(await verifyTxSignatureBy(sponsoredTxBytes, userSignature, sender))) {
        return reply.status(401).send({
          error: 'invalid_user_signature',
          message: 'User signature is invalid or not signed by the transaction sender',
        })
      }

      let passReserved = false
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
          return reply.status(validation.status).send({ error: validation.error, message: validation.message })
        }
        const { isPassSponsor, isPlatformSponsor } = validation
        const scope = resolveCountScope()

        // 4. 原子記帳(硬上限):Pass 終生額度預留 / claim 平台日額度遞增。超限即拒,不廣播。
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
            return reply.status(403).send({
              error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
              message: 'SurveyPass lifetime sponsor limit reached for this wallet address',
            })
          }
          passReserved = true
        } else if (isPlatformSponsor) {
          const inc = await tryIncrementPlatformSponsorCount(sender, todayUtcDate())
          if (!inc.ok) {
            return reply.status(403).send({
              error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
              message: 'Daily platform sponsorship limit reached for this wallet address',
            })
          }
        }

        // 5. 雙簽廣播。
        const result = await deps.suiClient.executeTransactionBlock({
          transactionBlock: sponsoredTxBytes,
          signature: [userSignature, sponsorSignature],
          options: { showEffects: true },
        })
        if (result.effects?.status.status === 'failure') {
          if (passReserved) await releasePassReservation(sender, sponsorAddress, 1).catch(() => undefined)
          return reply.status(422).send({
            error: 'execution_failed',
            message: result.effects.status.error ?? 'Transaction execution failed',
          })
        }
        return { digest: result.digest }
      } catch (err: any) {
        if (passReserved) {
          await releasePassReservation(sender, sponsorAddress, 1).catch(() => undefined)
        }
        req.log.error(err)
        return reply.status(500).send({ error: 'execute_failed', message: err.message })
      }
    }
  )
}

function normalizeAddr(addr: string): string {
  let clean = addr.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}
