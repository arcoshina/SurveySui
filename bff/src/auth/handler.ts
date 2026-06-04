import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomBytes, createHash } from 'node:crypto'
import { sendOtpEmail } from '../email/sender.js'
import { otpStore } from './otpStore.js'
import { oauthStore } from './oauthStore.js'
import { OAUTH_PROVIDERS, getClientId, getClientSecret } from './oauthProviders.js'
import {
  computeNullifierHash,
  computeSocialPrimaryNullifier,
  computeEmailSecondaryNullifier,
  signTicket,
  getPassTtlMs,
} from './ticket.js'
import {
  computeWorldIdPrimaryNullifier,
  signWorldIdRequest,
  verifyWorldIdProof,
} from './worldId.js'

interface OtpRequestBody {
  email: string
}

interface VerifyRequestBody {
  email: string
  code: string
  owner: string
}

interface WorldIdVerifyBody {
  owner: string
  payload: unknown
}

const SRC_EMAIL = 2
const SRC_SOCIAL = 3
const SRC_WORLD_ID = 5
// 社群具體 provider：以不同 source 區分，讓同一 Pass 可並存 Google + GitHub 兩張卡
const SRC_SOCIAL_GOOGLE = 6
const SRC_SOCIAL_GITHUB = 7
const SOCIAL_SOURCE_BY_PROVIDER: Record<string, number> = {
  google: SRC_SOCIAL_GOOGLE,
  github: SRC_SOCIAL_GITHUB,
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateState(): string {
  return base64url(randomBytes(32))
}

function generateVerifier(): string {
  return base64url(randomBytes(32))
}

function pkceChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}

/** 解析 JWT payload（不驗簽，驗簽由 token exchange 已確保） */
function parseJwtPayload(token: string): Record<string, any> {
  const parts = token.split('.')
  if (parts.length < 2) throw new Error('Invalid JWT format')
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
}

