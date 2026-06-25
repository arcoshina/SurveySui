import { describe, it, expect } from 'vitest'
import { onRequestGet } from './[surveyId]'

const ORIGIN = 'https://survey.example'

function makeContext(surveyId: string, ua: string) {
  return {
    request: new Request(`${ORIGIN}/og/${surveyId}`, {
      headers: ua ? { 'user-agent': ua } : {},
    }),
    params: { surveyId },
  }
}

describe('og/[surveyId] onRequestGet', () => {
  const CRAWLER_UA = 'facebookexternalhit/1.1'

  it('合法 surveyId + 爬蟲 UA → 200 HTML 含 surveyId', async () => {
    const id = '0xabc123'
    const res = await onRequestGet(makeContext(id, CRAWLER_UA))
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(`${ORIGIN}/s/${id}`)
  })

  it('合法 surveyId + 一般瀏覽器 UA → 302 轉址', async () => {
    const id = '0xabc123'
    const res = await onRequestGet(makeContext(id, 'Mozilla/5.0'))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${ORIGIN}/s/${id}`)
  })

  it('非法 surveyId（含 HTML）→ 400 且不回顯輸入', async () => {
    const res = await onRequestGet(makeContext('0x"><script>', CRAWLER_UA))
    expect(res.status).toBe(400)
    const body = await res.text()
    expect(body).not.toContain('<script>')
  })

  it('非法 surveyId（非 0x 格式）→ 400', async () => {
    const res = await onRequestGet(makeContext('foo', CRAWLER_UA))
    expect(res.status).toBe(400)
  })

  it('邊界：0x 後 0 碼 → 400', async () => {
    const res = await onRequestGet(makeContext('0x', CRAWLER_UA))
    expect(res.status).toBe(400)
  })

  it('邊界：0x 後超過 64 碼 → 400', async () => {
    const res = await onRequestGet(makeContext(`0x${'a'.repeat(65)}`, CRAWLER_UA))
    expect(res.status).toBe(400)
  })

  it('邊界：0x 後正好 64 碼 → 200', async () => {
    const id = `0x${'a'.repeat(64)}`
    const res = await onRequestGet(makeContext(id, CRAWLER_UA))
    expect(res.status).toBe(200)
  })
})
