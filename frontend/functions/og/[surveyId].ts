/**
 * Cloudflare Pages Function：問卷連結預覽（OG meta）。
 *
 * 取代原 BFF `GET /og/:surveyId`（§12）。爬蟲不跑 JS，故 OG meta 必須由邊緣
 * 伺服端回應；內容為全靜態，天生屬 Pages 邊緣的職責，不再佔 BFF Worker。
 *
 * 路徑：`<Pages>/og/:surveyId`
 *  - 爬蟲 UA → 回傳靜態 OG meta HTML
 *  - 一般瀏覽器 → 302 轉至 `/s/:surveyId`
 */

const CRAWLER_KEYWORDS = [
  'bot',
  'crawl',
  'spider',
  'slurp',
  'facebookexternalhit',
  'preview',
  'embed',
  'telegram',
  'discord',
  'slack',
  'whatsapp',
  'twitter',
  'linkedin',
]

function isCrawler(ua: string): boolean {
  const lower = ua.toLowerCase()
  return CRAWLER_KEYWORDS.some((k) => lower.includes(k))
}

// 合法 surveyId 為 Sui object ID：`0x` 後接 1–64 個十六進位字元。
const SUI_OBJECT_ID = /^0x[0-9a-fA-F]{1,64}$/

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildOgHtml(surveyId: string, origin: string): string {
  // 縱深防禦：surveyId 已經格式驗證，僅含 0-9a-fA-F 與 0x；此處再跳脫保險。
  const safeId = escapeHtml(surveyId)
  const surveyUrl = `${origin}/s/${safeId}`
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${surveyUrl}" />
  <meta property="og:title" content="SurveySui 問卷" />
  <meta property="og:description" content="參與 Sui 區塊鏈問卷，完成即獲 SurveysuiReward 獎勵。" />
  <meta property="og:image" content="${origin}/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta http-equiv="refresh" content="0;url=${surveyUrl}" />
</head>
<body>
  <a href="${surveyUrl}">前往問卷</a>
</body>
</html>`
}

export async function onRequestGet(context: {
  request: Request
  params: Record<string, string | string[]>
}): Promise<Response> {
  const { request, params } = context
  const surveyId = String(params.surveyId)
  const ua = request.headers.get('user-agent') ?? ''
  const origin = new URL(request.url).origin

  // fail-closed：非法 surveyId 一律拒絕，回應不回顯原始輸入。
  if (!SUI_OBJECT_ID.test(surveyId)) {
    return new Response('Invalid survey id', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  if (!isCrawler(ua)) {
    return Response.redirect(`${origin}/s/${surveyId}`, 302)
  }

  return new Response(buildOgHtml(surveyId, origin), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
