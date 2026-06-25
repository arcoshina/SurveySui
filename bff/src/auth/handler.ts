import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { randomBytes, createHash } from 'node:crypto'
import { rateLimit } from '../http/rateLimit.js'
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

/** 以 CSPRNG 產生 6 位數 OTP；rejection sampling 去除模偏差（允許前導零）。 */
function generateOtpCode(): string {
  let n: number
  do {
    n = randomBytes(3).readUIntBE(0, 3) // 0 .. 16_777_215 (2^24-1)
  } while (n >= 16_000_000) // 16_000_000 是 1_000_000 的最大整數倍上界
  return (n % 1_000_000).toString().padStart(6, '0')
}

function generateState(): string {
  return base64url(randomBytes(32))
}

// OAuth session 綁定：sid 存於發起者瀏覽器的 HttpOnly cookie，DB 僅存 sha256(sid)。
// callback 比對 cookie 的 sha256 與 DB 紀錄，確保「完成 OAuth 的瀏覽器 == 發起 authorize 的瀏覽器」。
const OAUTH_SID_COOKIE = 'oauth_sid'
const OAUTH_SID_MAX_AGE = 600 // 秒，與 oauth_state TTL 對齊

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** signTicket 回傳 + 附帶的 source 欄位（callback 累積待回傳的票券）。 */
type IssuedTicket = Awaited<ReturnType<typeof signTicket>> & { source: number }

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

