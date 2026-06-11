import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import { bcs } from '@mysten/sui/bcs'
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import type { SponsorPipelineContext } from './types.js'
import { extractPassTicketsFromMoveCall, verifyPassTicketSignature } from './passTicketValidation.js'
import { normalizeAddress, getPureBytes as sharedGetPureBytes } from './txUtils.js'

export type SponsorValidationError = {
  ok: false
  status: number
  error: string
  message: string
}

export type SponsorValidationSuccess = {
  ok: true
  pipelineContext: SponsorPipelineContext
  isPassSponsor: boolean
  isPlatformSponsor: boolean
}

export type SponsorValidationOutcome = SponsorValidationError | SponsorValidationSuccess

export interface SponsorValidationHooks {
  checkPassSponsorLimit?: (input: {
    senderAddress: string
    sponsorAddress: string
  }) => Promise<{ allowed: boolean }>
  getPlatformSponsorDailyCount?: (senderAddress: string, day: string) => Promise<number>
  platformSponsorDailyLimit?: () => number
  todayUtcDate?: () => string
  assertPlatformTierEligible?: (input: {
    senderAddress: string
    passId: string | null
  }) => Promise<SponsorValidationError | { ok: true }>
  effectiveInlineLimit?: (vaultMaxInline: bigint) => number
}

export interface ValidateSponsorTransactionInput {
  txBytes: string
  senderAddress: string
  packageId: string
  sponsorAddress: string
  suiClient: SuiClient
  ticketIssuerKeypair: Ed25519Keypair
  hooks?: SponsorValidationHooks
  options?: {
    enforcePassLimit?: boolean
    enforcePlatformQuota?: boolean
    enforcePlatformTier?: boolean
  }
}

const PASS_MINT_FNS = new Set(['mint_pass', 'mint_pass_with_extra_credentials'])
const ALLOWED_PASS_FNS = new Set([
  'mint_pass',
  'mint_pass_with_extra_credentials',
  'update_pass_credential',
])
const DEFAULT_MAX_INLINE_ANSWER_BYTES = 6144
const MAX_EXTRA_CREDENTIALS = 2
const MAX_OPTION_PAYLOAD_BYTES = 65_536

function pureInputBytes(input: unknown): Uint8Array | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as { $kind?: string; Pure?: unknown }
  if (obj.$kind !== 'Pure' || !obj.Pure) return null
  const pureVal = obj.Pure
  if (typeof pureVal === 'object' && pureVal !== null && 'bytes' in pureVal) {
    const bytes = (pureVal as { bytes?: string }).bytes
    if (bytes) return new Uint8Array(Buffer.from(bytes, 'base64'))
  }
  if (typeof pureVal === 'string') return new Uint8Array(Buffer.from(pureVal, 'base64'))
  if (Array.isArray(pureVal)) return new Uint8Array(pureVal)
  return null
}

function getObjectIdFromInput(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  if (typeof input === 'string') return input
  const obj = input as Record<string, unknown>
  const pureBytes = pureInputBytes(input)
  if (pureBytes && pureBytes.length === 32) {
    return '0x' + Buffer.from(pureBytes).toString('hex')
  }
  const unresolved = obj.UnresolvedObject as { objectId?: string } | undefined
  if (unresolved?.objectId) return unresolved.objectId
  const inner = obj.Object as
    | { ImmOrOwnedObject?: { objectId?: string }; SharedObject?: { objectId?: string } }
    | undefined
  if (inner?.ImmOrOwnedObject?.objectId) return inner.ImmOrOwnedObject.objectId
  if (inner?.SharedObject?.objectId) return inner.SharedObject.objectId
  return null
}

function parseOptionVectorU8(bytes: Uint8Array | null): { isSome: boolean; payload: Uint8Array | null } {
  if (!bytes || bytes.length === 0) return { isSome: false, payload: null }
  if (bytes.length > MAX_OPTION_PAYLOAD_BYTES) {
    throw new Error('malformed_option')
  }
  if (bytes[0] === 0) {
    if (bytes.length !== 1) throw new Error('malformed_option')
    return { isSome: false, payload: null }
  }
  if (bytes[0] === 1) {
    try {
      const parsed = bcs.vector(bcs.u8()).parse(bytes.subarray(1))
      return { isSome: true, payload: new Uint8Array(parsed) }
    } catch {
      throw new Error('malformed_option')
    }
  }
  throw new Error('malformed_option')
}

function defaultEffectiveInlineLimit(vaultMaxInline: bigint): number {
  const onChain = Number(vaultMaxInline)
  if (!Number.isFinite(onChain) || onChain <= 0) return DEFAULT_MAX_INLINE_ANSWER_BYTES
  return Math.min(DEFAULT_MAX_INLINE_ANSWER_BYTES, onChain)
}

function err(status: number, error: string, message: string): SponsorValidationError {
  return { ok: false, status, error, message }
}

