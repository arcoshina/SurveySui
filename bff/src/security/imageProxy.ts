import type { Hono } from 'hono'
import { assertPublicHttpUrl } from './ssrfGuard.js'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_DIMENSION = 5000
const MAX_REDIRECTS = 4

type ImageType = 'png' | 'jpeg' | 'gif' | 'webp'

const CONTENT_TYPE: Record<ImageType, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

function u16BE(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1]
}
function u32BE(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
}
function u16LE(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8)
}

/**
 * 純 JS 解析影像 magic bytes 與尺寸（取代 sharp）。
 * 注意：本實作僅「驗證」型別與尺寸，**不重新編碼**，故不會剝離夾帶於影像中的惡意
 * payload（依使用者決策接受此殘留風險）。回傳 null 表示無法辨識為支援的影像格式。
 */
function sniffImage(b: Uint8Array): { type: ImageType; width: number; height: number } | null {
  // PNG
  if (
    b.length >= 24 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { type: 'png', width: u32BE(b, 16), height: u32BE(b, 20) }
  }

  // GIF (GIF87a / GIF89a)
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return { type: 'gif', width: u16LE(b, 6), height: u16LE(b, 8) }
  }

  // WebP: 'RIFF' .... 'WEBP'
  if (
    b.length >= 30 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    const fmt = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (fmt === 'VP8 ') {
      // lossy: width/height (14 bits) little-endian at offset 26 / 28
      return { type: 'webp', width: u16LE(b, 26) & 0x3fff, height: u16LE(b, 28) & 0x3fff }
    }
    if (fmt === 'VP8L') {
      // lossless: 14-bit width-1 / height-1 packed from offset 21
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return {
        type: 'webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      }
    }
    if (fmt === 'VP8X') {
      // extended: 24-bit width-1 / height-1 little-endian at offset 24 / 27
      const w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1
      const h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1
      return { type: 'webp', width: w, height: h }
    }
    return null
  }

  // JPEG: scan SOF markers
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let o = 2
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) {
        o++
        continue
      }
      const marker = b[o + 1]
      // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC) carry dimensions
      if (
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        return { type: 'jpeg', height: u16BE(b, o + 5), width: u16BE(b, o + 7) }
      }
      // skip this segment by its length
      const len = u16BE(b, o + 2)
      if (len <= 0) break
      o += 2 + len
    }
    return null
  }

  return null
}

export function registerImageProxyRoutes(app: Hono): void {
  app.get('/api/proxy/image', async (c) => {
    const url = c.req.query('url')
    if (!url) {
      return c.json({ error: 'missing_url', message: 'Query parameter "url" is required' }, 400)
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return c.json({ error: 'invalid_url', message: 'URL is invalid' }, 400)
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return c.json(
        { error: 'unsupported_protocol', message: 'Only http and https protocols are supported' },
        400
      )
    }
    // SSRF 防護：封鎖內網/保留/link-local 目標（與轉址逐跳重驗同碼，避免洩漏內網掃描訊號）
    if (!assertPublicHttpUrl(parsedUrl).ok) {
      return c.json({ error: 'blocked_target', message: 'Target host is not allowed' }, 400)
    }

    try {
      // 1. 抓外部影像：5 秒逾時、2MB 上限（逐塊讀取防 content-length 繞過）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      let res: Response
      try {
        // redirect:'manual' 手動逐跳重驗，防 302 轉址至內網（workerd 下可讀 3xx Location）
        let currentUrl = parsedUrl
        let hops = 0
        for (;;) {
          const hopRes = await fetch(currentUrl.toString(), {
            signal: controller.signal,
            redirect: 'manual',
            headers: { 'User-Agent': 'SurveySui-ImageProxy/1.0' },
          })
          const isRedirect = hopRes.status >= 300 && hopRes.status < 400
          const location = hopRes.headers.get('location')
          if (!isRedirect || !location) {
            res = hopRes
            break
          }
          if (++hops > MAX_REDIRECTS) {
            clearTimeout(timeoutId)
            return c.json({ error: 'too_many_redirects', message: 'Too many redirects' }, 502)
          }
          let nextUrl: URL
          try {
            nextUrl = new URL(location, currentUrl)
          } catch {
            clearTimeout(timeoutId)
            return c.json({ error: 'blocked_target', message: 'Target host is not allowed' }, 400)
          }
          if (!assertPublicHttpUrl(nextUrl).ok) {
            clearTimeout(timeoutId)
            return c.json({ error: 'blocked_target', message: 'Target host is not allowed' }, 400)
          }
          currentUrl = nextUrl
        }
      } finally {
        clearTimeout(timeoutId)
      }

      if (!res.ok) {
        return c.json({ error: 'fetch_failed', message: `Failed to fetch image: ${res.status}` }, 502)
      }

      const contentLength = res.headers.get('content-length')
      if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
        return c.json({ error: 'image_too_large', message: 'Image exceeds 2MB limit' }, 413)
      }

      const reader = res.body?.getReader()
      if (!reader) {
        return c.json({ error: 'no_response_body', message: 'Response body is empty' }, 500)
      }
      const chunks: Uint8Array[] = []
      let totalBytes = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          totalBytes += value.length
          if (totalBytes > MAX_BYTES) {
            await reader.cancel()
            return c.json({ error: 'image_too_large', message: 'Image exceeds 2MB limit' }, 413)
          }
          chunks.push(value)
        }
      }
      const bytes = new Uint8Array(totalBytes)
      let offset = 0
      for (const ch of chunks) {
        bytes.set(ch, offset)
        offset += ch.length
      }

      // 2. magic-byte 型別 + 尺寸驗證（去 sharp；不重新編碼）
      const info = sniffImage(bytes)
      if (!info) {
        return c.json(
          { error: 'unsupported_image', message: 'Not a recognized PNG/JPEG/GIF/WebP image' },
          400
        )
      }
      if (info.width > MAX_DIMENSION || info.height > MAX_DIMENSION) {
        return c.json(
          { error: 'pixel_flood_prevented', message: 'Image resolution is too large (max 5000x5000)' },
          400
        )
      }

      // 3. 回傳原始已驗證影像（不重編碼），帶安全標頭與快取
      return c.body(bytes, 200, {
        'Content-Type': CONTENT_TYPE[info.type],
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=86400',
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return c.json({ error: 'gateway_timeout', message: 'Fetching external image timed out' }, 504)
      }
      console.error('[ImageProxy] failed', err)
      return c.json(
        {
          error: 'image_processing_failed',
          message: err instanceof Error ? err.message : 'Failed to process image',
        },
        500
      )
    }
  })
}
