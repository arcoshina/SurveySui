import type { Hono } from 'hono'
import type { SuiClient } from '@mysten/sui/client'
import { verifyPersonalMessageSignature } from '@mysten/sui/verify'
import { randomBytes } from 'node:crypto'
import { issueRealTimeTicket } from '../auth/ticket_issue.js'
import { getRealtimeTicketSlotStore } from './stores/realtimeTicketSlotStore.js'
import { normalizeAddress } from '@surveysui/gas-station-core'

interface TicketIssueRequestBody {
  vaultId: string
  surveyId: string
  walletA: string
  signedTimestamp: number
  signature: string
}

/** SurveyVault Move 物件中本流程用到的欄位（RPC 解析後的動態 fields 子集）。 */
interface SurveyVaultFields {
  allowed_nft_type?: number[][] | { fields?: { vec?: number[] } } | null
  ticket_fee?: string | number
  gas_compensation_amount?: string | number
  gas_balance?: string | number
}

/** Survey Move 物件中本流程用到的欄位。 */
interface SurveyMoveFields {
  vault_id?: string
  claim_mode?: string | number
}

// 授權時間窗口 5 分鐘
const SIGNATURE_TTL_MS = 5 * 60_000

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// 生成授權驗證訊息
export function buildTicketAuthMessage(vaultId: string, signedTimestamp: number): string {
  return `surveysui:issue-ticket:${vaultId}:${signedTimestamp}`
}

