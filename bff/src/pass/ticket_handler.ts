import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { SuiClient } from '@mysten/sui/client'
import { verifyPersonalMessageSignature } from '@mysten/sui/verify'
import { randomBytes } from 'node:crypto'
import { issueRealTimeTicket } from '../auth/ticket_issue.js'

interface TicketIssueRequestBody {
  vaultId: string
  walletA: string
  signedTimestamp: number
  signature: string
}

// 授權時間窗口 5 分鐘
const SIGNATURE_TTL_MS = 5 * 60_000
// 臨時去重記錄 Map: `${walletA.toLowerCase()}:${vaultId.toLowerCase()}` -> timestamp
const issuedTicketsRegistry = new Map<string, number>()

function normalizeAddress(addr: string): string {
  let clean = addr.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}

// 生成授權驗證訊息
export function buildTicketAuthMessage(vaultId: string, signedTimestamp: number): string {
  return `surveysui:issue-ticket:${vaultId}:${signedTimestamp}`
}

export function registerTicketRoutes(app: FastifyInstance, deps: { suiClient: SuiClient }): void {
  app.post(
    '/api/ticket/issue',
    async (req: FastifyRequest<{ Body: TicketIssueRequestBody }>, reply: FastifyReply) => {
      const { vaultId, walletA, signedTimestamp, signature } = req.body ?? ({} as TicketIssueRequestBody)

      if (!vaultId || !walletA || !signedTimestamp || !signature) {
        return reply.status(400).send({
          error: 'missing_params',
          message: 'vaultId, walletA, signedTimestamp and signature are required',
        })
      }

      const packageId = process.env.SUI_PACKAGE_ID
      if (!packageId) {
        return reply.status(500).send({
          error: 'server_misconfigured',
          message: 'Missing SUI_PACKAGE_ID env variable',
        })
      }

      try {
        // 1. 時間戳新鮮度（防範重放）
        if (Math.abs(Date.now() - Number(signedTimestamp)) > SIGNATURE_TTL_MS) {
          return reply.status(400).send({
            error: 'authorization_expired',
            message: 'Signature expired; please retry',
          })
        }

        // 2. 驗證錢包 A 的所有權簽名
        const message = buildTicketAuthMessage(vaultId, Number(signedTimestamp))
        const messageBytes = new TextEncoder().encode(message)
        try {
          await verifyPersonalMessageSignature(messageBytes, signature, { address: walletA })
        } catch (err) {
          return reply.status(401).send({
            error: 'invalid_signature',
            message: 'Authorization signature is invalid or not signed by walletA',
          })
        }

        // 3. 防重複申請 Ticket 檢查
        const registryKey = `${normalizeAddress(walletA)}:${normalizeAddress(vaultId)}`
        if (issuedTicketsRegistry.has(registryKey)) {
          return reply.status(400).send({
            error: 'ticket_already_issued',
            message: 'A ticket has already been issued for this wallet and survey',
          })
        }

        // 4. 讀取鏈上 Vault 設定
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
        const allowedNftTypeOpt = fields.allowed_nft_type
        const premiumFee = BigInt(fields.premium_fee ?? '0')
        const gasCompensation = BigInt(fields.gas_compensation_amount ?? '0')
        const storageCompensation = BigInt(fields.storage_compensation_amount ?? '0')
        const gasBalance = BigInt(fields.gas_balance ?? '0')

        // 5. 餘額預檢 (Sponsorship Pool)
        const requiredMinSui = gasCompensation + storageCompensation + premiumFee
        if (gasBalance < requiredMinSui) {
          return reply.status(422).send({
            error: 'insufficient_sponsor_balance',
            message: 'Sponsorship pool has insufficient balance to sponsor gas & premium fee',
          })
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
          req.log.info(`Checking NFT ownership for ${walletA} on type: ${allowedNftTypeStr}`)

          // 呼叫 Sui RPC 查詢擁有的特定類型 NFT
          const ownedNfts = await deps.suiClient.getOwnedObjects({
            owner: walletA,
            filter: { StructType: allowedNftTypeStr },
            limit: 1,
          })

          if (!ownedNfts.data || ownedNfts.data.length === 0) {
            return reply.status(403).send({
              error: 'ineligible_assets',
              message: `You do not own the required NFT collection: ${allowedNftTypeStr}`,
            })
          }
        }

        // 7. 簽發 Ticket
        const ephemeralNullifier = new Uint8Array(randomBytes(32))
        // Ticket 5 分鐘有效
        const expiresAtMs = Date.now() + SIGNATURE_TTL_MS

        const ticket = await issueRealTimeTicket(vaultId, ephemeralNullifier, expiresAtMs)

        // 8. 寫入去重快取，並回傳
        issuedTicketsRegistry.set(registryKey, Date.now())

        return ticket
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({
          error: 'ticket_issuance_failed',
          message: err.message || 'Failed to issue ticket',
        })
      }
    }
  )
}
