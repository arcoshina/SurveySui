import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Transaction } from '@mysten/sui/transactions'
import { verifyPersonalMessageSignature } from '@mysten/sui/verify'
import type { SuiClient } from '@mysten/sui/client'
import { signAndExecuteWithSponsor } from '@surveysui/gas-station-core'
import { loadSponsorSigner } from '../gas/sponsorSigner.js'

interface PassDeleteRequestBody {
  passId: string
  // 使用者用錢包對 personal-message 簽名（免 gas）授權刪除；message 由下方格式重建
  signedTimestamp: number
  signature: string
}

// 授權訊息有效期：限制簽名重放窗口
const SIGNATURE_TTL_MS = 5 * 60_000

function normalizeAddress(addr: string): string {
  let clean = addr.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}

// 與前端一致的授權訊息格式（綁定 passId + 時間戳，防止跨 Pass / 過期重放）。
// 直接使用呼叫端傳入的 passId 字串（不正規化），確保前端簽署與後端驗證的 bytes 完全一致。
export function buildDeleteAuthMessage(passId: string, signedTimestamp: number): string {
  return `surveysui:delete-pass:${passId}:${signedTimestamp}`
}

export function registerPassRoutes(app: FastifyInstance, deps: { suiClient: SuiClient }): void {
  // 後端代為執行「項目方代付」Pass 的刪除：admin 為 gas owner，使儲存返還回到項目方。
  // 使用者僅需做一次免 gas 的 personal-message 簽名授權；運算費由項目方負擔（但淨收返還）。
  app.post(
    '/api/pass/delete',
    async (req: FastifyRequest<{ Body: PassDeleteRequestBody }>, reply: FastifyReply) => {
      const { passId, signedTimestamp, signature } = req.body ?? ({} as PassDeleteRequestBody)
      if (!passId || !signedTimestamp || !signature) {
        return reply.status(400).send({ error: 'missing_params', message: 'passId, signedTimestamp and signature are required' })
      }

      const packageId = process.env.SUI_PACKAGE_ID
      const registryId = process.env.PASS_REGISTRY_ID
      const configId = process.env.ISSUER_CONFIG_ID
      if (!packageId || !registryId || !configId) {
        return reply.status(500).send({ error: 'server_misconfigured', message: 'Missing package/registry/config IDs' })
      }

      const sponsorSigner = loadSponsorSigner()
      if (!sponsorSigner) {
        return reply.status(503).send({ error: 'sponsor_unavailable', message: 'Sponsor key not configured' })
      }
      const sponsorAddress = sponsorSigner.getSponsorAddress()

      try {
        // 1. 時間戳新鮮度（限制重放窗口）
        if (Math.abs(Date.now() - Number(signedTimestamp)) > SIGNATURE_TTL_MS) {
          return reply.status(400).send({ error: 'authorization_expired', message: 'Delete authorization expired; please retry' })
        }

        // 2. 查 Pass 物件，取 owner / deposit_payer / 型別
        const passObj = await deps.suiClient.getObject({ id: passId, options: { showContent: true, showType: true } })
        if (!passObj.data || !passObj.data.content) {
          return reply.status(404).send({ error: 'pass_not_found', message: `SurveyPass ${passId} not found` })
        }
        const expectedType = `${normalizeAddress(packageId)}::survey_pass::SurveyPass`
        const actualType = (passObj.data.type ?? '').replace(/^0x0*/, '0x')
        if (normalizeAddress(actualType.split('::')[0]) !== normalizeAddress(packageId) || !actualType.endsWith('::survey_pass::SurveyPass')) {
          return reply.status(400).send({ error: 'invalid_object_type', message: `Object is not a SurveyPass (${expectedType})` })
        }
        const fields = (passObj.data.content as any).fields
        const owner = normalizeAddress(String(fields.owner))
        const depositPayer = normalizeAddress(String(fields.deposit_payer))

        // 3. 僅代執行「項目方代付」的 Pass；自付 Pass 由使用者自行刪除
        if (depositPayer !== normalizeAddress(sponsorAddress)) {
          return reply.status(400).send({
            error: 'not_sponsor_funded',
            message: 'This pass was not sponsor-funded; delete it yourself via delete_pass',
          })
        }

        // 4. 驗證 owner 對授權訊息的簽名（personal message，免 gas）
        const message = buildDeleteAuthMessage(passId, Number(signedTimestamp))
        const messageBytes = new TextEncoder().encode(message)
        try {
          await verifyPersonalMessageSignature(messageBytes, signature, { address: owner })
        } catch {
          return reply.status(401).send({ error: 'invalid_signature', message: 'Delete authorization signature is invalid or not signed by the pass owner' })
        }

        // 5. 由 admin（= sponsor）建構並執行 delete_pass：admin 為 sender + gas owner → 儲存返還回項目方
        const tx = new Transaction()
        tx.moveCall({
          target: `${packageId}::survey_pass::delete_pass`,
          arguments: [tx.object(registryId), tx.object(passId)],
        })
        tx.setSender(sponsorAddress)

        const result = await signAndExecuteWithSponsor(deps.suiClient, sponsorSigner, tx, {
          showEffects: true,
        })

        if (result.effects?.status.status === 'failure') {
          return reply.status(422).send({ error: 'delete_failed', message: result.effects.status.error })
        }

        return { digest: result.digest }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: 'pass_delete_failed', message: err.message })
      }
    }
  )
}
