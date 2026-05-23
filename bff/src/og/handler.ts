import type { FastifyInstance } from 'fastify'
import { buildOgHtml } from './renderer.js'

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

export interface OgHandlerDeps {
  frontendUrl: string
}

export function registerOgRoutes(app: FastifyInstance, deps: OgHandlerDeps): void {
  app.get<{ Params: { surveyId: string } }>('/og/:surveyId', async (req, reply) => {
    const { surveyId } = req.params
    const ua = req.headers['user-agent'] ?? ''

    if (!isCrawler(ua)) {
      return reply.redirect(`${deps.frontendUrl}/s/${surveyId}`, 302)
    }

    const html = buildOgHtml(surveyId, deps.frontendUrl)
    return reply.code(200).type('text/html').send(html)
  })
}