/** 向各 provider 取得 user info（sub + email） */
async function fetchUserInfo(
  provider: string,
  accessToken: string,
  idToken: string | null
): Promise<{ sub: string; email: string | null }> {
  if (provider === 'google') {
    if (!idToken) throw new Error(`id_token missing for provider ${provider}`)
    const payload = parseJwtPayload(idToken)
    return {
      sub: String(payload.sub),
      email: payload.email ? String(payload.email) : null,
    }
  }

  if (provider === 'github') {
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'SurveySui' },
    })
    if (!userRes.ok) throw new Error(`GitHub userinfo failed: ${userRes.status}`)
    const user = (await userRes.json()) as { id: number; email?: string }

    let email: string | null = user.email ?? null
    if (!email) {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'SurveySui' },
      })
      if (emailRes.ok) {
        const emails = (await emailRes.json()) as Array<{
          email: string
          primary: boolean
          verified: boolean
        }>
        const primary = emails.find((e) => e.primary && e.verified)
        email = primary?.email ?? null
      }
    }
    return { sub: String(user.id), email }
  }

  throw new Error(`Unknown provider: ${provider}`)
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // ── Email OTP ──────────────────────────────────────────────────────────────

  app.post(
    '/auth/email/otp',
    async (req: FastifyRequest<{ Body: OtpRequestBody }>, reply: FastifyReply) => {
      const { email } = req.body
      if (!email || !email.includes('@')) {
        return reply.status(400).send({ error: 'Invalid email address' })
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString()
      otpStore.set(email, code)

      console.log(`[OTP] Email: ${email}, Code: ${code}`)

      if (process.env.NODE_ENV === 'production') {
        await sendOtpEmail(email, code)
      }

      const responsePayload: { message: string; code?: string } = {
        message: 'OTP sent successfully',
      }
      if (process.env.NODE_ENV !== 'production') {
        responsePayload.code = code
      }

      return responsePayload
    }
  )

  app.post(
    '/auth/email/verify',
    async (req: FastifyRequest<{ Body: VerifyRequestBody }>, reply: FastifyReply) => {
      const { email, code, owner } = req.body
      if (!email || !code || !owner) {
        return reply.status(400).send({ error: 'Missing required fields' })
      }

      const storedCode = otpStore.get(email)
      if (!storedCode || storedCode !== code) {
        return reply.status(401).send({ error: 'Invalid or expired OTP code' })
      }

      otpStore.invalidate(email)

      try {
        const emailNullifier = computeNullifierHash(email)
        const nullifiers = [emailNullifier]
        const commitment = new Uint8Array(0)
        const expiresAtMs = Date.now() + getPassTtlMs(SRC_EMAIL)

        const ticket = await signTicket(owner, SRC_EMAIL, nullifiers, commitment, expiresAtMs)

        return { ...ticket, source: SRC_EMAIL }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: err.message || 'Failed to sign ticket' })
      }
    }
  )

  // ── Social OAuth ───────────────────────────────────────────────────────────

  // GET /auth/:provider/authorize
  app.get(
    '/auth/:provider/authorize',
    async (
      req: FastifyRequest<{
        Params: { provider: string }
        Querystring: { owner?: string }
      }>,
      reply: FastifyReply
    ) => {
      const { provider } = req.params
      const { owner } = req.query

      const config = OAUTH_PROVIDERS[provider]
      if (!config) {
        return reply.status(404).send({ error: `Unknown provider: ${provider}` })
      }

      let clientId: string
      try {
        clientId = getClientId(provider)
      } catch {
        return reply.status(503).send({ error: `Provider ${provider} not configured` })
      }

      const state = generateState()
      const verifier = generateVerifier()

      oauthStore.set(state, {
        verifier,
        provider,
        owner: owner || '',
      })

      const redirectUri = `${process.env.BFF_URL || 'http://localhost:3100'}/auth/${provider}/callback`

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: config.scope,
        state,
      })

      if (config.pkce) {
        params.set('code_challenge', pkceChallenge(verifier))
        params.set('code_challenge_method', 'S256')
      }

      return reply.redirect(`${config.authUrl}?${params.toString()}`)
    }
  )

  // GET /auth/:provider/callback (Apple uses POST form_post, but we handle GET too)
  const callbackHandler = async (
    req: FastifyRequest<{
      Params: { provider: string }
      Querystring: { code?: string; state?: string; error?: string }
      Body: { code?: string; state?: string; id_token?: string }
    }>,
    reply: FastifyReply
  ) => {
    const { provider } = req.params
    const code = (req.query as any).code || (req.body as any)?.code
    const state = (req.query as any).state || (req.body as any)?.state
    const error = (req.query as any).error

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

    if (error) {
      return reply.redirect(`${frontendUrl}/auth?oauth_error=${encodeURIComponent(error)}`)
    }

    if (!code || !state) {
      return reply.redirect(`${frontendUrl}/auth?oauth_error=missing_params`)
    }

    const stateEntry = oauthStore.get(state)
    if (!stateEntry || stateEntry.provider !== provider) {
      return reply.redirect(`${frontendUrl}/auth?oauth_error=invalid_state`)
    }
    oauthStore.invalidate(state)

    const config = OAUTH_PROVIDERS[provider]
    if (!config) {
      return reply.redirect(`${frontendUrl}/auth?oauth_error=unknown_provider`)
    }

    try {
      const clientId = getClientId(provider)
      const clientSecret = getClientSecret(provider)
      const redirectUri = `${process.env.BFF_URL || 'http://localhost:3100'}/auth/${provider}/callback`

      // Exchange code for token
      const tokenParams: Record<string, string> = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }

      if (config.pkce) {
        tokenParams.code_verifier = stateEntry.verifier
      }

      const tokenRes = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(tokenParams).toString(),
      })

      if (!tokenRes.ok) {
        const errText = await tokenRes.text()
        req.log.error(`[OAuth] Token exchange failed for ${provider}: ${errText}`)
        return reply.redirect(`${frontendUrl}/auth?oauth_error=token_exchange_failed`)
      }

      const tokenData = (await tokenRes.json()) as {
        access_token?: string
        id_token?: string
        error?: string
      }

      if (tokenData.error || !tokenData.access_token) {
        return reply.redirect(`${frontendUrl}/auth?oauth_error=token_invalid`)
      }

      const { sub, email } = await fetchUserInfo(
        provider,
        tokenData.access_token,
        tokenData.id_token ?? null
      )

      const owner = stateEntry.owner

      // 計算 nullifiers
      const primaryNullifier = computeSocialPrimaryNullifier(provider, sub)
      // Apple email unreliable → 不加 secondary nullifier
      const shouldAddEmail = email && !config.emailUnreliable
      const emailNullifier = shouldAddEmail ? computeEmailSecondaryNullifier(email!) : null
      const nullifiers = emailNullifier
        ? [primaryNullifier, emailNullifier]
        : [primaryNullifier]

      // 依 provider 決定具體 source（google=6 / github=7）；未知 provider fallback 回泛稱社群 3
      const socialSource = SOCIAL_SOURCE_BY_PROVIDER[provider] ?? SRC_SOCIAL

      const commitment = new Uint8Array(0)
      const expiresAtMs = Date.now() + getPassTtlMs(socialSource)

      const ticket = await signTicket(owner, socialSource, nullifiers, commitment, expiresAtMs)

      const oauthResult = Buffer.from(
        JSON.stringify({ ...ticket, source: socialSource, provider })
      ).toString('base64url')

      return reply.redirect(`${frontendUrl}/auth?oauth_result=${oauthResult}`)
    } catch (err: any) {
      req.log.error(err)
      return reply.redirect(`${frontendUrl}/auth?oauth_error=${encodeURIComponent(err.message)}`)
    }
  }

  app.get('/auth/:provider/callback', callbackHandler as any)
  app.post('/auth/:provider/callback', callbackHandler as any)

  // ── World ID 4.0 (Tier 2, Orb only) ─────────────────────────────────────────

  // 前端開 IDKit widget 前先取 RP 簽名 context(signing_key 絕不離開後端)
  app.post('/auth/worldid/sign-request', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const rp_context = signWorldIdRequest()
      return {
        rp_context,
        app_id: process.env.WORLDCOIN_APP_ID,
        action: process.env.WORLDCOIN_ACTION,
      }
    } catch {
      return reply.status(503).send({ error: 'World ID not configured' })
    }
  })

  // 使用者於 World App 完成 Orb 驗證後,前端把 proof payload 交回 BFF 驗證並換 ticket
  app.post(
    '/auth/worldid/verify',
    async (req: FastifyRequest<{ Body: WorldIdVerifyBody }>, reply: FastifyReply) => {
      const { owner, payload } = req.body || ({} as WorldIdVerifyBody)
      if (!owner || !payload) {
        return reply.status(400).send({ error: 'Missing owner or payload' })
      }

      try {
        const result = await verifyWorldIdProof(payload)
        if (!result.ok || !result.nullifier) {
          return reply.status(result.status).send({ error: result.error || 'Verification failed' })
        }

        const primary = computeWorldIdPrimaryNullifier(result.nullifier)
        const nullifiers = [primary]
        const commitment = new Uint8Array(0)
        const expiresAtMs = Date.now() + getPassTtlMs(SRC_WORLD_ID)

        const ticket = await signTicket(owner, SRC_WORLD_ID, nullifiers, commitment, expiresAtMs)
        return { ...ticket, source: SRC_WORLD_ID }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: err.message || 'Failed to sign ticket' })
      }
    }
  )
}
