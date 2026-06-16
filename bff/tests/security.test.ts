import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/email/sender.js', () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}))
import type { SuiClient } from '@mysten/sui/client'
import { buildApp } from '../src/app.js'
import { setupFakeD1 } from './helpers/fakeD1.js'

const mockSuiClient = {} as unknown as SuiClient

function makeApp(frontendUrl = 'http://localhost:5173') {
  return buildApp({
    suiClient: mockSuiClient,
    packageId: '0xpkg',
    frontendUrl,
  })
}

beforeEach(async () => {
  await setupFakeD1()
})

describe('BFF CORS Security Controls', () => {
  it('should allow configured frontend URL in CORS origin', async () => {
    const app = makeApp('https://mysurveysui.com')
    const res = await app.request('/health', {
      headers: { origin: 'https://mysurveysui.com' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('https://mysurveysui.com')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('should allow default local port in CORS origin', async () => {
    const app = makeApp('https://mysurveysui.com')
    const res = await app.request('/health', {
      headers: { origin: 'http://localhost:5173' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })

  it('should reject or ignore unconfigured malicious origin', async () => {
    const app = makeApp('https://mysurveysui.com')
    const res = await app.request('/health', {
      headers: { origin: 'https://evil-hacker.com' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('BFF Route-specific Rate Limiting', () => {
  it('should trigger rate limit on OTP endpoint after 5 calls', async () => {
    const app = makeApp()
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/auth/email/otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      })
      expect(res.status).toBe(200)
    }

    const limitRes = await app.request('/auth/email/otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    })
    expect(limitRes.status).toBe(429)
    const parsed = (await limitRes.json()) as { error: string }
    expect(parsed.error).toBe('rate_limited')
  })
})

describe('BFF Image Proxy Parameter Filtering', () => {
  it('should return 400 when url parameter is missing', async () => {
    const app = makeApp()
    const res = await app.request('/api/proxy/image')
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('missing_url')
  })

  it('should return 400 when protocol is unsupported (e.g. javascript)', async () => {
    const app = makeApp()
    const res = await app.request('/api/proxy/image?url=javascript:alert(1)')
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('unsupported_protocol')
  })

  it('should return 400 when url is totally invalid', async () => {
    const app = makeApp()
    const res = await app.request('/api/proxy/image?url=not_a_valid_url')
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('invalid_url')
  })
})
