import { describe, it, expect } from 'vitest'
import {
  canonicalJsonStringify,
  signGasStationBody,
  verifyGasStationSignature,
} from '../src/gasStationHmac.js'

describe('gasStationHmac', () => {
  it('canonicalJsonStringify sorts object keys', () => {
    const a = canonicalJsonStringify({ b: 1, a: 2 })
    const b = canonicalJsonStringify({ a: 2, b: 1 })
    expect(a).toBe(b)
  })

  it('signs and verifies request bodies', () => {
    const secret = 'unit-test-secret'
    const timestamp = String(Date.now())
    const body = canonicalJsonStringify({ txBytes: 'abc', senderAddress: '0x1' })
    const sig = signGasStationBody(secret, timestamp, body)
    expect(verifyGasStationSignature(secret, timestamp, body, sig)).toBe(true)
    expect(verifyGasStationSignature(secret, timestamp, body, 'deadbeef')).toBe(false)
  })

  it('rejects expired timestamps', () => {
    const secret = 'unit-test-secret'
    const body = '{}'
    const oldTs = String(Date.now() - 10 * 60 * 1000)
    const sig = signGasStationBody(secret, oldTs, body)
    expect(verifyGasStationSignature(secret, oldTs, body, sig)).toBe(false)
  })
})
