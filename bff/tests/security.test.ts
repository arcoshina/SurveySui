import { describe, it, expect } from 'vitest'
import type { SuiClient } from '@mysten/sui/client'
import { buildApp } from '../src/app.js'
import { createStatsCache } from '../src/stats/cache.js'

const mockSuiClient = {} as unknown as SuiClient

async function makeApp(frontendUrl = 'http://localhost:5173') {
  return buildApp({
    suiClient: mockSuiClient,
    cache: createStatsCache(),
    packageId: '0xpkg',
    frontendUrl,
    logger: false,
  })
}

describe('BFF CORS Security Controls', () => {
  it('should allow configured frontend URL in CORS origin', async () => {
    const app = await makeApp('https://mysurveysui.com')
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://mysurveysui.com' },
      })
      expect(res.headers['access-control-allow-origin']).toBe('https://mysurveysui.com')
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    } finally {
      await app.close()
    }
  })

  it('should allow default local port in CORS origin', async () => {
    const app = await makeApp('https://mysurveysui.com')
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:5173' },
      })
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    } finally {
      await app.close()
    }
  })

  it('should reject or ignore unconfigured malicious origin', async () => {
    const app = await makeApp('https://mysurveysui.com')
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://evil-hacker.com' },
      })
      // cors 插件在 origin 不匹配且 origin 設為陣列時，不會回傳 access-control-allow-origin 標頭
      expect(res.headers['access-control-allow-origin']).toBeUndefined()
    } finally {
      await app.close()
    }
  })
})

describe('BFF Route-specific Rate Limiting', () => {
  it('should trigger rate limit on OTP endpoint after 5 calls', async () => {
    const app = await makeApp()
    try {
      // 模擬發送 5 次 OTP 請求 (同一個模擬 IP)
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/email/otp',
          payload: { email: 'user@example.com' },
        })
        expect(res.statusCode).toBe(200)
      }

      // 第 6 次應該被 Rate Limit 阻斷並回傳 429
      const limitRes = await app.inject({
        method: 'POST',
        url: '/auth/email/otp',
        payload: { email: 'user@example.com' },
      })
      expect(limitRes.statusCode).toBe(429)
      const parsed = JSON.parse(limitRes.body)
      expect(parsed.error).toBe('Too Many Requests')
    } finally {
      await app.close()
    }
  })
})

describe('BFF Image Proxy Parameter Filtering', () => {
  it('should return 400 when url parameter is missing', async () => {
    const app = await makeApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/proxy/image',
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error).toBe('missing_url')
    } finally {
      await app.close()
    }
  })

  it('should return 400 when protocol is unsupported (e.g. javascript)', async () => {
    const app = await makeApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/proxy/image?url=javascript:alert(1)',
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error).toBe('unsupported_protocol')
    } finally {
      await app.close()
    }
  })

  it('should return 400 when url is totally invalid', async () => {
    const app = await makeApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/proxy/image?url=not_a_valid_url',
      })
      expect(res.statusCode).toBe(400)
      expect(JSON.parse(res.body).error).toBe('invalid_url')
    } finally {
      await app.close()
    }
  })
})
