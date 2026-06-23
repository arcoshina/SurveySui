import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { Transaction } from '@mysten/sui/transactions'
import { verifyPersonalMessageSignature } from '@mysten/sui/verify'
import type { SuiClient } from '@mysten/sui/client'
import { signAndExecuteWithSponsor, normalizeAddress } from '@surveysui/gas-station-core'
import { loadSponsorSigner } from '../gas/sponsorSigner.js'
import { assertTxSenderMatches } from '../gas/sponsorAuth.js'
import { finalizeSponsoredPassTickets } from './finalizeSponsoredTicket.js'

interface PassDeleteRequestBody {
  passId: string
  // 使用者用錢包對 personal-message 簽名（免 gas）授權刪除；message 由下方格式重建
  signedTimestamp: number
  signature: string
}

// 授權訊息有效期：限制簽名重放窗口
const SIGNATURE_TTL_MS = 5 * 60_000

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// 與前端一致的授權訊息格式（綁定 passId + 時間戳，防止跨 Pass / 過期重放）。
// 直接使用呼叫端傳入的 passId 字串（不正規化），確保前端簽署與後端驗證的 bytes 完全一致。
export function buildDeleteAuthMessage(passId: string, signedTimestamp: number): string {
  return `surveysui:delete-pass:${passId}:${signedTimestamp}`
}

interface FinalizeSponsoredTicketBody {
  txBytes: string
  senderAddress: string
}

export function registerPassRoutes(app: Hono, deps: { suiClient: SuiClient }): void {
  // 不需前置授權簽章:此端點僅量 gas 並回傳「綁定 owner」的重簽 ticket。該 ticket 只能在
  // owner 親簽的 mint/update 交易中消費,攻擊者即使取得也無法使用;額度於 /api/gas/execute 把關。
  app.post('/api/pass/finalize-sponsored-ticket', async (c) => {
    const { txBytes, senderAddress } = await c.req
      .json<FinalizeSponsoredTicketBody>()
      .catch(() => ({}) as FinalizeSponsoredTicketBody)
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
    try {
      const result = await finalizeSponsoredPassTickets({
        suiClient: deps.suiClient,
        txBytes,
        senderAddress,
      })
      return c.json(result)
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string }
      console.error('[Pass] finalize failed', err)
      return c.json(
        { error: 'finalize_failed', message: e.message ?? 'Failed to finalize sponsored ticket' },
        (e.statusCode ?? 500) as ContentfulStatusCode
      )
    }
  })

  // 後端代為執行「項目方代付」Pass 的刪除：admin 為 gas owner，使儲存返還回到項目方。
  // 使用者僅需做一次免 gas 的 personal-message 簽名授權；運算費由項目方負擔（但淨收返還）。
  app.post('/api/pass/delete', async (c) => {
    const { passId, signedTimestamp, signature } = await c.req
      .json<PassDeleteRequestBody>()
      .catch(() => ({}) as PassDeleteRequestBody)
    if (!passId || !signedTimestamp || !signature) {
      return c.json(
        { error: 'missing_params', message: 'passId, signedTimestamp and signature are required' },
        400
      )
    }

    const packageId = process.env.SUI_PACKAGE_ID
    const registryId = process.env.PASS_REGISTRY_ID
    const configId = process.env.ISSUER_CONFIG_ID
    if (!packageId || !registryId || !configId) {
      return c.json(
        { error: 'server_misconfigured', message: 'Missing package/registry/config IDs' },
        500
      )
    }

    const sponsorSigner = loadSponsorSigner()
    if (!sponsorSigner) {
      return c.json({ error: 'sponsor_unavailable', message: 'Sponsor key not configured' }, 503)
    }
    const sponsorAddress = sponsorSigner.getSponsorAddress()

    try {
      // 1. 時間戳新鮮度（限制重放窗口）
      if (Math.abs(Date.now() - Number(signedTimestamp)) > SIGNATURE_TTL_MS) {
        return c.json(
          { error: 'authorization_expired', message: 'Delete authorization expired; please retry' },
          400
        )
      }

      // 2. 查 Pass 物件，取 owner / deposit_payer / 型別
      const passObj = await deps.suiClient.getObject({
        id: passId,
        options: { showContent: true, showType: true },
      })
      if (!passObj.data || !passObj.data.content) {
        return c.json({ error: 'pass_not_found', message: `SurveyPass ${passId} not found` }, 404)
      }
      const expectedType = `${normalizeAddress(packageId)}::survey_pass::SurveyPass`
      const actualType = (passObj.data.type ?? '').replace(/^0x0*/, '0x')
      if (
        normalizeAddress(actualType.split('::')[0]) !== normalizeAddress(packageId) ||
        !actualType.endsWith('::survey_pass::SurveyPass')
      ) {
        return c.json(
          { error: 'invalid_object_type', message: `Object is not a SurveyPass (${expectedType})` },
          400
        )
      }
      const fields = (passObj.data.content as { fields: Record<string, unknown> }).fields
      const owner = normalizeAddress(String(fields.owner))
      const depositPayer = normalizeAddress(String(fields.deposit_payer))

      // 3. 僅代執行「項目方代付」的 Pass；自付 Pass 由使用者自行刪除
      if (depositPayer !== normalizeAddress(sponsorAddress)) {
        return c.json(
          {
            error: 'not_sponsor_funded',
            message: 'This pass was not sponsor-funded; delete it yourself via delete_pass',
          },
          400
        )
      }

      // 4. 驗證 owner 對授權訊息的簽名（personal message，免 gas）
      const message = buildDeleteAuthMessage(passId, Number(signedTimestamp))
      const messageBytes = new TextEncoder().encode(message)
      try {
        await verifyPersonalMessageSignature(messageBytes, signature, { address: owner })
      } catch {
        return c.json(
          {
            error: 'invalid_signature',
            message: 'Delete authorization signature is invalid or not signed by the pass owner',
          },
          401
        )
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
        return c.json({ error: 'delete_failed', message: result.effects.status.error }, 422)
      }

      return c.json({ digest: result.digest })
    } catch (err) {
      console.error('[Pass] delete failed', err)
      return c.json({ error: 'pass_delete_failed', message: errorMessage(err) }, 500)
    }
  })
}
