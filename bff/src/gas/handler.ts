import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { SuiClient } from '@mysten/sui/client'
import { bcs } from '@mysten/sui/bcs'
import { TicketPayload } from '../auth/ticket.js'
import { checkSponsorLimit, reserveSponsor, getSponsorCount } from './sponsorLedger.js'
import { resolveCountScope } from './sponsorPolicy.js'
import { effectiveInlineLimit } from './inlineLimit.js'
import {
  getPlatformSponsorCount,
  incrementPlatformSponsorCount,
  platformSponsorDailyLimit,
  todayUtcDate,
} from './platformSponsorLedger.js'
import { InMemoryCoinLockStore, runSponsorPipeline } from '@surveysui/gas-station-core'
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
  txBytes: string // base64 encoded transaction kind
  senderAddress: string
}

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

function getObjectIdFromInput(input: any): string | null {
  if (!input) return null
  if (typeof input === 'string') return input
  if (input.UnresolvedObject?.objectId) {
    return input.UnresolvedObject.objectId
  }
  if (input.Object?.ImmOrOwnedObject?.objectId) {
    return input.Object.ImmOrOwnedObject.objectId
  }
  if (input.Object?.SharedObject?.objectId) {
    return input.Object.SharedObject.objectId
  }
  return null
}

function normalizeAddress(addr: string): string {
  let clean = addr.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}

const PASS_MINT_FNS = new Set(['mint_pass', 'mint_pass_with_extra_credentials'])

type PassTicketFields = {
  source: number
  nullifiers: number[][]
  commitment: number[]
  expiresAt: bigint
  bffSig: number[]
}

function parsePassTicketFromArgs(
  getPureBytes: (arg: any) => Uint8Array | null,
  args: any[],
  ticketBase: number
): PassTicketFields | null {
  const sourceBytes = getPureBytes(args[ticketBase])
  const nullifierBytes = getPureBytes(args[ticketBase + 1])
  const commitmentBytes = getPureBytes(args[ticketBase + 2])
  const expiresAtBytes = getPureBytes(args[ticketBase + 3])
  const bffSigBytes = getPureBytes(args[ticketBase + 4])
  if (!sourceBytes || !nullifierBytes || !commitmentBytes || !expiresAtBytes || !bffSigBytes) {
    return null
  }
  return {
    source: bcs.u8().parse(sourceBytes),
    nullifiers: bcs.vector(bcs.vector(bcs.u8())).parse(nullifierBytes).map((n: number[]) => Array.from(n)),
    commitment: Array.from(bcs.vector(bcs.u8()).parse(commitmentBytes)),
    expiresAt: BigInt(bcs.u64().parse(expiresAtBytes)),
    bffSig: Array.from(bcs.vector(bcs.u8()).parse(bffSigBytes)),
  }
}

