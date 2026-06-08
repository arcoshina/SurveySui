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
      const body = await request
        .json<{ sponsorAddress?: string }>()
        .catch((): { sponsorAddress?: string } => ({}))
      const sponsorAddress = body.sponsorAddress
      if (!sponsorAddress) {
        return Response.json(
          { error: 'missing_sponsor_address', message: 'sponsorAddress required for routing' },
          { status: 400 }
        )
      }
      const id = env.GAS_STATION.idFromName(normalizeSponsorId(sponsorAddress))
      const stub = env.GAS_STATION.get(id)
      return stub.fetch(
        new Request('https://gas-station/sponsor', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    }

    return new Response('Not found', { status: 404 })
  },
}
