import { Transaction } from '@mysten/sui/transactions'
import { netGasFromEffects, type GasUsedEffects } from './gasMath.js'
import { extractPassTicketsFromMoveCall } from './passTicketValidation.js'
import { normalizeAddress, getPureBytes as sharedGetPureBytes } from './txUtils.js'

export type PassEscapeClawbackError = {
  ok: false
  status: number
  error: string
  message: string
}

function err(status: number, error: string, message: string): PassEscapeClawbackError {
  return { ok: false, status, error, message }
}

const PASS_MINT_FNS = new Set(['mint_pass', 'mint_pass_with_extra_credentials'])

export function validatePassEscapeClawbackAfterDryRun(input: {
  txBytes: string
  sponsorAddress: string
  gasUsed: GasUsedEffects
}): { ok: true } | PassEscapeClawbackError {
  const tx = Transaction.fromKind(Buffer.from(input.txBytes, 'base64'))
  const commands = tx.getData().commands
  const getPureBytes = (arg: unknown): Uint8Array | null => sharedGetPureBytes(tx, arg)

  // 下限取「sponsor 實際淨 gas（100%）」而非 110%：finalize 已對 ticket 簽入 110%，
  // 此處只需確認 ticket 覆蓋實際淨成本，藉此取得跨呼叫（含跨 epoch gas price 變動）的餘裕，
  // 避免偶發 escape_clawback_too_low。淨 gas <=0（儲存返還偏多）時下限取 1n。
  const netGas = netGasFromEffects(input.gasUsed)
  const minClawback = netGas > 0n ? netGas : 1n
  let primarySponsoredClawbackSeen = false

  for (const command of commands) {
    if (command.$kind !== 'MoveCall') continue
    const call = command.MoveCall
    if (!call || call.module !== 'survey_pass') continue

    const tickets = extractPassTicketsFromMoveCall(getPureBytes, call.function, call.arguments)
    if (!tickets) {
      return err(400, 'invalid_transaction_arguments', 'Failed to extract ticket clawback from transaction')
    }

    let isSponsoredMint = false
    if (PASS_MINT_FNS.has(call.function)) {
      const depositPayerBytes = getPureBytes(call.arguments[3])
      if (!depositPayerBytes) {
        return err(400, 'invalid_transaction_arguments', 'Failed to extract deposit_payer from mint call')
      }
      const depositPayer = normalizeAddress('0x' + Buffer.from(depositPayerBytes).toString('hex'))
      isSponsoredMint = depositPayer === normalizeAddress(input.sponsorAddress)
    }

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i]
      const isSponsoredPrimary =
        call.function === 'update_pass_credential' || (isSponsoredMint && i === 0)

      if (isSponsoredPrimary) {
        if (ticket.escapeClawbackMist === 0n) {
          return err(
            400,
            'invalid_escape_clawback',
            'Sponsored pass mint/update requires a positive escape_clawback_mist in the ticket'
          )
        }
        if (!primarySponsoredClawbackSeen) {
          if (ticket.escapeClawbackMist < minClawback) {
            return err(
              400,
              'escape_clawback_too_low',
              `escape_clawback_mist ${ticket.escapeClawbackMist} is below minimum ${minClawback} for this transaction`
            )
          }
          primarySponsoredClawbackSeen = true
        } else if (ticket.escapeClawbackMist < 1n) {
          return err(
            400,
            'invalid_escape_clawback',
            'Additional sponsored updates require escape_clawback_mist >= 1'
          )
        }
      } else if (ticket.escapeClawbackMist > 0n) {
        return err(
          400,
          'invalid_escape_clawback',
          'Self-funded pass mint/update must use escape_clawback_mist = 0'
        )
      }
    }
  }

  return { ok: true }
}
