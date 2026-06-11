import { describe, it, expect, vi, beforeEach } from 'vitest'

const jwtVerify = vi.fn()

vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: (...args: unknown[]) => jwtVerify(...args),
}))

import { verifyGoogleIdToken, __resetGoogleJwksCache } from '../src/auth/idTokenVerify.js'

describe('verifyGoogleIdToken', () => {
  beforeEach(() => {
    jwtVerify.mockReset()
    __resetGoogleJwksCache()
  })

  it('returns email only when email_verified is true', async () => {
    jwtVerify.mockResolvedValue({
      payload: {
        sub: 'google-sub-1',
        email: 'alice@gmail.com',
        email_verified: true,
      },
    })

    const result = await verifyGoogleIdToken('valid.jwt', 'client-id')
    expect(result).toEqual({ sub: 'google-sub-1', email: 'alice@gmail.com' })
    expect(jwtVerify).toHaveBeenCalledWith(
      'valid.jwt',
      'mock-jwks',
      expect.objectContaining({ audience: 'client-id' })
    )
  })

  it('returns null email when email_verified is false', async () => {
    jwtVerify.mockResolvedValue({
      payload: {
        sub: 'google-sub-2',
        email: 'fake@gmail.com',
        email_verified: false,
      },
    })

    const result = await verifyGoogleIdToken('valid.jwt', 'client-id')
    expect(result).toEqual({ sub: 'google-sub-2', email: null })
  })

  it('rejects when jwtVerify throws (bad signature)', async () => {
    jwtVerify.mockRejectedValue(new Error('signature verification failed'))
    await expect(verifyGoogleIdToken('bad.jwt', 'client-id')).rejects.toThrow(
      'signature verification failed'
    )
  })

  it('rejects when sub is missing', async () => {
    jwtVerify.mockResolvedValue({ payload: { email_verified: true, email: 'a@b.com' } })
    await expect(verifyGoogleIdToken('jwt', 'client-id')).rejects.toThrow('missing sub')
  })
})
