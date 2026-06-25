import { describe, it, expect, beforeEach } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { signGasStationBody, generateGasStationNonce, keypairFromHex } from '@surveysui/gas-station-core'
import { GasStationDO } from '../src/gasStationDO.js'
import type { GasStationEnv } from '../src/env.js'

const ISSUER_PRIV = '0101010101010101010101010101010101010101010101010101010101010101'
const SPONSOR_PRIV_2 = '0202020202020202020202020202020202020202020202020202020202020202'
const SPONSOR_PRIV_3 = '0303030303030303030303030303030303030303030303030303030303030303'
const SHARED_SECRET = 'test-do-shared-secret'
const COLD_PUBKEY_3 = Buffer.from(
  keypairFromHex(SPONSOR_PRIV_3).getPublicKey().toRawBytes()
).toString('hex')

function mockState(): DurableObjectState {
  const data = new Map<string, unknown>()
  return {
    storage: {
      get: async (key: string) => data.get(key),
      put: async (key: string, value: unknown) => {
        data.set(key, value)
      },
      delete: async (key: string) => {
        data.delete(key)
      },
      list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
      deleteAll: async () => data.clear(),
      getAlarm: async () => null,
      setAlarm: async () => {},
      deleteAlarm: async () => {},
      sync: async () => {},
      transaction: async (closure: (txn: any) => any) => closure(mockState().storage),
    },
    blockConcurrencyWhile: async (fn: () => Promise<void>) => {
      await fn()
    },
    id: { toString: () => 'test-do' } as DurableObjectId,
    waitUntil: () => {},
  } as unknown as DurableObjectState
}

function baseEnv(): GasStationEnv {
  return {
    GAS_STATION: {} as GasStationEnv['GAS_STATION'],
    SUI_RPC_URL: 'https://rpc.test',
    SUI_PACKAGE_ID: '0xec7cddee76702e0209aabad0c56a8a4c14583d0eaafda3ed52ddd962b216d9fd',
    GAS_STATION_SHARED_SECRET: SHARED_SECRET,
    SURVEY_PASS_ISSUER_PRIV: ISSUER_PRIV,
    GAS_SPONSOR_PRIV_1: ISSUER_PRIV,
    GAS_SPONSOR_PRIV_2: SPONSOR_PRIV_2,
    GAS_SPONSOR_PUBKEY_3: COLD_PUBKEY_3,
  }
}

function signedRequest(body: unknown, secret = SHARED_SECRET): Request {
  const rawBody = JSON.stringify(body)
  const timestamp = String(Date.now())
  const nonce = generateGasStationNonce()
  const signature = signGasStationBody(secret, timestamp, nonce, rawBody)
  return new Request('https://gas-station.test/sponsor', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gas-station-timestamp': timestamp,
      'x-gas-station-nonce': nonce,
      'x-gas-station-signature': signature,
    },
    body: rawBody,
  })
}

