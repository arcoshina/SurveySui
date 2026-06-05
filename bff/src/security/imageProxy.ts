import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import sharp from 'sharp'

interface ImageProxyQuery {
  url?: string
}

export function registerImageProxyRoutes(app: FastifyInstance): void {
  app.get(
    '/api/proxy/image',
    async (req: FastifyRequest<{ Querystring: ImageProxyQuery }>, reply: FastifyReply) => {
      const { url } = req.query
      if (!url) {
        return reply.status(400).send({ error: 'missing_url', message: 'Query parameter "url" is required' })
      }

      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        return reply.status(400).send({ error: 'invalid_url', message: 'URL is invalid' })
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return reply.status(400).send({ error: 'unsupported_protocol', message: 'Only http and https protocols are supported' })
      }

      try {
        // 1. Fetch external image with timeout (5 seconds) and size limit (2MB)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const res = await fetch(parsedUrl.toString(), {
          signal: controller.signal,
          headers: {
            'User-Agent': 'SurveySui-ImageProxy/1.0',
          },
        })
        clearTimeout(timeoutId)

        if (!res.ok) {
          return reply.status(502).send({ error: 'fetch_failed', message: `Failed to fetch image: ${res.status}` })
        }

        // Check content-length header early
        const contentLength = res.headers.get('content-length')
        if (contentLength && parseInt(contentLength, 10) > 2 * 1024 * 1024) {
          return reply.status(413).send({ error: 'image_too_large', message: 'Image exceeds 2MB limit' })
        }

        // Read chunks while checking size limit to prevent content-length bypass
        const reader = res.body?.getReader()
        if (!reader) {
          return reply.status(500).send({ error: 'no_response_body', message: 'Response body is empty' })
        }

        const chunks: Uint8Array[] = []
        let totalBytes = 0

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            totalBytes += value.length
            if (totalBytes > 2 * 1024 * 1024) {
              await reader.cancel()
              return reply.status(413).send({ error: 'image_too_large', message: 'Image exceeds 2MB limit' })
            }
            chunks.push(value)
          }
        }

        const imageBuffer = Buffer.concat(chunks)

        // 2. Load into sharp and check dimensions (Pixel flood mitigation)
        const image = sharp(imageBuffer)
        const metadata = await image.metadata()

        if (
          (metadata.width && metadata.width > 5000) ||
          (metadata.height && metadata.height > 5000)
        ) {
          return reply.status(400).send({ error: 'pixel_flood_prevented', message: 'Image resolution is too large (max 5000x5000)' })
        }

        // 3. Resize (to within 400x400 aspect-ratio inside) and convert to clean WebP
        const cleanWebpBuffer = await image
          .resize({
            width: 400,
            height: 400,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 80 })
          .toBuffer()

        // 4. Return clean image with security headers and caching
        return reply
          .header('Content-Type', 'image/webp')
          .header('X-Content-Type-Options', 'nosniff')
          .header('Cache-Control', 'public, max-age=86400')
          .send(cleanWebpBuffer)
      } catch (err: any) {
        req.log.error(err)
        if (err.name === 'AbortError') {
          return reply.status(504).send({ error: 'gateway_timeout', message: 'Fetching external image timed out' })
        }
        return reply.status(500).send({ error: 'image_processing_failed', message: err.message || 'Failed to process image' })
      }
    }
  )
}
