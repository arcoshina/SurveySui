import type { Context, Hono } from 'hono'
import { insertRevokedNullifier, deleteRevokedNullifier } from './db.js'

interface RevokeRequestBody {
  nullifier: string
  source: number
  passId?: string
  reason?: string
}

interface UnrevokeRequestBody {
  nullifier: string
  source: number
}

/** 驗證 admin bearer token；通過回 null，否則回應錯誤 Response。 */
function adminAuthError(c: Context): Response | null {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret) {
    return c.json({ error: 'server_misconfigured', message: 'ADMIN_SECRET not set on server' }, 500)
  }
  const authHeader = c.req.header('authorization')
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: 'unauthorized', message: 'Invalid or missing admin credentials' }, 401)
  }
  return null
}

export function registerAdminRevocationRoutes(app: Hono): void {
  app.post('/api/admin/revocation/revoke', async (c) => {
    const authErr = adminAuthError(c)
    if (authErr) return authErr

    const { nullifier, source, passId, reason } = await c.req
      .json<RevokeRequestBody>()
      .catch(() => ({}) as RevokeRequestBody)
    if (!nullifier || source === undefined) {
      return c.json({ error: 'missing_params', message: 'nullifier and source are required' }, 400)
    }

    try {
      await insertRevokedNullifier(nullifier, source, passId, reason)
      return c.json({ success: true, message: `Nullifier ${nullifier} has been revoked successfully` })
    } catch (err: any) {
      console.error('[Revocation] revoke failed', err)
      return c.json({ error: 'revocation_failed', message: err.message }, 500)
    }
  })

  app.post('/api/admin/revocation/unrevoke', async (c) => {
    const authErr = adminAuthError(c)
    if (authErr) return authErr

    const { nullifier, source } = await c.req
      .json<UnrevokeRequestBody>()
      .catch(() => ({}) as UnrevokeRequestBody)
    if (!nullifier || source === undefined) {
      return c.json({ error: 'missing_params', message: 'nullifier and source are required' }, 400)
    }

    try {
      await deleteRevokedNullifier(nullifier, source)
      return c.json({ success: true, message: `Nullifier ${nullifier} has been unrevoked successfully` })
    } catch (err: any) {
      console.error('[Revocation] unrevoke failed', err)
      return c.json({ error: 'unrevocation_failed', message: err.message }, 500)
    }
  })
}
