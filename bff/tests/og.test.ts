import { describe, it, expect } from 'vitest'
import type { SuiClient } from '@mysten/sui/client'
import { buildApp } from '../src/app.js'
import { createStatsCache } from '../src/stats/cache.js'

const mockSuiClient = {} as unknown as SuiClient

async function makeApp() {
  return buildApp({
    suiClient: mockSuiClient,
    cache: createStatsCache(),
    packageId: '0xpkg',
    frontendUrl: 'http://localhost:5173',
    logger: false,
  })
}

// ── test_crawler_ua_gets_og_html ──────────────────────────────────────────────

describe('test_crawler_ua_gets_og_html', () => {
  it('Twitterbot UA 回傳 200 + HTML with OG tags', async () => {
    const app = await makeApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/og/0xsurvey123',
        headers: { 'user-agent': 'Twitterbot/1.0' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.body).toContain('og:title')
      expect(res.body).toContain('og:url')
      expect(res.body).toContain('og:description')
      expect(res.body).toContain('http://localhost:5173/s/0xsurvey123')
    } finally {
      await app.close()
    }
  })

  it('Googlebot UA 也走 OG 路徑', async () => {
    const app = await makeApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/og/0xsurvey456',
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('og:title')
      expect(res.body).toContain('http://localhost:5173/s/0xsurvey456')
    } finally {
      await app.close()
    }
  })
})

// ── test_normal_ua_gets_redirect ──────────────────────────────────────────────

describe('test_normal_ua_gets_redirect', () => {
  it('一般瀏覽器 UA 302 重定向到前端', async () => {
    const app = await makeApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/og/0xsurvey123',
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      })
      expect(res.statusCode).toBe(302)
      expect(res.headers['location']).toBe('http://localhost:5173/s/0xsurvey123')
    } finally {
      await app.close()
    }
  })

  it('空 UA 也走重定向路徑', async () => {
    const app = await makeApp()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/og/0xsurvey789',
        headers: { 'user-agent': '' },
      })
      expect(res.statusCode).toBe(302)
      expect(res.headers['location']).toBe('http://localhost:5173/s/0xsurvey789')
    } finally {
      await app.close()
    }
  })
})