function extractPassTicketsFromMoveCall(
  getPureBytes: (arg: any) => Uint8Array | null,
  fn: string,
  args: any[]
): PassTicketFields[] | null {
  if (fn === 'update_pass_credential') {
    const ticket = parsePassTicketFromArgs(getPureBytes, args, 3)
    return ticket ? [ticket] : null
  }
  if (fn === 'mint_pass') {
    const ticket = parsePassTicketFromArgs(getPureBytes, args, 4)
    return ticket ? [ticket] : null
  }
  if (fn === 'mint_pass_with_extra_credentials') {
    const primary = parsePassTicketFromArgs(getPureBytes, args, 4)
    if (!primary) return null

    const extraSourcesBytes = getPureBytes(args[9])
    const extraNullifiersBytes = getPureBytes(args[10])
    const extraCommitmentsBytes = getPureBytes(args[11])
    const extraExpiresAtBytes = getPureBytes(args[12])
    const extraBffSigsBytes = getPureBytes(args[13])
    if (
      !extraSourcesBytes ||
      !extraNullifiersBytes ||
      !extraCommitmentsBytes ||
      !extraExpiresAtBytes ||
      !extraBffSigsBytes
    ) {
      return null
    }

    const extraSources = bcs.vector(bcs.u8()).parse(extraSourcesBytes)
    const extraNullifiers = bcs.vector(bcs.vector(bcs.vector(bcs.u8()))).parse(extraNullifiersBytes)
    const extraCommitments = bcs.vector(bcs.vector(bcs.u8())).parse(extraCommitmentsBytes)
    const extraExpiresAt = bcs.vector(bcs.u64()).parse(extraExpiresAtBytes)
    const extraBffSigs = bcs.vector(bcs.vector(bcs.u8())).parse(extraBffSigsBytes)

    const len = extraSources.length
    if (
      len !== extraNullifiers.length ||
      len !== extraCommitments.length ||
      len !== extraExpiresAt.length ||
      len !== extraBffSigs.length
    ) {
      return null
    }

    const tickets: PassTicketFields[] = [primary]
    for (let i = 0; i < len; i++) {
      tickets.push({
        source: extraSources[i],
        nullifiers: extraNullifiers[i].map((n: number[]) => Array.from(n)),
        commitment: Array.from(extraCommitments[i]),
        expiresAt: BigInt(extraExpiresAt[i]),
        bffSig: Array.from(extraBffSigs[i]),
      })
    }
    return tickets
  }
  return null
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

async function verifyPassTicketSignature(
  keypair: Ed25519Keypair,
  senderAddress: string,
  ticket: PassTicketFields
): Promise<{ ok: true } | { ok: false; status: number; error: string; message: string }> {
  const payloadBytes = TicketPayload.serialize({
    owner: senderAddress,
    source: ticket.source,
    nullifiers: ticket.nullifiers,
    commitment: ticket.commitment,
    expires_at: ticket.expiresAt,
  }).toBytes()

  const isValid = await keypair.getPublicKey().verify(payloadBytes, new Uint8Array(ticket.bffSig))
  if (!isValid) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_ticket_signature',
      message: 'The ticket signature in the transaction is invalid or tampered',
    }
  }

  if (Date.now() > Number(ticket.expiresAt)) {
    return {
      ok: false,
      status: 400,
      error: 'ticket_expired',
      message: 'The ticket has expired',
    }
  }

  return { ok: true }
}

function parseOptionVectorU8(bytes: Uint8Array | null): { isSome: boolean; payload: Uint8Array | null } {
  if (!bytes || bytes.length === 0) return { isSome: false, payload: null }
  if (bytes[0] === 0) return { isSome: false, payload: null }
  if (bytes[0] === 1) {
    try {
      const parsed = bcs.vector(bcs.u8()).parse(bytes.subarray(1))
      return { isSome: true, payload: new Uint8Array(parsed) }
    } catch {
      return { isSome: true, payload: null }
    }
  }
  return { isSome: false, payload: null }
}

