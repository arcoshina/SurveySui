import { Transaction } from '@mysten/sui/transactions'
import type { SuiClient } from '@mysten/sui/client'
import { bcs } from '@mysten/sui/bcs'
import {
  extractPassTicketsFromMoveCall,
  minEscapeClawbackFromGasUsed,
  normalizeAddress,
  getPureBytes,
  verifyPassTicketSignature,
  type PassTicketFields,
} from '@surveysui/gas-station-core'
import { signTicket, loadTicketIssuerKeypair } from '../auth/ticket.js'
import { loadSponsorSigner } from '../gas/sponsorSigner.js'
import { getGasConfig } from '../gas/gasConfig.js'

const ALLOWED_FNS = new Set([
  'mint_pass',
  'mint_pass_with_extra_credentials',
  'update_pass_credential',
])

const PLACEHOLDER_CLAWBACK = 1n

export type FinalizeTicketResult = {
  source: number
  nullifiers: string[]
  expires_at: string
  bff_sig: string
  escape_clawback_mist: string
}

function inputIndexOf(arg: unknown): number | null {
  if (!arg || typeof arg !== 'object') return null
  const a = arg as { $kind?: string; Input?: number }
  if (a.$kind !== 'Input' || typeof a.Input !== 'number') return null
  return a.Input
}

// 在「量 gas 的 dry-run」之前，對每個代付 primary ticket 同時注入：
//   1. clawback = PLACEHOLDER_CLAWBACK（通過 apply_*_escape_clawback：deposit≠owner 須 >0）
//   2. 對「該 placeholder clawback」重新簽過的 bff_sig（通過 verify_ticket：簽章涵蓋 clawback）
// 缺其一即會 abort：只改 clawback → abort 1(簽章不符)；不改 clawback → abort 13。
// clawback 數值不影響 gas（u64 定長），故量得的 gas 仍準確；量完再依實測 netGas 重簽最終 ticket。
// 注意：@mysten/sui 的 getData() 回傳唯讀快照，直接改 getData().inputs[i] 不會寫回交易；
// 必須以 Transaction.from() 用修改後的 inputs 重建一筆新交易。
export async function applySignedPlaceholders(
  tx: Transaction,
  sponsorAddress: string,
  senderAddress: string
): Promise<Transaction> {
  const data = tx.getData()
  // inputIndex -> 覆寫後的 Pure bytes(base64)
  const overrides = new Map<number, string>()

  for (const command of data.commands) {
    if (command.$kind !== 'MoveCall') continue
    const call = command.MoveCall
    if (!call || call.module !== 'survey_pass' || !ALLOWED_FNS.has(call.function)) continue

    const ticketBase = call.function === 'update_pass_credential' ? 3 : 4
    let isSponsored = false
    if (call.function === 'mint_pass' || call.function === 'mint_pass_with_extra_credentials') {
      const depositBytes = getPureBytes(tx, call.arguments[3])
      if (depositBytes) {
        const depositPayer = normalizeAddress('0x' + Buffer.from(depositBytes).toString('hex'))
        isSponsored = depositPayer === normalizeAddress(sponsorAddress)
      }
    } else {
      isSponsored = true
    }
    // 自付/非法情境留給下游嚴格迴圈把關；此處僅處理代付 primary。
    if (!isSponsored) continue

    const clawbackIdx = inputIndexOf(call.arguments[ticketBase + 4])
    const sigIdx = inputIndexOf(call.arguments[ticketBase + 5])
    if (clawbackIdx === null || sigIdx === null) continue

    const tickets = extractPassTicketsFromMoveCall(
      (arg) => getPureBytes(tx, arg),
      call.function,
      call.arguments
    )
    const primary = tickets?.[0]
    if (!primary) continue

    // owner 必為 senderAddress（合約 verify_ticket 以交易內 owner 重組 payload）。
    const signed = await signTicket(
      senderAddress,
      primary.source,
      primary.nullifiers.map((n) => new Uint8Array(n)),
      new Uint8Array(primary.commitment),
      Number(primary.expiresAt),
      PLACEHOLDER_CLAWBACK
    )
    const sigBytes = Buffer.from(signed.bff_sig, 'hex')

    overrides.set(
      clawbackIdx,
      Buffer.from(bcs.u64().serialize(PLACEHOLDER_CLAWBACK).toBytes()).toString('base64')
    )
    overrides.set(
      sigIdx,
      Buffer.from(bcs.vector(bcs.u8()).serialize(Array.from(sigBytes)).toBytes()).toString('base64')
    )
  }

  if (overrides.size === 0) return tx

  const newInputs = data.inputs.map((input, i) => {
    const b64 = overrides.get(i)
    if (b64 === undefined) return input
    return { $kind: 'Pure', Pure: { bytes: b64 } } as (typeof data.inputs)[number]
  })

  return Transaction.from(JSON.stringify({ ...data, inputs: newInputs }))
}