export function registerAuthRoutes(app: Hono): void {
  // ── Email OTP ──────────────────────────────────────────────────────────────

  app.post('/auth/email/otp', rateLimit({ max: 5, windowMs: 60 * 60_000, key: 'otp' }), async (c) => {
    const { email, lang } = await c.req.json<OtpRequestBody>().catch(() => ({}) as OtpRequestBody)
    if (!email || !email.includes('@')) {
      return c.json({ error: 'Invalid email address' }, 400)
    }

    const code = generateOtpCode()
    await otpStore.set(email, code)

    await sendOtpEmail(email, code, lang)

    return c.json({ message: 'OTP sent successfully' })
  })

  app.post(
    '/auth/email/verify',
    rateLimit({
      max: 5,
      windowMs: 60_000,
      key: 'otp_verify',
      identifier: async (c) => {
        const body = await c.req.json<VerifyRequestBody>().catch(() => null)
        return body?.email?.toLowerCase().trim() || undefined
      },
    }),
    async (c) => {
      const { email, code, owner } = await c.req
        .json<VerifyRequestBody>()
        .catch(() => ({}) as VerifyRequestBody)
      if (!email || !code || !owner) {
        return c.json({ error: 'Missing required fields' }, 400)
      }

      const storedCode = await otpStore.get(email)
      if (!storedCode || storedCode !== code) {
        return c.json({ error: 'Invalid or expired OTP code' }, 401)
      }

      await otpStore.invalidate(email)

      try {
        const emailNullifier = computeNullifierHash(email)

        if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
          if (await isNullifierRevoked(emailNullifier, SRC_EMAIL)) {
            return c.json(
              { error: 'nullifier_revoked', message: 'This email account is revoked and cannot be minted' },
              403
            )
          }
          if (!(await checkMintRateLimit(emailNullifier, SRC_EMAIL))) {
            return c.json(
              { error: 'rate_limited', message: 'Ticket request is too frequent. Please retry later.' },
              429
            )
          }
        }

        const nullifiers = [emailNullifier]
        const commitment = new Uint8Array(0)
        const expiresAtMs = Date.now() + getPassTtlMs(SRC_EMAIL)

        const ticket = await signTicket(owner, SRC_EMAIL, nullifiers, commitment, expiresAtMs)

        if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
          await recordMintSuccess(emailNullifier, SRC_EMAIL)
        }

        return c.json({ ...ticket, source: SRC_EMAIL })
      } catch (err) {
        console.error('[Auth] email verify failed', err)
        return c.json({ error: errorMessage(err) || 'Failed to sign ticket' }, 500)
      }
    }
  )

  // ── Social OAuth ───────────────────────────────────────────────────────────

  // GET /auth/:provider/authorize
  app.get('/auth/:provider/authorize', async (c) => {
    const provider = c.req.param('provider')
    const owner = c.req.query('owner')

    const config = OAUTH_PROVIDERS[provider]
    if (!config) {
      return c.json({ error: `Unknown provider: ${provider}` }, 404)
    }

    let clientId: string
    try {
      clientId = getClientId(provider)
    } catch {
      return c.json({ error: `Provider ${provider} not configured` }, 503)
    }

    const state = generateState()
    const verifier = generateVerifier()
    const sid = base64url(randomBytes(32))

    await oauthStore.set(state, {
      verifier,
      provider,
      owner: owner || '',
      sidHash: sha256Hex(sid),
    })

    // 種 session cookie（第一方 top-level 導頁，Set-Cookie 正常生效）。
    // SameSite=Lax：Google→BFF callback 為 top-level GET 導頁時會送出；阻擋跨站 fetch/POST 帶入。
    setCookie(c, OAUTH_SID_COOKIE, sid, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/auth',
      maxAge: OAUTH_SID_MAX_AGE,
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

    return c.redirect(`${config.authUrl}?${params.toString()}`)
  })

  // GET / POST /auth/:provider/callback
  const callbackHandler = async (c: import('hono').Context) => {
    const provider = c.req.param('provider')
    let code = c.req.query('code')
    let state = c.req.query('state')
    const error = c.req.query('error')

    if ((!code || !state) && c.req.method === 'POST') {
      const body = (await c.req.parseBody().catch(() => ({}))) as Record<string, string>
      code = code || body.code
      state = state || body.state
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

    if (error) {
      return c.redirect(`${frontendUrl}/auth?oauth_error=${encodeURIComponent(error)}`)
    }

    if (!code || !state) {
      return c.redirect(`${frontendUrl}/auth?oauth_error=missing_params`)
    }

    const stateEntry = await oauthStore.get(state)
    if (!stateEntry || stateEntry.provider !== provider) {
      return c.redirect(`${frontendUrl}/auth?oauth_error=invalid_state`)
    }

    // Session 綁定：完成 OAuth 的瀏覽器必須是發起 authorize 的同一個（cookie 內 sid 的 sha256 == DB 紀錄）。
    // 阻擋 login-CSRF：攻擊者於自己瀏覽器以 owner=攻擊者 發起、誘使受害者完成 OAuth 時，
    // 受害者瀏覽器無對應 cookie → 此處拒絕。
    const sid = getCookie(c, OAUTH_SID_COOKIE)
    deleteCookie(c, OAUTH_SID_COOKIE, { path: '/auth' })
    if (!sid || !stateEntry.sidHash || sha256Hex(sid) !== stateEntry.sidHash) {
      await oauthStore.invalidate(state)
      return c.redirect(`${frontendUrl}/auth?oauth_error=invalid_session`)
    }

    await oauthStore.invalidate(state)

    const config = OAUTH_PROVIDERS[provider]
    if (!config) {
      return c.redirect(`${frontendUrl}/auth?oauth_error=unknown_provider`)
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
        console.error(`[OAuth] Token exchange failed for ${provider}: ${errText}`)
        return c.redirect(`${frontendUrl}/auth?oauth_error=token_exchange_failed`)
      }

      const tokenData = (await tokenRes.json()) as {
        access_token?: string
        id_token?: string
        error?: string
      }

      if (tokenData.error || !tokenData.access_token) {
        return c.redirect(`${frontendUrl}/auth?oauth_error=token_invalid`)
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
          return c.redirect(`${frontendUrl}/auth?oauth_error=nullifier_revoked`)
        }
        if (!(await checkMintRateLimit(primaryNullifier, socialSource))) {
          return c.redirect(`${frontendUrl}/auth?oauth_error=rate_limited`)
        }
        if (emailNullifier) {
          if (await isNullifierRevoked(emailNullifier, SRC_EMAIL)) {
            return c.redirect(`${frontendUrl}/auth?oauth_error=nullifier_revoked`)
          }
          if (!(await checkMintRateLimit(emailNullifier, SRC_EMAIL))) {
            return c.redirect(`${frontendUrl}/auth?oauth_error=rate_limited`)
          }
        }
      }

      const commitment = new Uint8Array(0)
      const oauthExpiresAtMs = Date.now() + getPassTtlMs(socialSource)

      const tickets: IssuedTicket[] = []

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
        await recordMintSuccess(primaryNullifier, socialSource)
        if (emailNullifier) {
          await recordMintSuccess(emailNullifier, SRC_EMAIL)
        }
      }

      const oauthResult = Buffer.from(JSON.stringify({ tickets, provider })).toString('base64url')

      // 放 URL fragment（#）而非 query：不進伺服器 access log、不帶 Referer，且僅由完成 OAuth 的瀏覽器讀取。
      return c.redirect(`${frontendUrl}/auth#oauth_result=${oauthResult}`)
    } catch (err) {
      console.error('[OAuth] callback failed', err)
      return c.redirect(`${frontendUrl}/auth?oauth_error=${encodeURIComponent(errorMessage(err))}`)
    }
  }

  app.get('/auth/:provider/callback', callbackHandler)
  app.post('/auth/:provider/callback', callbackHandler)

  // ── World ID 4.0 (Tier 2, Orb only) ─────────────────────────────────────────

  // 前端開 IDKit widget 前先取 RP 簽名 context(signing_key 絕不離開後端)
  app.post('/auth/worldid/sign-request', (c) => {
    try {
      const rp_context = signWorldIdRequest()
      return c.json({
        rp_context,
        app_id: process.env.WORLDCOIN_APP_ID,
        action: process.env.WORLDCOIN_ACTION,
      })
    } catch {
      return c.json({ error: 'World ID not configured' }, 503)
    }
  })

  // 使用者於 World App 完成 Orb 驗證後,前端把 proof payload 交回 BFF 驗證並換 ticket
  app.post('/auth/worldid/verify', async (c) => {
    const { owner, payload } = await c.req
      .json<WorldIdVerifyBody>()
      .catch(() => ({}) as WorldIdVerifyBody)
    if (!owner || !payload) {
      return c.json({ error: 'Missing owner or payload' }, 400)
    }

    try {
      const result = await verifyWorldIdProof(payload)
      if (!result.ok || !result.nullifier) {
        return c.json(
          { error: result.error || 'Verification failed' },
          (result.status ?? 400) as ContentfulStatusCode
        )
      }

      const primary = computeWorldIdPrimaryNullifier(result.nullifier)

      if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
        if (await isNullifierRevoked(primary, SRC_WORLD_ID)) {
          return c.json(
            { error: 'nullifier_revoked', message: 'This World ID account is revoked and cannot be minted' },
            403
          )
        }
        if (!(await checkMintRateLimit(primary, SRC_WORLD_ID))) {
          return c.json(
            { error: 'rate_limited', message: 'Ticket request is too frequent. Please retry later.' },
            429
          )
        }
      }

      const nullifiers = [primary]
      const commitment = new Uint8Array(0)
      const expiresAtMs = Date.now() + getPassTtlMs(SRC_WORLD_ID)

      const ticket = await signTicket(owner, SRC_WORLD_ID, nullifiers, commitment, expiresAtMs)

      if (process.env.REVOCATION_MINT_GUARD_ENABLED === 'true') {
        await recordMintSuccess(primary, SRC_WORLD_ID)
      }

      return c.json({ ...ticket, source: SRC_WORLD_ID })
    } catch (err) {
      console.error('[Auth] worldid verify failed', err)
      return c.json({ error: errorMessage(err) || 'Failed to sign ticket' }, 500)
    }
  })
}
