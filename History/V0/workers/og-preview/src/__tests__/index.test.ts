import { describe, it, expect, vi, beforeEach } from 'vitest'
import worker from '../index.js'

const ENV = {
  BACKEND_URL: 'http://localhost:3000',
  SITE_URL: 'https://surveysui.xyz',
}

const BOT_UA = 'Discordbot/2.0 (+https://discordapp.com/)'
const HUMAN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function surveyJson(contentMd: string, questions: unknown[] = []): Response {
  return new Response(JSON.stringify({ contentMd, questions }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const SAMPLE_CONTENT_MD = `---
title: "Sui Overflow 滿意度調查"
perResponse: 1
maxResponses: 10
deadline: "2026-12-31"
---

問卷說明`

describe('OG Preview Worker', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  describe('test_edge_function_passthrough_for_human_user_agent', () => {
    it('普通使用者瀏覽 /s/:id 直接 passthrough 到 SPA', async () => {
      const spaResponse = new Response('<html>SPA</html>', {
        headers: { 'Content-Type': 'text/html' },
      })
      const fetchMock = vi.fn().mockResolvedValue(spaResponse)
      vi.stubGlobal('fetch', fetchMock)

      const req = new Request('https://surveysui.xyz/s/abc123', {
        headers: { 'User-Agent': HUMAN_UA },
      })
      const res = await worker.fetch(req, ENV)

      expect(fetchMock).toHaveBeenCalledWith(req)
      expect(res).toBe(spaResponse)
    })

    it('非 /s/:id 路徑無論 User-Agent 為何皆 passthrough', async () => {
      const spaResponse = new Response('<html>SPA</html>')
      const fetchMock = vi.fn().mockResolvedValue(spaResponse)
      vi.stubGlobal('fetch', fetchMock)

      const req = new Request('https://surveysui.xyz/create', {
        headers: { 'User-Agent': BOT_UA },
      })
      const res = await worker.fetch(req, ENV)

      expect(fetchMock).toHaveBeenCalledWith(req)
      expect(res).toBe(spaResponse)
    })
  })

  describe('test_edge_function_returns_dynamic_og_for_bot_user_agent', () => {
    it('Discordbot 收到含 OG tags 的 HTML 回應', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(surveyJson(SAMPLE_CONTENT_MD, [{ id: 'q1' }, { id: 'q2' }])))

      const req = new Request('https://surveysui.xyz/s/abc123', {
        headers: { 'User-Agent': BOT_UA },
      })
      const res = await worker.fetch(req, ENV)
      const html = await res.text()

      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/html')
      expect(html).toContain('og:title')
      expect(html).toContain('og:description')
      expect(html).toContain('og:image')
      expect(html).toContain('twitter:card')
    })

    it.each([
      'Twitterbot/1.0',
      'Slackbot-LinkExpanding 1.0',
      'facebookexternalhit/1.1',
      'LinkedInBot/1.0',
    ])('%s 亦被識別為 bot 並回傳 OG HTML', async (botUa) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(surveyJson(SAMPLE_CONTENT_MD, [])))

      const req = new Request('https://surveysui.xyz/s/abc123', {
        headers: { 'User-Agent': botUa },
      })
      const res = await worker.fetch(req, ENV)
      const html = await res.text()

      expect(html).toContain('og:title')
    })
  })

  describe('test_og_tags_contain_correct_survey_title_and_description', () => {
    it('OG title 包含問卷名稱', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(surveyJson(SAMPLE_CONTENT_MD, [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }])))

      const req = new Request('https://surveysui.xyz/s/abc123', {
        headers: { 'User-Agent': BOT_UA },
      })
      const res = await worker.fetch(req, ENV)
      const html = await res.text()

      expect(html).toContain('Sui Overflow 滿意度調查')
      expect(html).toContain('SurveySui')
    })

    it('OG description 包含題目數量', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(surveyJson(SAMPLE_CONTENT_MD, [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }])))

      const req = new Request('https://surveysui.xyz/s/abc123', {
        headers: { 'User-Agent': BOT_UA },
      })
      const res = await worker.fetch(req, ENV)
      const html = await res.text()

      expect(html).toContain('3')
    })

    it('og:url 包含正確的問卷 ID', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(surveyJson(SAMPLE_CONTENT_MD, [])))

      const req = new Request('https://surveysui.xyz/s/survey-xyz-999', {
        headers: { 'User-Agent': BOT_UA },
      })
      const res = await worker.fetch(req, ENV)
      const html = await res.text()

      expect(html).toContain('surveysui.xyz/s/survey-xyz-999')
    })
  })

  describe('test_fallback_to_default_og_when_survey_id_not_found', () => {
    it('backend 回傳 404 時使用預設 OG tags', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('{"error":"not_found"}', { status: 404 })),
      )

      const req = new Request('https://surveysui.xyz/s/nonexistent', {
        headers: { 'User-Agent': BOT_UA },
      })
      const res = await worker.fetch(req, ENV)
      const html = await res.text()

      expect(res.status).toBe(200)
      expect(html).toContain('og:title')
      expect(html).toContain('SurveySui')
    })

    it('backend 無法連線時使用預設 OG tags', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      const req = new Request('https://surveysui.xyz/s/abc123', {
        headers: { 'User-Agent': BOT_UA },
      })
      const res = await worker.fetch(req, ENV)
      const html = await res.text()

      expect(res.status).toBe(200)
      expect(html).toContain('og:title')
      expect(html).toContain('SurveySui')
    })
  })
})
