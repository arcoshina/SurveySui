import { GasStationDO } from './gasStationDO.js'
import type { GasStationEnv } from './env.js'

export { GasStationDO }

function normalizeSponsorId(address: string): string {
  let clean = address.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}

export default {
  async fetch(request: Request, env: GasStationEnv): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health' && request.method === 'GET') {
      const privKeyHex = env.SURVEY_PASS_ISSUER_PRIV
      if (!privKeyHex) {
        return Response.json({ available: false, reason: 'no_key' })
      }
      const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519')
      const privKeyClean = privKeyHex.startsWith('0x') ? privKeyHex.slice(2) : privKeyHex
      const keypair = Ed25519Keypair.fromSecretKey(
        new Uint8Array(Buffer.from(privKeyClean, 'hex')).slice(0, 32)
      )
      const sponsorAddress = keypair.getPublicKey().toSuiAddress()
      const id = env.GAS_STATION.idFromName(normalizeSponsorId(sponsorAddress))
      const stub = env.GAS_STATION.get(id)
      return stub.fetch(new Request('https://gas-station/health', { method: 'GET' }))
    }

    if (url.pathname === '/sponsor' && request.method === 'POST') {
      const body = await request.json<{ sponsorAddress?: string }>().catch(() => ({}))
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
