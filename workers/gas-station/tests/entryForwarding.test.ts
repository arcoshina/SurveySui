import { describe, it, expect } from 'vitest'
import {
  signGasStationBody,
  generateGasStationNonce,
  keypairFromHex,
  canonicalJsonStringify,
} from '@surveysui/gas-station-core'
import worker from '../src/index.js'
import type { GasStationEnv } from '../src/env.js'

const SPONSOR_PRIV_1 = '0101010101010101010101010101010101010101010101010101010101010101'
const SPONSOR_PRIV_2 = '0202020202020202020202020202020202020202020202020202020202020202'
const SPONSOR_PRIV_3 = '0303030303030303030303030303030303030303030303030303030303030303'
const SHARED_SECRET = 'test-do-shared-secret'
const COLD_PUBKEY_3 = Buffer.from(
  keypairFromHex(SPONSOR_PRIV_3).getPublicKey().toRawBytes()
).toString('hex')

/** Captures the Request the entry Worker forwards to the DO stub. */
function makeEnv(): { env: GasStationEnv; captured: { request: Request | null } } {
  const captured: { request: Request | null } = { request: null }
  const stub = {
    fetch: (request: Request) => {
      captured.request = request
      return Promise.resolve(Response.json({ ok: true }))
    },
  }
  const env = {
    GAS_STATION: {
      idFromName: (name: string) => ({ name }),
      get: () => stub,
    },
    SUI_RPC_URL: 'https://rpc.test',
    SUI_PACKAGE_ID: '0xec7cddee76702e0209aabad0c56a8a4c14583d0eaafda3ed52ddd962b216d9fd',
    GAS_STATION_SHARED_SECRET: SHARED_SECRET,
    GAS_SPONSOR_PRIV_1: SPONSOR_PRIV_1,
    GAS_SPONSOR_PRIV_2: SPONSOR_PRIV_2,
    GAS_SPONSOR_PUBKEY_3: COLD_PUBKEY_3,
  } as unknown as GasStationEnv
  return { env, captured }
}

function signedRequest(
  path: string,
  body: unknown
): { request: Request; rawBody: string; timestamp: string; nonce: string; signature: string } {
  // BFF signs over the canonical body string — the entry Worker must forward it byte-for-byte.
  const rawBody = canonicalJsonStringify(body)
  const timestamp = String(Date.now())
  const nonce = generateGasStationNonce()
  const signature = signGasStationBody(SHARED_SECRET, timestamp, nonce, rawBody)
  const request = new Request(`https://gas-station${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gas-station-timestamp': timestamp,
      'x-gas-station-nonce': nonce,
      'x-gas-station-signature': signature,
    },
    body: rawBody,
  })
  return { request, rawBody, timestamp, nonce, signature }
}

describe('entry Worker forwarding preserves HMAC auth', () => {
  it('/sponsor forwards rawBody and HMAC headers unchanged', async () => {
    const { env, captured } = makeEnv()
    const { request, rawBody, timestamp, nonce, signature } = signedRequest('/sponsor', {
      txBytes: 'aa',
      senderAddress: '0x1',
      sponsorAddress: '0x43e4',
    })

    const res = await worker.fetch(request, env)
    expect(res.status).toBe(200)

    const forwarded = captured.request!
    expect(forwarded).not.toBeNull()
    expect(new URL(forwarded.url).pathname).toBe('/sponsor')
    expect(forwarded.headers.get('x-gas-station-timestamp')).toBe(timestamp)
    expect(forwarded.headers.get('x-gas-station-nonce')).toBe(nonce)
    expect(forwarded.headers.get('x-gas-station-signature')).toBe(signature)
    // Body must be byte-identical, otherwise the DO's HMAC check fails.
    expect(await forwarded.text()).toBe(rawBody)
  })

  it('/sponsor without sponsorAddress returns 400 and does not forward', async () => {
    const { env, captured } = makeEnv()
    const { request } = signedRequest('/sponsor', { txBytes: 'aa', senderAddress: '0x1' })

    const res = await worker.fetch(request, env)
    expect(res.status).toBe(400)
    expect(captured.request).toBeNull()
  })

  it('/release forwards rawBody and HMAC headers, routing via env sponsor', async () => {
    const { env, captured } = makeEnv()
    const { request, rawBody, timestamp, nonce, signature } = signedRequest('/release', {
      coinObjectIds: ['0xabc'],
    })

    const res = await worker.fetch(request, env)
    expect(res.status).toBe(200)

    const forwarded = captured.request!
    expect(forwarded).not.toBeNull()
    expect(new URL(forwarded.url).pathname).toBe('/release')
    expect(forwarded.headers.get('x-gas-station-timestamp')).toBe(timestamp)
    expect(forwarded.headers.get('x-gas-station-nonce')).toBe(nonce)
    expect(forwarded.headers.get('x-gas-station-signature')).toBe(signature)
    expect(await forwarded.text()).toBe(rawBody)
  })
})
