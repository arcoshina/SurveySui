import { describe, it, expect } from 'vitest'
import {
  canonicalJsonStringify,
  generateGasStationNonce,
  signGasStationBody,
  verifyGasStationSignature,
} from '../src/gasStationHmac.js'

describe('gasStationHmac', () => {
  it('canonicalJsonStringify sorts object keys', () => {
    const a = canonicalJsonStringify({ b: 1, a: 2 })
    const b = canonicalJsonStringify({ a: 2, b: 1 })
    expect(a).toBe(b)
  })

  it('canonicalJsonStringify omits undefined values and stays valid JSON', () => {
    const out = canonicalJsonStringify({ a: 1, requestId: undefined, b: 2 })
    expect(out).toBe('{"a":1,"b":2}')
    expect(() => JSON.parse(out)).not.toThrow()
  })

  it('signs and verifies request bodies', () => {
    const secret = 'unit-test-secret'
    const timestamp = String(Date.now())
    const nonce = generateGasStationNonce()
    const body = canonicalJsonStringify({ txBytes: 'abc', senderAddress: '0x1' })
    const sig = signGasStationBody(secret, timestamp, nonce, body)
    expect(verifyGasStationSignature(secret, timestamp, nonce, body, sig)).toBe(true)
    expect(verifyGasStationSignature(secret, timestamp, nonce, body, 'deadbeef')).toBe(false)
  })

  it('signature covers the nonce (different nonce → different signature)', () => {
    const secret = 'unit-test-secret'
    const timestamp = String(Date.now())
    const body = '{}'
    const sigA = signGasStationBody(secret, timestamp, 'nonce-a', body)
    const sigB = signGasStationBody(secret, timestamp, 'nonce-b', body)
    expect(sigA).not.toBe(sigB)
    // A signature made with one nonce must not verify under another nonce.
    expect(verifyGasStationSignature(secret, timestamp, 'nonce-b', body, sigA)).toBe(false)
  })

  it('rejects expired timestamps', () => {
    const secret = 'unit-test-secret'
    const body = '{}'
    const nonce = generateGasStationNonce()
    const oldTs = String(Date.now() - 10 * 60 * 1000)
    const sig = signGasStationBody(secret, oldTs, nonce, body)
    expect(verifyGasStationSignature(secret, oldTs, nonce, body, sig)).toBe(false)
  })
})
