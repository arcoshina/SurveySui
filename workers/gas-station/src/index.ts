import { createSponsorSignerFromEnv } from '@surveysui/gas-station-core'
import { GasStationDO } from './gasStationDO.js'
import { toSponsorSignerEnv, type GasStationEnv } from './env.js'

export { GasStationDO }

function normalizeSponsorId(address: string): string {
  let clean = address.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}

function resolveSponsorAddress(env: GasStationEnv): string | null {
  const signer = createSponsorSignerFromEnv(toSponsorSignerEnv(env))
  return signer?.getSponsorAddress() ?? null
}

// HMAC 標頭一律原樣轉送：DO 的驗章是對 BFF 送來的 rawBody 位元組計算的，
// 入口 Worker 不可重新序列化 body，也不可漏帶這些標頭，否則 DO 必回 401。
const FORWARD_HEADERS = [
  'content-type',
  'x-gas-station-timestamp',
  'x-gas-station-nonce',
  'x-gas-station-signature',
]

/** 把已驗路由的請求原樣（rawBody + HMAC 標頭）轉送到指定 sponsor 的 DO。 */
function forwardToDO(
  env: GasStationEnv,
  sponsorAddress: string,
  path: string,
  rawBody: string,
  srcHeaders: Headers
): Promise<Response> {
  const id = env.GAS_STATION.idFromName(normalizeSponsorId(sponsorAddress))
  const stub = env.GAS_STATION.get(id)
  const headers = new Headers()
  for (const name of FORWARD_HEADERS) {
    const value = srcHeaders.get(name)
    if (value !== null) headers.set(name, value)
  }
  return stub.fetch(
    new Request(`https://gas-station${path}`, {
      method: 'POST',
      headers,
      body: rawBody,
    })
  )
}

export default {
  async fetch(request: Request, env: GasStationEnv): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health' && request.method === 'GET') {
      const sponsorAddress = resolveSponsorAddress(env)
      if (!sponsorAddress) {
        return Response.json({ available: false, reason: 'no_key' })
      }
      const id = env.GAS_STATION.idFromName(normalizeSponsorId(sponsorAddress))
      const stub = env.GAS_STATION.get(id)
      return stub.fetch(new Request('https://gas-station/health', { method: 'GET' }))
    }

    if (url.pathname === '/sponsor' && request.method === 'POST') {
      const rawBody = await request.text()
      let sponsorAddress: string | undefined
      try {
        sponsorAddress = (JSON.parse(rawBody) as { sponsorAddress?: string }).sponsorAddress
      } catch {
        sponsorAddress = undefined
      }
      if (!sponsorAddress) {
        return Response.json(
          { error: 'missing_sponsor_address', message: 'sponsorAddress required for routing' },
          { status: 400 }
        )
      }
      return forwardToDO(env, sponsorAddress, '/sponsor', rawBody, request.headers)
    }

    if (url.pathname === '/release' && request.method === 'POST') {
      // /release body 只有 coinObjectIds、無 sponsorAddress；系統僅單一 sponsor，
      // 故由 env 推導多簽位址當路由 key。
      const sponsorAddress = resolveSponsorAddress(env)
      if (!sponsorAddress) {
        return Response.json({ error: 'no_key', message: 'Sponsor key not configured' }, { status: 503 })
      }
      const rawBody = await request.text()
      return forwardToDO(env, sponsorAddress, '/release', rawBody, request.headers)
    }

    return new Response('Not found', { status: 404 })
  },
}
