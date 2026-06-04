import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Transaction } from '@mysten/sui/transactions'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { SuiClient } from '@mysten/sui/client'
import { bcs } from '@mysten/sui/bcs'
import { TicketPayload } from '../auth/ticket.js'
import { checkSponsorLimit, reserveSponsor, getSponsorCount } from './sponsorLedger.js'
import { resolveCountScope } from './sponsorPolicy.js'

interface GasSponsorRequestBody {
  txBytes: string // base64 encoded transaction kind
  senderAddress: string
}

const GAS_BUDGET_MIST = 50_000_000n
const HEALTH_MIN_BALANCE_MIST = GAS_BUDGET_MIST * 5n

export interface GasHealthResponse {
  available: boolean
  reason?: 'no_key' | 'low_balance' | 'unknown'
  sponsorAddress?: string
  gasCompensationAmount?: string
}

const platformSponsorLimitCache = new Map<string, { count: number; date: string }>()

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
  deps: { suiClient: SuiClient; packageId: string }
): void {
  app.get('/api/gas/health', async (_req, reply): Promise<GasHealthResponse> => {
    try {
      const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
      if (!privKeyHex) {
        return { available: false, reason: 'no_key' }
      }
      const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
      const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
      const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes.slice(0, 32))
      const sponsorAddress = keypair.getPublicKey().toSuiAddress()

      const balance = await deps.suiClient.getBalance({
        owner: sponsorAddress,
        coinType: '0x2::sui::SUI',
      })

      const minAmountStr = (
        process.env.MIN_GAS_COMPENSATION_AMOUNT ||
          process.env.GAS_COMPENSATION_AMOUNT ||
          '5000000'
      ).replace(/_/g, '').replace(/,/g, '')
      const minAmount = BigInt(minAmountStr)
      const dynamicAmount = await calculateDynamicGasCompensation(
        deps.suiClient,
        deps.packageId,
        minAmount
      )

      if (BigInt(balance.totalBalance) < HEALTH_MIN_BALANCE_MIST) {
        return {
          available: false,
          reason: 'low_balance',
          sponsorAddress,
          gasCompensationAmount: dynamicAmount.toString(),
        }
      }
      return {
        available: true,
        sponsorAddress,
        gasCompensationAmount: dynamicAmount.toString(),
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
        const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
        if (!privKeyHex) {
          throw new Error('SURVEY_PASS_ISSUER_PRIV is not set')
        }

        const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
        const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
        const keypairBytes = privateKeyBytes.slice(0, 32)
        const keypair = Ed25519Keypair.fromSecretKey(keypairBytes)
        const sponsorAddress = keypair.getPublicKey().toSuiAddress()

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

  app.post(
    '/api/gas/sponsor',
    async (req: FastifyRequest<{ Body: GasSponsorRequestBody }>, reply: FastifyReply) => {
      const { txBytes, senderAddress } = req.body
      if (!txBytes || !senderAddress) {
        return reply.status(400).send({ error: 'Missing txBytes or senderAddress' })
      }

      try {
        const privKeyHex = process.env.SURVEY_PASS_ISSUER_PRIV
        if (!privKeyHex) {
          throw new Error('SURVEY_PASS_ISSUER_PRIV is not set')
        }

        const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
        const privateKeyBytes = new Uint8Array(Buffer.from(privKeyClean, 'hex'))
        const keypairBytes = privateKeyBytes.slice(0, 32)
        const keypair = Ed25519Keypair.fromSecretKey(keypairBytes)
        const sponsorAddress = keypair.getPublicKey().toSuiAddress()

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

        let isPassSponsor = false
        let isPlatformSponsor = false
        let vaultId: string | null = null
        let passId: string | null = null

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
            if (call.function !== 'mint_pass' && call.function !== 'update_pass_credential') {
              return reply.status(400).send({
                error: 'invalid_transaction_commands',
                message: 'Only mint_pass or update_pass_credential allowed in survey_pass module',
              })
            }
            isPassSponsor = true
          } else if (call.module === 'survey_vault') {
            if (call.function !== 'claim') {
              return reply.status(400).send({
                error: 'invalid_transaction_commands',
                message: 'Only claim allowed in survey_vault module',
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
          const call = commands[0].MoveCall!

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

          // mint_pass args: [registry, config, owner, deposit_payer, source, nullifiers,
          //                  commitment, expires_at, bff_sig, clock]
          // update_pass_credential args: [pass, registry, config, source, nullifiers,
          //                  commitment, expires_at, bff_sig, clock]
          // 只有 mint_pass 帶 deposit_payer（位置 3）；以函式名區分索引。
          const isMint = call.function === 'mint_pass'
          const ticketBase = isMint ? 4 : 3

          // mint_pass 必須宣告 deposit_payer == sponsorAddress：防止使用者在「代付鑄造」時
          // 把 deposit_payer 設成自己，事後自刪盜取由項目方支付的儲存返還。
          if (isMint) {
            const depositPayerBytes = getPureBytes(call.arguments[3])
            if (!depositPayerBytes) {
              return reply.status(400).send({
                error: 'invalid_transaction_arguments',
                message: 'Failed to extract deposit_payer from mint_pass',
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

          const sourceBytes = getPureBytes(call.arguments[ticketBase])
          const nullifierBytes = getPureBytes(call.arguments[ticketBase + 1])
          const commitmentBytes = getPureBytes(call.arguments[ticketBase + 2])
          const expiresAtBytes = getPureBytes(call.arguments[ticketBase + 3])
          const bffSigBytes = getPureBytes(call.arguments[ticketBase + 4])

          if (!sourceBytes || !nullifierBytes || !commitmentBytes || !expiresAtBytes || !bffSigBytes) {
            return reply.status(400).send({
              error: 'invalid_transaction_arguments',
              message: 'Failed to extract ticket parameters from transaction inputs',
            })
          }

          const source = bcs.u8().parse(sourceBytes)
          const nullifiersList = bcs.vector(bcs.vector(bcs.u8())).parse(nullifierBytes)
          const commitment = bcs.vector(bcs.u8()).parse(commitmentBytes)
          const expiresAt = bcs.u64().parse(expiresAtBytes)
          const bffSig = bcs.vector(bcs.u8()).parse(bffSigBytes)

          const commitmentArr = new Uint8Array(commitment)
          const bffSigArr = new Uint8Array(bffSig)

          // Re-serialize and verify Ticket Signature
          const payloadBytes = TicketPayload.serialize({
            owner: senderAddress,
            source,
            nullifiers: nullifiersList.map((n: number[]) => Array.from(n)),
            commitment: Array.from(commitmentArr),
            expires_at: expiresAt,
          }).toBytes()

          const isValid = await keypair.getPublicKey().verify(payloadBytes, bffSigArr)
          if (!isValid) {
            return reply.status(400).send({
              error: 'invalid_ticket_signature',
              message: 'The ticket signature in the transaction is invalid or tampered',
            })
          }

          // Check if ticket expired
          if (Date.now() > Number(expiresAt)) {
            return reply.status(400).send({
              error: 'ticket_expired',
              message: 'The ticket has expired',
            })
          }

          // Read-only quota check (on-chain truth + in-flight reservations).
          // We do NOT consume quota here — that happens via reserveSponsor() only
          // after the sponsor signature is produced, so a pre-flight dry-run
          // rejection or abandoned request never burns a count.
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
          const firstArg = call.arguments[0]
          if (firstArg && firstArg.$kind === 'Input') {
            vaultId = getObjectIdFromInput(tx.getData().inputs[firstArg.Input])
          }

          const secondArg = call.arguments[1]
          if (secondArg && secondArg.$kind === 'Input') {
            passId = getObjectIdFromInput(tx.getData().inputs[secondArg.Input])
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

          const gasBalance = BigInt(fields.gas_balance || '0')
          const gasCompensationAmount = BigInt(fields.gas_compensation_amount || '0')
          
          if (gasBalance < gasCompensationAmount) {
            isPlatformSponsor = true
          }

          if (isPlatformSponsor) {
            // Check platform sponsorship limits: max 3 per wallet per day
            const todayStr = new Date().toISOString().split('T')[0]
            let limitRecord = platformSponsorLimitCache.get(senderAddress)
            if (!limitRecord || limitRecord.date !== todayStr) {
              limitRecord = { count: 0, date: todayStr }
            }

            if (limitRecord.count >= 3) {
              return reply.status(403).send({
                error: 'PLATFORM_SPONSOR_LIMIT_REACHED',
                message: 'Daily platform sponsorship limit reached for this wallet address',
              })
            }

            // Check defense threshold min platform sponsor tier
            if (passId) {
              const passObj = await deps.suiClient.getObject({
                id: passId,
                options: { showContent: true },
              })
              if (!passObj.data || !passObj.data.content) {
                return reply.status(404).send({
                  error: 'pass_not_found',
                  message: `SurveyPass ${passId} not found`,
                })
              }
              const passFields = (passObj.data.content as any).fields
              if (!passFields) {
                return reply.status(500).send({
                  error: 'invalid_pass_object',
                  message: 'Failed to read pass fields',
                })
              }
              const tier = Number(passFields.effective_tier ?? 0)
              const minPlatformSponsorTier = Number(process.env.MIN_PLATFORM_SPONSOR_TIER ?? '0')
              if (tier < minPlatformSponsorTier) {
                return reply.status(403).send({
                  error: 'PLATFORM_SPONSOR_TIER_INSUFFICIENT',
                  message: 'SurveyPass tier is insufficient for platform sponsorship',
                })
              }
            }
          }
        }

        tx.setSender(senderAddress)
        tx.setGasOwner(sponsorAddress)

        // 2. Query available SUI gas coins owned by sponsor (fetch more to find a suitable one)
        const coinsRes = await deps.suiClient.getCoins({
          owner: sponsorAddress,
          coinType: '0x2::sui::SUI',
          limit: 50,
        })

        if (coinsRes.data.length === 0) {
          throw new Error(`Sponsor (${sponsorAddress}) has no SUI coins to pay for gas`)
        }

        // Find a coin with enough balance to cover the gas budget
        const gasCoin = coinsRes.data.find((c) => BigInt(c.balance) >= GAS_BUDGET_MIST)
        if (!gasCoin) {
          throw new Error(`Sponsor (${sponsorAddress}) has no SUI coin with balance >= ${GAS_BUDGET_MIST} MIST`)
        }
        tx.setGasPayment([
          {
            objectId: gasCoin.coinObjectId,
            version: gasCoin.version,
            digest: gasCoin.digest,
          },
        ])

        // 3. Set a gas budget (50M MIST to cover multiple nullifiers and storage deposits)
        tx.setGasBudget(Number(GAS_BUDGET_MIST))

        // 4. Build the full transaction block bytes
        const sponsoredTxBytes = await tx.build({ client: deps.suiClient })

        // 5. Dry run pre-flight check to prevent spamming
        const dryRun = await deps.suiClient.dryRunTransactionBlock({
          transactionBlock: Buffer.from(sponsoredTxBytes).toString('base64'),
        })

        if (dryRun.effects.status.status === 'failure') {
          req.log.warn(
            `[GasStation] Dry run simulation rejected transaction: ${dryRun.effects.status.error}`
          )
          return reply.status(422).send({
            error: 'dry_run_failed',
            message: dryRun.effects.status.error,
          })
        }

        // 6. Sign as sponsor
        const signatureResult = await keypair.signTransaction(sponsoredTxBytes)

        // Record the platform sponsorship count after successful signing
        if (isPlatformSponsor) {
          const todayStr = new Date().toISOString().split('T')[0]
          let limitRecord = platformSponsorLimitCache.get(senderAddress)
          if (!limitRecord || limitRecord.date !== todayStr) {
            limitRecord = { count: 0, date: todayStr }
          }
          limitRecord.count += 1
          platformSponsorLimitCache.set(senderAddress, limitRecord)
        }

        // Reserve the SurveyPass lifetime sponsorship after successful signing.
        // This is an optimistic, short-lived in-flight hold that prevents rapid
        // double-spend before the broadcast tx is indexed; it auto-expires, so an
        // abandoned (never-broadcast) request leaves no permanent count. Once the
        // tx actually lands on chain, countOnChainSponsoredTx takes over.
        if (isPassSponsor) {
          reserveSponsor(senderAddress)
        }

        return {
          sponsoredTxBytes: Buffer.from(sponsoredTxBytes).toString('base64'),
          sponsorSignature: signatureResult.signature,
        }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: 'sponsor_failed', message: err.message })
      }
    }
  )
}