type TicketSlot = {
  commandIndex: number
  ticketIndex: number
  fields: PassTicketFields
  isSponsoredPrimary: boolean
}

// 驗證原始交易裡每一張 ticket（primary + extras）的既有 bff_sig 皆為發行者對
// 該身分欄位（含其原始 escape_clawback_mist，/auth 簽出時為 0）的合法簽章。
// 任一張驗章失敗即拋 400，阻止 finalize 對未經身分驗證的欄位重簽。
async function assertOriginTicketsAuthentic(tx: Transaction, senderAddress: string): Promise<void> {
  const issuerKeypair = loadTicketIssuerKeypair()
  const data = tx.getData()
  for (const command of data.commands) {
    if (command.$kind !== 'MoveCall') {
      throw Object.assign(new Error('Only survey_pass MoveCall commands are allowed'), {
        statusCode: 400,
      })
    }
    const call = command.MoveCall
    if (!call || call.module !== 'survey_pass' || !ALLOWED_FNS.has(call.function)) {
      throw Object.assign(
        new Error('Only mint_pass, mint_pass_with_extra_credentials, or update_pass_credential allowed'),
        { statusCode: 400 }
      )
    }
    const tickets = extractPassTicketsFromMoveCall(
      (arg) => getPureBytes(tx, arg),
      call.function,
      call.arguments
    )
    if (!tickets) {
      throw Object.assign(new Error('Failed to extract ticket fields from transaction'), {
        statusCode: 400,
      })
    }
    for (const ticket of tickets) {
      const verifyRes = await verifyPassTicketSignature(issuerKeypair, senderAddress, ticket)
      if (!verifyRes.ok) {
        throw Object.assign(
          new Error('Ticket was not issued by the identity verification flow; refusing to re-sign'),
          { statusCode: 400, code: 'invalid_origin_ticket' }
        )
      }
    }
  }
}