describe('GasStationDO /sponsor auth', () => {
  let doInstance: GasStationDO

  beforeEach(() => {
    doInstance = new GasStationDO(mockState(), baseEnv())
  })

  it('rejects requests without HMAC headers', async () => {
    const res = await doInstance.fetch(
      new Request('https://gas-station.test/sponsor', {
        method: 'POST',
        body: JSON.stringify({ txBytes: 'aa', senderAddress: '0x1' }),
      })
    )
    expect(res.status).toBe(401)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('unauthorized')
  })

  it('rejects requests with invalid HMAC', async () => {
    const body = { txBytes: 'aa', senderAddress: '0x1' }
    const rawBody = JSON.stringify(body)
    const timestamp = String(Date.now())
    const res = await doInstance.fetch(
      new Request('https://gas-station.test/sponsor', {
        method: 'POST',
        headers: {
          'x-gas-station-timestamp': timestamp,
          'x-gas-station-signature': '00'.repeat(64),
        },
        body: rawBody,
      })
    )
    expect(res.status).toBe(401)
  })

  it('rejects /release without valid HMAC', async () => {
    const res = await doInstance.fetch(
      new Request('https://gas-station.test/release', {
        method: 'POST',
        body: JSON.stringify({ coinObjectIds: ['0xabc'] }),
      })
    )
    expect(res.status).toBe(401)
  })

  it('releases the given coin locks on signed /release', async () => {
    const coinId = '0x00000000000000000000000000000000000000000000000000000000000000aa'
    // Seed a live lock directly on the coin store.
    ;(doInstance as any).coinStore.state.locks[coinId] = { expiresAt: Date.now() + 999_999 }
    expect((doInstance as any).coinStore.getLockedCoinIds().has(coinId)).toBe(true)

    const body = { coinObjectIds: [coinId] }
    const rawBody = JSON.stringify(body)
    const timestamp = String(Date.now())
    const nonce = generateGasStationNonce()
    const signature = signGasStationBody(SHARED_SECRET, timestamp, nonce, rawBody)
    const res = await doInstance.fetch(
      new Request('https://gas-station.test/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-gas-station-timestamp': timestamp,
          'x-gas-station-nonce': nonce,
          'x-gas-station-signature': signature,
        },
        body: rawBody,
      })
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { released: number }
    expect(json.released).toBe(1)
    expect((doInstance as any).coinStore.getLockedCoinIds().has(coinId)).toBe(false)
  })

  it('rejects a replayed request (same timestamp/nonce/signature) with 401', async () => {
    const coinId = '0x00000000000000000000000000000000000000000000000000000000000000bb'
    ;(doInstance as any).coinStore.state.locks[coinId] = { expiresAt: Date.now() + 999_999 }

    const rawBody = JSON.stringify({ coinObjectIds: [coinId] })
    const timestamp = String(Date.now())
    const nonce = generateGasStationNonce()
    const signature = signGasStationBody(SHARED_SECRET, timestamp, nonce, rawBody)
    const makeReq = () =>
      new Request('https://gas-station.test/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-gas-station-timestamp': timestamp,
          'x-gas-station-nonce': nonce,
          'x-gas-station-signature': signature,
        },
        body: rawBody,
      })

    const first = await doInstance.fetch(makeReq())
    expect(first.status).toBe(200)

    const replay = await doInstance.fetch(makeReq())
    expect(replay.status).toBe(401)
    const json = (await replay.json()) as { error: string; message: string }
    expect(json.error).toBe('unauthorized')
    expect(json.message).toBe('Replayed request')
  })

  it('rejects requests missing the nonce header', async () => {
    const rawBody = JSON.stringify({ coinObjectIds: ['0xabc'] })
    const timestamp = String(Date.now())
    // Sign with a nonce but omit the header → signature can't be reconstructed → 401.
    const signature = signGasStationBody(SHARED_SECRET, timestamp, generateGasStationNonce(), rawBody)
    const res = await doInstance.fetch(
      new Request('https://gas-station.test/release', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-gas-station-timestamp': timestamp,
          'x-gas-station-signature': signature,
        },
        body: rawBody,
      })
    )
    expect(res.status).toBe(401)
  })

  it('re-validates PTB and ignores client pipelineContext (invalid tx → 400)', async () => {
    const packageId = baseEnv().SUI_PACKAGE_ID!
    const sender = '0x0000000000000000000000000000000000000000000000000000000000000003'
    const tx = new Transaction()
    tx.moveCall({
      target: `${packageId}::survey_registry::create_survey`,
      arguments: [],
    })
    tx.setSender(sender)
    const txBytes = Buffer.from(await tx.build({ onlyTransactionKind: true })).toString('base64')

    const body = {
      txBytes,
      senderAddress: sender,
      pipelineContext: {
        isPassSponsor: false,
        isPlatformSponsor: false,
        claimGasCompensationAmount: null,
      },
    }
    const res = await doInstance.fetch(signedRequest(body))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('invalid_transaction_commands')
  })
})
