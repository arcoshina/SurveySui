import { afterEach, describe, expect, it, vi } from 'vitest'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { AdminKeyError, loadAndVerifyAdminKey } from '../src/admin-key.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('test_missing_admin_key_aborts_startup', () => {
  it('throws AdminKeyError when SUI_ADMIN_PRIVATE_KEY is absent', () => {
    vi.stubEnv('SUI_ADMIN_PRIVATE_KEY', '')
    vi.stubEnv('SUI_ADMIN_ADDRESS', '0xtest')

    expect(() => loadAndVerifyAdminKey()).toThrow(AdminKeyError)
    expect(() => loadAndVerifyAdminKey()).toThrow('SUI_ADMIN_PRIVATE_KEY')
  })

  it('throws AdminKeyError when SUI_ADMIN_ADDRESS is absent', () => {
    const kp = Ed25519Keypair.generate()
    vi.stubEnv('SUI_ADMIN_PRIVATE_KEY', kp.getSecretKey())
    vi.stubEnv('SUI_ADMIN_ADDRESS', '')

    expect(() => loadAndVerifyAdminKey()).toThrow(AdminKeyError)
    expect(() => loadAndVerifyAdminKey()).toThrow('SUI_ADMIN_ADDRESS')
  })
})

describe('test_admin_address_mismatch_aborts_startup', () => {
  it('throws AdminKeyError when derived address does not match SUI_ADMIN_ADDRESS', () => {
    const kp = Ed25519Keypair.generate()
    vi.stubEnv('SUI_ADMIN_PRIVATE_KEY', kp.getSecretKey())
    vi.stubEnv(
      'SUI_ADMIN_ADDRESS',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    )

    expect(() => loadAndVerifyAdminKey()).toThrow(AdminKeyError)
    expect(() => loadAndVerifyAdminKey()).toThrow(/mismatch/)
  })

  it('succeeds and returns keypair and address when key and address match', () => {
    const kp = Ed25519Keypair.generate()
    const address = kp.getPublicKey().toSuiAddress()
    vi.stubEnv('SUI_ADMIN_PRIVATE_KEY', kp.getSecretKey())
    vi.stubEnv('SUI_ADMIN_ADDRESS', address)

    const result = loadAndVerifyAdminKey()
    expect(result.address).toBe(address)
  })
})
