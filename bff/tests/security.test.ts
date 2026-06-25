import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/email/sender.js', () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}))
import type { SuiClient } from '@mysten/sui/client'
import { buildApp } from '../src/app.js'
import { setupFakeD1 } from './helpers/fakeD1.js'
import { assertPublicHttpUrl } from '../src/security/ssrfGuard.js'

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

  it('should block SSRF to cloud metadata IP before any fetch', async () => {
    const app = makeApp()
    const res = await app.request(
      '/api/proxy/image?url=' + encodeURIComponent('http://169.254.169.254/latest/meta-data')
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('blocked_target')
  })

  it('should block SSRF to loopback IP', async () => {
    const app = makeApp()
    const res = await app.request(
      '/api/proxy/image?url=' + encodeURIComponent('http://127.0.0.1:8080/')
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('blocked_target')
  })
})

describe('SSRF Guard (assertPublicHttpUrl)', () => {
  const blocked = [
    'http://127.0.0.1/',
    'http://127.255.255.254/',
    'http://169.254.169.254/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://255.255.255.255/',
    'http://localhost/',
    'http://foo.localhost/',
    'http://svc.internal/',
    'http://metadata.google.internal/',
    'http://[::1]/',
    'http://[fc00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    // 數字形式 IPv4，WHATWG URL parser 會正規化為 127.0.0.1
    'http://2130706433/',
    'http://0x7f000001/',
  ]
  for (const u of blocked) {
    it(`blocks ${u}`, () => {
      expect(assertPublicHttpUrl(new URL(u)).ok).toBe(false)
    })
  }

  const allowed = [
    'https://example.com/a.png',
    'http://93.184.216.34/img.jpg', // example.com 公網 IP
    'https://cdn.jsdelivr.net/x.webp',
    'http://[2606:4700:4700::1111]/x.png', // 公網 IPv6
  ]
  for (const u of allowed) {
    it(`allows ${u}`, () => {
      expect(assertPublicHttpUrl(new URL(u)).ok).toBe(true)
    })
  }

  it('rejects non-http(s) protocol', () => {
    expect(assertPublicHttpUrl(new URL('ftp://example.com/')).ok).toBe(false)
  })
})