export async function validateSponsorTransaction(
  input: ValidateSponsorTransactionInput
): Promise<SponsorValidationOutcome> {
  const {
    txBytes,
    senderAddress,
    packageId,
    sponsorAddress,
    suiClient,
    ticketIssuerKeypair,
    hooks = {},
    options = {},
  } = input
  const enforcePassLimit = options.enforcePassLimit !== false
  const enforcePlatformQuota = options.enforcePlatformQuota !== false
  const enforcePlatformTier = options.enforcePlatformTier !== false
  const inlineLimitFn = hooks.effectiveInlineLimit ?? defaultEffectiveInlineLimit

  const tx = Transaction.fromKind(Buffer.from(txBytes, 'base64'))
  const commands = tx.getData().commands
  if (!commands || commands.length === 0) {
    return err(400, 'invalid_transaction_commands', 'No commands in transaction')
  }

  const getPureBytes = (arg: unknown): Uint8Array | null => sharedGetPureBytes(tx, arg)

  let hasPass = false
  let claimCount = 0

  for (const command of commands) {
    if (command.$kind !== 'MoveCall') {
      return err(400, 'invalid_transaction_commands', 'Only MoveCall commands are allowed')
    }
    const call = command.MoveCall
    if (!call) {
      return err(400, 'invalid_transaction_commands', 'Missing MoveCall data')
    }
    if (normalizeAddress(call.package) !== normalizeAddress(packageId)) {
      return err(400, 'invalid_transaction_commands', 'Invalid package ID')
    }
    if (call.module === 'survey_pass') {
      if (!ALLOWED_PASS_FNS.has(call.function)) {
        return err(
          400,
          'invalid_transaction_commands',
          'Only mint_pass, mint_pass_with_extra_credentials, or update_pass_credential allowed in survey_pass module'
        )
      }
      hasPass = true
    } else if (call.module === 'survey_vault') {
      if (call.function !== 'claim') {
        return err(400, 'invalid_transaction_commands', 'Only survey_vault::claim is allowed')
      }
      claimCount++
    } else {
      return err(400, 'invalid_transaction_commands', `Unauthorized module: ${call.module}`)
    }
  }

  if (hasPass && claimCount > 0) {
    return err(
      400,
      'invalid_transaction_commands',
      'Cannot mix survey_pass and survey_vault::claim in the same sponsored transaction'
    )
  }
  if (claimCount > 1) {
    return err(
      400,
      'invalid_transaction_commands',
      'Only one survey_vault::claim command is allowed per sponsored transaction'
    )
  }
  if (claimCount === 1 && commands.length !== 1) {
    return err(
      400,
      'invalid_transaction_commands',
      'Claim sponsorship requires a single-command PTB containing only survey_vault::claim'
    )
  }

  const isPassSponsor = hasPass
  let isPlatformSponsor = false
  let claimGasCompensationAmount: bigint | null = null
  let claimStorageCompensationAmount: bigint | null = null
  let claimHasBlob = false
  let passId: string | null = null

  if (isPassSponsor) {
    for (const command of commands) {
      const call = command.MoveCall!
      if (call.module !== 'survey_pass') continue
      if (PASS_MINT_FNS.has(call.function)) {
        const depositPayerBytes = getPureBytes(call.arguments[3])
        if (!depositPayerBytes) {
          return err(
            400,
            'invalid_transaction_arguments',
            'Failed to extract deposit_payer from mint call'
          )
        }
        const depositPayer = normalizeAddress('0x' + Buffer.from(depositPayerBytes).toString('hex'))
        if (depositPayer !== normalizeAddress(sponsorAddress)) {
          return err(
            400,
            'invalid_deposit_payer',
            'Sponsored mint must set deposit_payer to the sponsor address'
          )
        }
      }
      const tickets = extractPassTicketsFromMoveCall(getPureBytes, call.function, call.arguments)
      if (!tickets || tickets.length === 0) {
        return err(
          400,
          'invalid_transaction_arguments',
          'Failed to extract ticket parameters from transaction inputs'
        )
      }
      if (
        call.function === 'mint_pass_with_extra_credentials' &&
        tickets.length - 1 > MAX_EXTRA_CREDENTIALS
      ) {
        return err(
          400,
          'too_many_extra_credentials',
          `At most ${MAX_EXTRA_CREDENTIALS} extra credentials are allowed per mint`
        )
      }
      for (const ticket of tickets) {
        const verifyRes = await verifyPassTicketSignature(ticketIssuerKeypair, senderAddress, ticket)
        if (!verifyRes.ok) {
          return err(verifyRes.status, verifyRes.error, verifyRes.message)
        }
      }
    }
    if (enforcePassLimit && hooks.checkPassSponsorLimit) {
      const checkRes = await hooks.checkPassSponsorLimit({ senderAddress, sponsorAddress })
      if (!checkRes.allowed) {
        return err(
          403,
          'PLATFORM_SPONSOR_LIMIT_REACHED',
          'SurveyPass lifetime sponsor limit reached for this wallet address'
        )
      }
    }
  } else {
    const call = commands[0].MoveCall!
    let answersArg: unknown = null
    let blobIdArg: unknown = null
    let vaultId: string | null = null
    if (call.function === 'claim') {
      answersArg = call.arguments[12]
      blobIdArg = call.arguments[13]
      const firstArg = call.arguments[0]
      if (firstArg && typeof firstArg === 'object' && (firstArg as { $kind?: string }).$kind === 'Input') {
        vaultId = getObjectIdFromInput(tx.getData().inputs[(firstArg as { Input: number }).Input])
      }
      const usePassArg = call.arguments[3]
      const usePassBytes = usePassArg ? getPureBytes(usePassArg) : null
      const usePass = usePassBytes ? bcs.bool().parse(usePassBytes) : true
      if (usePass) {
        const passArg = call.arguments[4]
        if (passArg && typeof passArg === 'object' && (passArg as { $kind?: string }).$kind === 'Input') {
          passId = getObjectIdFromInput(tx.getData().inputs[(passArg as { Input: number }).Input])
        }
      }
    }
    let answersParsed: { isSome: boolean; payload: Uint8Array | null }
    let blobParsed: { isSome: boolean; payload: Uint8Array | null }
    try {
      answersParsed = parseOptionVectorU8(answersArg ? getPureBytes(answersArg) : null)
      blobParsed = parseOptionVectorU8(blobIdArg ? getPureBytes(blobIdArg) : null)
    } catch {
      return err(400, 'malformed_option', 'Malformed Option argument in claim parameters')
    }
    if (answersParsed.isSome && blobParsed.isSome) {
      return err(
        400,
        'ambiguous_answer_payload',
        'Cannot set both inline encrypted_answers and answer_blob_id'
      )
    }
    if (!vaultId) {
      return err(400, 'invalid_transaction_commands', 'Failed to extract SurveyVault ID')
    }
    const vaultObj = await suiClient.getObject({
      id: vaultId,
      options: { showContent: true },
    })
    if (!vaultObj.data || !vaultObj.data.content) {
      return err(404, 'vault_not_found', `SurveyVault ${vaultId} not found`)
    }
    const fields = (vaultObj.data.content as { fields?: Record<string, unknown> }).fields
    if (!fields) {
      return err(500, 'invalid_vault_object', 'Failed to read vault fields')
    }
    const vaultMaxInline = BigInt((fields.max_inline_answer_bytes as string | number | undefined) ?? '6144')
    const inlineLimit = inlineLimitFn(vaultMaxInline)
    if (answersParsed.isSome && answersParsed.payload) {
      if (answersParsed.payload.length > inlineLimit) {
        return err(
          400,
          'inline_answer_too_large',
          `Encrypted answers payload exceeds inline limit (${inlineLimit} bytes); use Walrus storage`
        )
      }
    }
    if (blobParsed.isSome && blobParsed.payload && blobParsed.payload.length > 1000) {
      return err(400, 'blob_id_too_large', 'Answer blob_id size exceeds limit')
    }
    claimHasBlob = blobParsed.isSome
    claimGasCompensationAmount = BigInt((fields.gas_compensation_amount as string | number | undefined) ?? '0')
    claimStorageCompensationAmount = BigInt(
      (fields.storage_compensation_amount as string | number | undefined) ?? '0'
    )
    const gasBalance = BigInt((fields.gas_balance as string | undefined) ?? '0')
    // F46: 與鏈上逐筆回補條件對齊——含 blob 的領取負債為 gas_comp + storage_comp
    // （survey_vault.move:655-660）。只判 gas_comp 會讓部分償付不足的 blob 領取逃過
    // 平台日額度。任何因 gas_comp 被調高造成的缺口都導入有上限的平台路徑。
    const requiredLiability =
      claimGasCompensationAmount + (claimHasBlob ? claimStorageCompensationAmount : 0n)
    if (gasBalance < requiredLiability) {
      isPlatformSponsor = true
    }
    if (isPlatformSponsor && enforcePlatformQuota && hooks.getPlatformSponsorDailyCount) {
      const todayStr = hooks.todayUtcDate?.() ?? new Date().toISOString().slice(0, 10)
      const dailyCount = await hooks.getPlatformSponsorDailyCount(senderAddress, todayStr)
      const dailyLimit = hooks.platformSponsorDailyLimit?.() ?? 0
      if (dailyCount >= dailyLimit) {
        return err(
          403,
          'PLATFORM_SPONSOR_LIMIT_REACHED',
          'Daily platform sponsorship limit reached for this wallet address'
        )
      }
    }
    if (isPlatformSponsor && enforcePlatformTier && hooks.assertPlatformTierEligible) {
      const tierCheck = await hooks.assertPlatformTierEligible({ senderAddress, passId })
      if (!tierCheck.ok) {
        return err(tierCheck.status, tierCheck.error, tierCheck.message)
      }
    }
  }

  return {
    ok: true,
    isPassSponsor,
    isPlatformSponsor,
    pipelineContext: {
      isPassSponsor,
      isPlatformSponsor,
      claimGasCompensationAmount: claimGasCompensationAmount?.toString() ?? null,
      claimStorageCompensationAmount: claimStorageCompensationAmount?.toString() ?? null,
      claimHasBlob,
    },
  }
}