// 一次性票券 / 匿名投票預留機制：目前 fail-closed，未在 app.ts 掛載（後端不應在方案規劃前簽發）。
// 此函式保留作未來預留；M5 併發超賣競態已以 ticket slot 原子預留（getRealtimeTicketSlotStore）修復。
export function registerTicketRoutes(app: Hono, deps: { suiClient: SuiClient }): void {
  app.post('/api/ticket/issue', async (c) => {
    const { vaultId, surveyId, walletA, signedTimestamp, signature } = await c.req
      .json<TicketIssueRequestBody>()
      .catch(() => ({}) as TicketIssueRequestBody)

    if (!vaultId || !surveyId || !walletA || !signedTimestamp || !signature) {
      return c.json(
        {
          error: 'missing_params',
          message: 'vaultId, surveyId, walletA, signedTimestamp and signature are required',
        },
        400
      )
    }

    const packageId = process.env.SUI_PACKAGE_ID
    if (!packageId) {
      return c.json(
        { error: 'server_misconfigured', message: 'Missing SUI_PACKAGE_ID env variable' },
        500
      )
    }

    let slotReserved = false
    let committed = false
    try {
      // 1. 時間戳新鮮度（防範重放）
      if (Math.abs(Date.now() - Number(signedTimestamp)) > SIGNATURE_TTL_MS) {
        return c.json({ error: 'authorization_expired', message: 'Signature expired; please retry' }, 400)
      }

      // 2. 驗證錢包 A 的所有權簽名
      const message = buildTicketAuthMessage(vaultId, Number(signedTimestamp))
      const messageBytes = new TextEncoder().encode(message)
      try {
        await verifyPersonalMessageSignature(messageBytes, signature, { address: walletA })
      } catch {
        return c.json(
          {
            error: 'invalid_signature',
            message: 'Authorization signature is invalid or not signed by walletA',
          },
          401
        )
      }

      // 3. 原子預留 ticket slot（取代 check-then-insert；單句寫入杜絕併發超賣競態 M5）。
      //    slot 與後續 ticket 共用同一 expiresAtMs，確保到期一致。
      const issuedAt = Date.now()
      const expiresAtMs = issuedAt + SIGNATURE_TTL_MS
      const slotStore = getRealtimeTicketSlotStore()
      const reserved = await slotStore.tryReserve(walletA, vaultId, issuedAt, expiresAtMs)
      if (!reserved) {
        return c.json(
          {
            error: 'ticket_already_issued',
            message: 'A ticket has already been issued for this wallet and survey',
          },
          400
        )
      }
      slotReserved = true

      // 4. 讀取鏈上 Vault 設定
      const vaultObj = await deps.suiClient.getObject({
        id: vaultId,
        options: { showContent: true },
      })

      if (!vaultObj.data || !vaultObj.data.content) {
        return c.json({ error: 'vault_not_found', message: `SurveyVault ${vaultId} not found` }, 404)
      }

      const fields = (vaultObj.data.content as { fields: SurveyVaultFields }).fields
      const surveyObj = await deps.suiClient.getObject({
        id: surveyId,
        options: { showContent: true },
      })
      const surveyContent = surveyObj.data?.content as
        | { dataType?: string; fields?: SurveyMoveFields }
        | undefined
      if (!surveyContent || surveyContent.dataType !== 'moveObject') {
        return c.json({ error: 'survey_not_found', message: `Survey ${surveyId} not found` }, 404)
      }
      const surveyFields = surveyContent.fields ?? {}
      const surveyVaultId = String(surveyFields.vault_id)
      if (normalizeAddress(surveyVaultId) !== normalizeAddress(vaultId)) {
        return c.json(
          { error: 'survey_vault_mismatch', message: 'Survey is not bound to the provided vault' },
          400
        )
      }
      const claimMode = Number(surveyFields.claim_mode ?? 0)
      if (claimMode !== 1) {
        return c.json(
          {
            error: 'claim_mode_not_ticket',
            message: 'Tickets are only issued for surveys with claim_mode=1 (ONE_TIME_TICKET)',
          },
          400
        )
      }

      const allowedNftTypeOpt = fields.allowed_nft_type
      const ticketFee = BigInt(fields.ticket_fee ?? '0')
      const gasCompensation = BigInt(fields.gas_compensation_amount ?? '0')
      const gasBalance = BigInt(fields.gas_balance ?? '0')

      // 5. 餘額預檢 (Sponsorship Pool):storage 補償已廢除,只需 gas 補償 + ticket fee
      const requiredMinSui = gasCompensation + ticketFee
      if (gasBalance < requiredMinSui) {
        return c.json(
          {
            error: 'insufficient_sponsor_balance',
            message: 'Sponsorship pool has insufficient balance to sponsor gas & ticket fee',
          },
          422
        )
      }

      // 6. 驗證資產持有資格 (若有限制 NFT)
      let allowedNftTypeBytes: number[] | null = null
      if (allowedNftTypeOpt) {
        // 支援兩種新舊 RPC Option 格式
        if (Array.isArray(allowedNftTypeOpt)) {
          allowedNftTypeBytes = allowedNftTypeOpt.length > 0 ? allowedNftTypeOpt[0] : null
        } else if (allowedNftTypeOpt.fields?.vec) {
          allowedNftTypeBytes = allowedNftTypeOpt.fields.vec
        }
      }

      if (allowedNftTypeBytes && allowedNftTypeBytes.length > 0) {
        const allowedNftTypeStr = String.fromCharCode(...allowedNftTypeBytes)
        console.info(`[Ticket] Checking NFT ownership for ${walletA} on type: ${allowedNftTypeStr}`)

        // 呼叫 Sui RPC 查詢擁有的特定類型 NFT
        const ownedNfts = await deps.suiClient.getOwnedObjects({
          owner: walletA,
          filter: { StructType: allowedNftTypeStr },
          limit: 1,
        })

        if (!ownedNfts.data || ownedNfts.data.length === 0) {
          return c.json(
            {
              error: 'ineligible_assets',
              message: `You do not own the required NFT collection: ${allowedNftTypeStr}`,
            },
            403
          )
        }
      }

      // 7. 簽發 Ticket（slot 已於步驟 3 預留，沿用同一 expiresAtMs）
      const ephemeralNullifier = new Uint8Array(randomBytes(32))
      const ticket = await issueRealTimeTicket(
        vaultId,
        surveyId,
        normalizeAddress(walletA),
        ephemeralNullifier,
        expiresAtMs
      )

      // 8. 簽發成功，保留預留並回傳。
      committed = true
      return c.json(ticket)
    } catch (err) {
      console.error('[Ticket] issuance failed', err)
      return c.json(
        { error: 'ticket_issuance_failed', message: errorMessage(err) || 'Failed to issue ticket' },
        500
      )
    } finally {
      // 預留後任一失敗/早退路徑（vault/survey/claim_mode/餘額/資格/簽票丟錯）釋放 slot，使用者可立即重試。
      if (slotReserved && !committed) {
        await getRealtimeTicketSlotStore().release(walletA, vaultId).catch(() => undefined)
      }
    }
  })
}