export async function finalizeSponsoredPassTickets(input: {
  suiClient: SuiClient
  txBytes: string
  senderAddress: string
}): Promise<{ tickets: FinalizeTicketResult[] }> {
  const sponsorSigner = loadSponsorSigner()
  if (!sponsorSigner) {
    throw Object.assign(new Error('Sponsor key not configured'), { statusCode: 503 })
  }
  const sponsorAddress = sponsorSigner.getSponsorAddress()

  const originalTx = Transaction.fromKind(Buffer.from(input.txBytes, 'base64'))

  // H1 防護：在重簽前，先驗證使用者交易裡「既有」的原始 bff_sig 確實出自 /auth。
  // 發行者私鑰只能對自己已簽過的身分欄位重簽，攻擊者偽造不出原始簽章即被擋下。
  // 必須以原始 txBytes 驗證——applySignedPlaceholders 會把 bff_sig 換成 placeholder 重簽版。
  await assertOriginTicketsAuthentic(originalTx, input.senderAddress)

  // 先以重建方式注入「已重簽的 placeholder ticket」（clawback + 對應 bff_sig），
  // 讓量 gas 的 dry-run 同時通過 verify_ticket 與 apply_*_escape_clawback。
  // getData() 為唯讀快照不可就地 mutate，故 applySignedPlaceholders 回傳新交易；再設 sender / gasOwner。
  const tx = await applySignedPlaceholders(originalTx, sponsorAddress, input.senderAddress)
  tx.setSender(input.senderAddress)
  tx.setGasOwner(sponsorAddress)

  const slots: TicketSlot[] = []
  for (let ci = 0; ci < tx.getData().commands.length; ci++) {
    const command = tx.getData().commands[ci]
    if (command.$kind !== 'MoveCall') {
      throw Object.assign(new Error('Only survey_pass MoveCall commands are allowed'), { statusCode: 400 })
    }
    const call = command.MoveCall
    if (!call || call.module !== 'survey_pass' || !ALLOWED_FNS.has(call.function)) {
      throw Object.assign(new Error('Only mint_pass, mint_pass_with_extra_credentials, or update_pass_credential allowed'), {
        statusCode: 400,
      })
    }

    const tickets = extractPassTicketsFromMoveCall(
      (arg) => getPureBytes(tx, arg),
      call.function,
      call.arguments
    )
    if (!tickets) {
      throw Object.assign(new Error('Failed to extract ticket fields from transaction'), { statusCode: 400 })
    }

    let isSponsoredMint = false
    if (call.function === 'mint_pass' || call.function === 'mint_pass_with_extra_credentials') {
      const depositBytes = getPureBytes(tx, call.arguments[3])
      if (!depositBytes) {
        throw Object.assign(new Error('Failed to extract deposit_payer'), { statusCode: 400 })
      }
      const depositPayer = normalizeAddress('0x' + Buffer.from(depositBytes).toString('hex'))
      if (depositPayer !== normalizeAddress(sponsorAddress)) {
        throw Object.assign(new Error('finalize is only for sponsored mint/update transactions'), { statusCode: 400 })
      }
      isSponsoredMint = true
    }

    tickets.forEach((fields, ti) => {
      const isSponsoredPrimary =
        call.function === 'update_pass_credential' || (isSponsoredMint && ti === 0)
      slots.push({ commandIndex: ci, ticketIndex: ti, fields, isSponsoredPrimary })
    })
  }

  // 量測 dry-run 必須固定「單一」gas coin:不指定時 SDK 會把 sponsor 的全部 coin 都掛進
  // gas payment,合併大量幣的 storage rebate 會把 netGas 量成 ≤0,簽出 clawback=1 的票,
  // 隨後在 /api/gas/sponsor(單 coin 量測)被 escape_clawback_too_low 拒絕。
  // 取「最小的合格 coin」以避開 pipeline 偏好的最大顆,降低併發版本衝突。
  const gasConfig = getGasConfig()
  const coinsRes = await input.suiClient.getCoins({
    owner: sponsorAddress,
    coinType: '0x2::sui::SUI',
  })
  const gasCoin = coinsRes.data
    .filter((c) => BigInt(c.balance) >= gasConfig.gasBudgetCapMist)
    .sort((a, b) => (BigInt(a.balance) < BigInt(b.balance) ? -1 : 1))[0]
  if (!gasCoin) {
    throw Object.assign(
      new Error('No sponsor gas coin available for fee estimation; try again shortly'),
      { statusCode: 503 }
    )
  }
  tx.setGasPayment([
    { objectId: gasCoin.coinObjectId, version: gasCoin.version, digest: gasCoin.digest },
  ])
  tx.setGasBudget(Number(gasConfig.gasBudgetCapMist))

  const dryRunBytes = await tx.build({ client: input.suiClient })
  const dryRun = await input.suiClient.dryRunTransactionBlock({
    transactionBlock: Buffer.from(dryRunBytes).toString('base64'),
  })
  if (dryRun.effects.status.status === 'failure') {
    throw Object.assign(new Error(dryRun.effects.status.error ?? 'Dry run failed'), { statusCode: 422 })
  }

  const minClawback = minEscapeClawbackFromGasUsed(dryRun.effects.gasUsed)
  if (minClawback <= 1n) {
    console.warn(
      `[FinalizeTicket] measured netGas <= 0 (gasUsed=${JSON.stringify(dryRun.effects.gasUsed)}); ` +
        'clawback would be meaningless — check gas payment pinning'
    )
  }
  let primaryClawbackAssigned = false
  const results: FinalizeTicketResult[] = []

  for (const slot of slots) {
    let escapeClawback = 0n
    if (slot.isSponsoredPrimary) {
      if (!primaryClawbackAssigned) {
        escapeClawback = minClawback
        primaryClawbackAssigned = true
      } else {
        escapeClawback = 1n
      }
    }

    const nullifierBytes = slot.fields.nullifiers.map((n) => new Uint8Array(n))
    const signed = await signTicket(
      input.senderAddress,
      slot.fields.source,
      nullifierBytes,
      new Uint8Array(slot.fields.commitment),
      Number(slot.fields.expiresAt),
      escapeClawback
    )
    results.push({
      source: slot.fields.source,
      nullifiers: signed.nullifiers,
      expires_at: signed.expires_at,
      bff_sig: signed.bff_sig,
      escape_clawback_mist: signed.escape_clawback_mist,
    })
  }

  return { tickets: results }
}
