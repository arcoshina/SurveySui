const BOT_PATTERNS = [
  'Discordbot',
  'Twitterbot',
  'Slackbot-LinkExpanding',
  'Slackbot',
  'facebookexternalhit',
  'LinkedInBot',
  'WhatsApp',
  'TelegramBot',
  'LINE',
]

export interface Env {
  BACKEND_URL: string
  SITE_URL: string
}

interface SurveyResponse {
  contentMd?: string
  questions?: unknown[]
}

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase()
  return BOT_PATTERNS.some((p) => ua.includes(p.toLowerCase()))
}

function extractTitle(contentMd: string): string {
  const match = /^---[\s\S]*?\ntitle:\s*(.+)[\s\S]*?\n---/.exec(contentMd)
  if (!match) return 'SurveySui 問卷'
  return match[1].trim().replace(/^["']|["']$/g, '')
}

async function fetchSurveyMeta(
  surveyId: string,
  backendUrl: string,
): Promise<{ title: string; questionCount: number } | null> {
  try {
    const res = await fetch(`${backendUrl}/surveys/${surveyId}`)
    if (!res.ok) return null
    const data = (await res.json()) as SurveyResponse
    const title = extractTitle(data.contentMd ?? '')
    const questionCount = Array.isArray(data.questions) ? data.questions.length : 0
    return { title, questionCount }
  } catch {
    return null
  }
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildOgHtml(
  title: string,
  description: string,
  surveyId: string,
  siteUrl: string,
): string {
  const t = esc(`${title} — SurveySui`)
  const d = esc(description)
  const url = esc(`${siteUrl}/s/${surveyId}`)
  const img = esc(`${siteUrl}/og-image.png`)

  return `<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:image" content="${img}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${img}" />
  </head>
  <body></body>
</html>`
}

const DEFAULT_TITLE = 'SurveySui 問卷'
const DEFAULT_DESCRIPTION =
  '透過 Sui 區塊鏈發起問卷、發放 RWD 代幣獎勵，安全可驗證的去中心化問卷平台。'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const surveyMatch = /^\/s\/([^/]+)$/.exec(url.pathname)

    if (!surveyMatch) {
      return fetch(request)
    }

    const surveyId = surveyMatch[1]
    const ua = request.headers.get('User-Agent') ?? ''

    if (!isBot(ua)) {
      return fetch(request)
    }

    const meta = await fetchSurveyMeta(surveyId, env.BACKEND_URL)

    if (!meta) {
      const html = buildOgHtml(DEFAULT_TITLE, DEFAULT_DESCRIPTION, surveyId, env.SITE_URL)
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      })
    }

    const { title, questionCount } = meta
    const description = `參與問卷並獲得 RWD 代幣獎勵，共 ${questionCount} 題。`
    const html = buildOgHtml(title, description, surveyId, env.SITE_URL)
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    })
  },
}