let cachedDynamicGas: bigint | null = null
let lastFetchedTime = 0
const CACHE_DURATION_MS = 60_000 // 1 minute

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

    let maxGas = minAmount
    if (res?.data && res.data.length > 0) {
      for (const txBlock of res.data) {
        if (txBlock.effects?.status?.status === 'success' && txBlock.effects.gasUsed) {
          const computationCost = BigInt(txBlock.effects.gasUsed.computationCost || '0')
          const storageCost = BigInt(txBlock.effects.gasUsed.storageCost || '0')
          const storageRebate = BigInt(txBlock.effects.gasUsed.storageRebate || '0')
          const netGas = computationCost + storageCost - storageRebate
          if (netGas > maxGas) {
            maxGas = netGas
          }
        }
      }
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
        return reply.status(400).send({ error: 'Missing txBytes or senderAddress' })
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
        const ticketIssuerKeypair = loadTicketIssuerKeypair()

        // 1. Reconstruct transaction from transaction kind
        const tx = Transaction.fromKind(Buffer.from(txBytes, 'base64'))
        
        // Audit PTB commands: only survey_vault::claim and survey_pass mint/update allowed
        const commands = tx.getData().commands
        if (!commands || commands.length === 0) {
          return reply.status(400).send({
            error: 'invalid_transaction_commands',
            message: 'No commands in transaction',
          })
        }

        // Helpers to extract pure inputs
        const getPureBytes = (arg: any): Uint8Array | null => {
          if (arg && arg.$kind === 'Input') {
            const input = tx.getData().inputs[arg.Input]
            if (input && input.$kind === 'Pure') {
              const pureVal = input.Pure
              if (pureVal) {
                if (pureVal.bytes) return new Uint8Array(Buffer.from(pureVal.bytes, 'base64'))
                if (typeof pureVal === 'string') return new Uint8Array(Buffer.from(pureVal, 'base64'))
                if (Array.isArray(pureVal)) return new Uint8Array(pureVal)
              }
            }
          }
          return null
        }

        let isPassSponsor = false
        let isPlatformSponsor = false
        let vaultId: string | null = null
        let passId: string | null = null
        let claimGasCompensationAmount: bigint | null = null
        let claimStorageCompensationAmount: bigint | null = null
        let claimHasBlob = false

        for (const command of commands) {
          if (command.$kind !== 'MoveCall') {
            return reply.status(400).send({
              error: 'invalid_transaction_commands',
              message: 'Only MoveCall commands are allowed',
            })
          }
          const call = command.MoveCall
          if (!call) {
            return reply.status(400).send({
              error: 'invalid_transaction_commands',
              message: 'Missing MoveCall data',
            })
          }

          const expectedPackage = process.env.SUI_PACKAGE_ID
          if (expectedPackage) {
            if (normalizeAddress(call.package) !== normalizeAddress(expectedPackage)) {
              return reply.status(400).send({
                error: 'invalid_transaction_commands',
                message: 'Invalid package ID',
              })
            }
          }

          if (call.module === 'survey_pass') {
            if (
              call.function !== 'mint_pass' &&
              call.function !== 'mint_pass_with_extra_credentials' &&
              call.function !== 'update_pass_credential'
            ) {
              return reply.status(400).send({
                error: 'invalid_transaction_commands',
                message:
                  'Only mint_pass, mint_pass_with_extra_credentials, or update_pass_credential allowed in survey_pass module',
              })
            }
            isPassSponsor = true
          } else if (call.module === 'survey_vault') {
            if (
              call.function !== 'claim' &&
              call.function !== 'claim_with_ticket' &&
              call.function !== 'claim_with_nft_marking'
            ) {
              return reply.status(400).send({
                error: 'invalid_transaction_commands',
                message: 'Only claim, claim_with_ticket, or claim_with_nft_marking allowed in survey_vault module',
              })
            }
          } else {
            return reply.status(400).send({
              error: 'invalid_transaction_commands',
              message: `Unauthorized module: ${call.module}`,
            })
          }
        }

        if (isPassSponsor) {
          for (const command of commands) {
            const call = command.MoveCall!
            if (call.module !== 'survey_pass') continue

            if (PASS_MINT_FNS.has(call.function)) {
              const depositPayerBytes = getPureBytes(call.arguments[3])
              if (!depositPayerBytes) {
                return reply.status(400).send({
                  error: 'invalid_transaction_arguments',
                  message: 'Failed to extract deposit_payer from mint call',
                })
              }
              const depositPayer = normalizeAddress('0x' + Buffer.from(depositPayerBytes).toString('hex'))
              if (depositPayer !== normalizeAddress(sponsorAddress)) {
                return reply.status(400).send({
                  error: 'invalid_deposit_payer',
                  message: 'Sponsored mint must set deposit_payer to the sponsor address',
                })
              }
            }

            const tickets = extractPassTicketsFromMoveCall(getPureBytes, call.function, call.arguments)
            if (!tickets || tickets.length === 0) {
              return reply.status(400).send({
                error: 'invalid_transaction_arguments',
                message: 'Failed to extract ticket parameters from transaction inputs',
              })
            }

            for (const ticket of tickets) {
              const verifyRes = await verifyPassTicketSignature(ticketIssuerKeypair, senderAddress, ticket)
              if (!verifyRes.ok) {
                return reply.status(verifyRes.status).send({
                  error: verifyRes.error,
                  message: verifyRes.message,
                })
              }
            }
          }

          const scope = resolveCountScope()
          const checkRes = await checkSponsorLimit({
            suiClient: deps.suiClient,
            senderAddress,
            sponsorAddress,
            maxLimit: scope.passMax,
            packageId: scope.packageId,
            sinceMs: scope.sinceMs,
          })

          if (!checkRes.allowed) {
            return reply.status(403).send({
              error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
              message: 'SurveyPass lifetime sponsor limit reached for this wallet address',
            })
          }
        } else {
          // Extract Vault and Pass object IDs from claim call
          const call = commands[0].MoveCall!

          let answersArg: any = null
          let blobIdArg: any = null

          if (call.function === 'claim') {
            answersArg = call.arguments[3]
            blobIdArg = call.arguments[4]

            const firstArg = call.arguments[0]
            if (firstArg && firstArg.$kind === 'Input') {
              vaultId = getObjectIdFromInput(tx.getData().inputs[firstArg.Input])
            }

            const thirdArg = call.arguments[2]
            if (thirdArg && thirdArg.$kind === 'Input') {
              passId = getObjectIdFromInput(tx.getData().inputs[thirdArg.Input])
            }
          } else if (call.function === 'claim_with_ticket') {
            answersArg = call.arguments[5]
            blobIdArg = call.arguments[6]

            const firstArg = call.arguments[0]
            if (firstArg && firstArg.$kind === 'Input') {
              vaultId = getObjectIdFromInput(tx.getData().inputs[firstArg.Input])
            }
          } else if (call.function === 'claim_with_nft_marking') {
            answersArg = call.arguments[2]
            blobIdArg = call.arguments[3]

            const firstArg = call.arguments[0]
            if (firstArg && firstArg.$kind === 'Input') {
              vaultId = getObjectIdFromInput(tx.getData().inputs[firstArg.Input])
            }
          }

          const answersParsed = parseOptionVectorU8(
            answersArg ? getPureBytes(answersArg) : null
          )
          const blobParsed = parseOptionVectorU8(blobIdArg ? getPureBytes(blobIdArg) : null)

          if (answersParsed.isSome && blobParsed.isSome) {
            return reply.status(400).send({
              error: 'ambiguous_answer_payload',
              message: 'Cannot set both inline encrypted_answers and answer_blob_id',
            })
          }

          if (!vaultId) {
            return reply.status(400).send({
              error: 'invalid_transaction_commands',
              message: 'Failed to extract SurveyVault ID',
            })
          }

          // Fetch SurveyVault fields to verify gas
          const vaultObj = await deps.suiClient.getObject({
            id: vaultId,
            options: { showContent: true },
          })

          if (!vaultObj.data || !vaultObj.data.content) {
            return reply.status(404).send({
              error: 'vault_not_found',
              message: `SurveyVault ${vaultId} not found`,
            })
          }

          const fields = (vaultObj.data.content as any).fields
          if (!fields) {
            return reply.status(500).send({
              error: 'invalid_vault_object',
              message: 'Failed to read vault fields',
            })
          }

          const vaultMaxInline = BigInt(fields.max_inline_answer_bytes ?? '6144')
          const inlineLimit = effectiveInlineLimit(vaultMaxInline)

          if (answersParsed.isSome && answersParsed.payload) {
            if (answersParsed.payload.length > inlineLimit) {
              return reply.status(400).send({
                error: 'inline_answer_too_large',
                message: `Encrypted answers payload exceeds inline limit (${inlineLimit} bytes); use Walrus storage`,
              })
            }
          }

          if (blobParsed.isSome && blobParsed.payload && blobParsed.payload.length > 1000) {
            return reply.status(400).send({
              error: 'blob_id_too_large',
              message: 'Answer blob_id size exceeds limit',
            })
          }

          claimHasBlob = blobParsed.isSome
          claimGasCompensationAmount = BigInt(fields.gas_compensation_amount || '0')
          claimStorageCompensationAmount = BigInt(fields.storage_compensation_amount || '0')

          const gasBalance = BigInt(fields.gas_balance || '0')
          const gasCompensationAmount = claimGasCompensationAmount

          if (gasBalance < gasCompensationAmount) {
            isPlatformSponsor = true
          }

          if (isPlatformSponsor) {
            const todayStr = todayUtcDate()
            const dailyCount = await getPlatformSponsorCount(senderAddress, todayStr)
            const dailyLimit = platformSponsorDailyLimit()

            if (dailyCount >= dailyLimit) {
              return reply.status(403).send({
                error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
                message: 'Daily platform sponsorship limit reached for this wallet address',
              })
            }

            const tierCheck = await assertPlatformSponsorTierEligible(
              deps.suiClient,
              deps.packageId,
              senderAddress,
              gasConfig.minPlatformSponsorTier,
              passId
            )
            if (!tierCheck.ok) {
              return reply.status(403).send({
                error: tierCheck.error,
                message: tierCheck.message,
              })
            }
          }
        }

        const pipelineContext = {
          isPassSponsor,
          isPlatformSponsor,
          claimGasCompensationAmount: claimGasCompensationAmount?.toString() ?? null,
          claimStorageCompensationAmount: claimStorageCompensationAmount?.toString() ?? null,
          claimHasBlob,
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
          if (isPlatformSponsor) {
            await incrementPlatformSponsorCount(senderAddress, todayUtcDate())
          }
          if (isPassSponsor) {
            reserveSponsor(senderAddress)
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
          onPlatformSponsorSigned: isPlatformSponsor
            ? async () => {
                await incrementPlatformSponsorCount(senderAddress, todayUtcDate())
              }
            : undefined,
          onPassSponsorSigned: isPassSponsor ? () => reserveSponsor(senderAddress) : undefined,
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
}
