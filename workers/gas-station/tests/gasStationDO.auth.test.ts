import { describe, it, expect, beforeEach } from 'vitest'
import { Transaction } from '@mysten/sui/transactions'
import { signGasStationBody, keypairFromHex } from '@surveysui/gas-station-core'
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
      transaction: async (closure) => closure(mockState().storage),
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
  const signature = signGasStationBody(secret, timestamp, rawBody)
  return new Request('https://gas-station.test/sponsor', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gas-station-timestamp': timestamp,
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
        claimStorageCompensationAmount: null,
        claimHasBlob: false,
      },
    }
    const res = await doInstance.fetch(signedRequest(body))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('invalid_transaction_commands')
  })
})
