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
import { isNullifierRevoked, checkMintRateLimit, recordMintSuccess } from '../security/revocation.js'
import { verifyGoogleIdToken } from './idTokenVerify.js'
import { fetchGitHubUserInfo } from './githubUserInfo.js'

interface OtpRequestBody {
  email: string
  lang?: string
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

/** 向各 provider 取得 user info（sub + email） */
async function fetchUserInfo(
  provider: string,
  accessToken: string,
  idToken: string | null,
  clientId: string
): Promise<{ sub: string; email: string | null }> {
  if (provider === 'google') {
    if (!idToken) throw new Error(`id_token missing for provider ${provider}`)
    return verifyGoogleIdToken(idToken, clientId)
  }

  if (provider === 'github') {
    return fetchGitHubUserInfo(accessToken)
  }

  throw new Error(`Unknown provider: ${provider}`)
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // ── Email OTP ──────────────────────────────────────────────────────────────

  app.post(
    '/auth/email/otp',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
        },
      },
    },
    async (req: FastifyRequest<{ Body: OtpRequestBody }>, reply: FastifyReply) => {
      const { email, lang } = req.body
      if (!email || !email.includes('@')) {
        return reply.status(400).send({ error: 'Invalid email address' })
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString()
      otpStore.set(email, code)

      await sendOtpEmail(email, code, lang)

      return { message: 'OTP sent successfully' }
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

        if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
          if (await isNullifierRevoked(emailNullifier, SRC_EMAIL)) {
            return reply.status(403).send({ error: 'nullifier_revoked', message: 'This email account is revoked and cannot be minted' })
          }
          if (!checkMintRateLimit(emailNullifier, SRC_EMAIL)) {
            return reply.status(429).send({ error: 'rate_limited', message: 'Ticket request is too frequent. Please retry later.' })
          }
        }

        const nullifiers = [emailNullifier]
        const commitment = new Uint8Array(0)
        const expiresAtMs = Date.now() + getPassTtlMs(SRC_EMAIL)

        const ticket = await signTicket(owner, SRC_EMAIL, nullifiers, commitment, expiresAtMs)

        if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
          recordMintSuccess(emailNullifier, SRC_EMAIL)
        }

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

  // GET /auth/:provider/callback
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
        tokenData.id_token ?? null,
        clientId
      )

      const owner = stateEntry.owner

      // 計算 nullifiers
      const primaryNullifier = computeSocialPrimaryNullifier(provider, sub)
      const shouldAddEmail = email && !config.emailUnreliable
      const emailNullifier = shouldAddEmail ? computeEmailSecondaryNullifier(email!) : null

      const socialSource = SOCIAL_SOURCE_BY_PROVIDER[provider] ?? SRC_SOCIAL

      if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
        if (await isNullifierRevoked(primaryNullifier, socialSource)) {
          return reply.redirect(`${frontendUrl}/auth?oauth_error=nullifier_revoked`)
        }
        if (!checkMintRateLimit(primaryNullifier, socialSource)) {
          return reply.redirect(`${frontendUrl}/auth?oauth_error=rate_limited`)
        }
        if (emailNullifier) {
          if (await isNullifierRevoked(emailNullifier, SRC_EMAIL)) {
            return reply.redirect(`${frontendUrl}/auth?oauth_error=nullifier_revoked`)
          }
          if (!checkMintRateLimit(emailNullifier, SRC_EMAIL)) {
            return reply.redirect(`${frontendUrl}/auth?oauth_error=rate_limited`)
          }
        }
      }

      const commitment = new Uint8Array(0)
      const oauthExpiresAtMs = Date.now() + getPassTtlMs(socialSource)

      const tickets: any[] = []

      // 1. Google / GitHub OAuth Ticket
      const oauthTicket = await signTicket(owner, socialSource, [primaryNullifier], commitment, oauthExpiresAtMs)
      tickets.push({ ...oauthTicket, source: socialSource })

      // 2. Email Ticket (如果可以獲取 email)
      if (emailNullifier) {
        const emailExpiresAtMs = Date.now() + getPassTtlMs(SRC_EMAIL)
        const emailTicket = await signTicket(owner, SRC_EMAIL, [emailNullifier], commitment, emailExpiresAtMs)
        tickets.push({ ...emailTicket, source: SRC_EMAIL })
      }

      if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
        recordMintSuccess(primaryNullifier, socialSource)
        if (emailNullifier) {
          recordMintSuccess(emailNullifier, SRC_EMAIL)
        }
      }

      const oauthResult = Buffer.from(
        JSON.stringify({ tickets, provider })
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

        if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
          if (await isNullifierRevoked(primary, SRC_WORLD_ID)) {
            return reply.status(403).send({ error: 'nullifier_revoked', message: 'This World ID account is revoked and cannot be minted' })
          }
          if (!checkMintRateLimit(primary, SRC_WORLD_ID)) {
            return reply.status(429).send({ error: 'rate_limited', message: 'Ticket request is too frequent. Please retry later.' })
          }
        }

        const nullifiers = [primary]
        const commitment = new Uint8Array(0)
        const expiresAtMs = Date.now() + getPassTtlMs(SRC_WORLD_ID)

        const ticket = await signTicket(owner, SRC_WORLD_ID, nullifiers, commitment, expiresAtMs)

        if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
          recordMintSuccess(primary, SRC_WORLD_ID)
        }

        return { ...ticket, source: SRC_WORLD_ID }
      } catch (err: any) {
        req.log.error(err)
        return reply.status(500).send({ error: err.message || 'Failed to sign ticket' })
      }
    }
  )
}
