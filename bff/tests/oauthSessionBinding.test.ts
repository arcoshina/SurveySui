import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { createHash } from 'node:crypto'
import { registerAuthRoutes } from '../src/auth/handler.js'
import { oauthStore } from '../src/auth/oauthStore.js'
import { setupFakeD1 } from './helpers/fakeD1.js'

const OWNER = '0xa11ce00000000000000000000000000000000000000000000000000000000000'
const STATE = 'state-session-binding'
const SID = 'browser-session-secret'
const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex')

function buildApp(): Hono {
  const app = new Hono()
  registerAuthRoutes(app)
  return app
}

/** 模擬 GitHub token exchange + /user + /user/emails，使 callback 能走完發票券。 */
function mockGitHubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any) => {
      const url = String(input)
      if (url.includes('github.com/login/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'gho_test' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('api.github.com/user/emails')) {
        return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('api.github.com/user')) {
        return new Response(JSON.stringify({ id: 9001 }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
  )
}

describe('OAuth callback — session 綁定 (M3)', () => {
  beforeEach(async () => {
    process.env.SURVEY_PASS_ISSUER_SALT = 'test_salt_session'
    process.env.SURVEY_PASS_ISSUER_PRIV =
      '0101010101010101010101010101010101010101010101010101010101010101'
    process.env.GITHUB_OAUTH_CLIENT_ID = 'gh_client_id'
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'gh_client_secret'
    process.env.FRONTEND_URL = 'https://app.example.com'
    delete process.env.REVOCATION_MINT_GUARD_ENABLED
    await setupFakeD1()
    await oauthStore.set(STATE, {
      verifier: 'v',
      provider: 'github',
      owner: OWNER,
      sidHash: sha256Hex(SID),
    })
    mockGitHubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SURVEY_PASS_ISSUER_SALT
    delete process.env.SURVEY_PASS_ISSUER_PRIV
    delete process.env.GITHUB_OAUTH_CLIENT_ID
    delete process.env.GITHUB_OAUTH_CLIENT_SECRET
    delete process.env.FRONTEND_URL
  })

  it('rejects callback without oauth_sid cookie → invalid_session', async () => {
    const app = buildApp()
    const res = await app.request(`/auth/github/callback?code=abc&state=${STATE}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('oauth_error=invalid_session')
  })

  it('rejects callback with mismatched cookie → invalid_session', async () => {
    const app = buildApp()
    const res = await app.request(`/auth/github/callback?code=abc&state=${STATE}`, {
      headers: { Cookie: 'oauth_sid=wrong-secret' },
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('oauth_error=invalid_session')
  })

  it('accepts callback with matching cookie → ticket delivered via fragment', async () => {
    const app = buildApp()
    const res = await app.request(`/auth/github/callback?code=abc&state=${STATE}`, {
      headers: { Cookie: `oauth_sid=${SID}` },
    })
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    // 票券放 fragment，不在 query
    expect(location).toContain('#oauth_result=')
    expect(location).not.toContain('?oauth_result=')
    expect(location.startsWith('https://app.example.com/auth')).toBe(true)
  })

  it('authorize sets HttpOnly oauth_sid cookie and stores its hash', async () => {
    const app = buildApp()
    const res = await app.request(`/auth/github/authorize?owner=${OWNER}`)
    expect(res.status).toBe(302) // 導向 GitHub
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('oauth_sid=')
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
  })
})
