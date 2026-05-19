import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { assertSecureEnv } from '../src/security.js'

// ── test_bff_crashes_if_admin_key_present ─────────────────────────────────────
// V2 改版：只禁止 SUI_ADMIN_PRIVATE_KEY（INV-7）

describe('test_bff_crashes_if_admin_key_present', () => {
  afterEach(() => {
    delete process.env.SUI_ADMIN_PRIVATE_KEY
    vi.restoreAllMocks()
  })

  it('SUI_ADMIN_PRIVATE_KEY 存在時拋出 INV-7 錯誤', () => {
    process.env.SUI_ADMIN_PRIVATE_KEY = 'super-secret'
    expect(() => assertSecureEnv()).toThrow('BFF must not hold admin TX key')
  })

  it('SURVEY_PASS_ISSUER_PRIV 存在時 log 不拋出', () => {
    process.env.SURVEY_PASS_ISSUER_PRIV = 'issuer-key'
    const spy = vi.spyOn(console, 'log')
    expect(() => assertSecureEnv()).not.toThrow()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('ticket-only, cannot sign TX'))
    delete process.env.SURVEY_PASS_ISSUER_PRIV
  })
})

// ── test_bff_starts_with_minimal_env ──────────────────────────────────────────

describe('test_bff_starts_with_minimal_env', () => {
  beforeEach(() => {
    delete process.env.SUI_ADMIN_PRIVATE_KEY
    delete process.env.SURVEY_PASS_ISSUER_PRIV
  })

  it('無禁止變數時不拋出錯誤', () => {
    expect(() => assertSecureEnv()).not.toThrow()
  })

  it('只有 SUI_PACKAGE_ID 與 SUI_RPC_URL 不拋出錯誤', () => {
    process.env.SUI_PACKAGE_ID = '0xpkg'
    process.env.SUI_RPC_URL = 'https://fullnode.devnet.sui.io:443'
    expect(() => assertSecureEnv()).not.toThrow()
    delete process.env.SUI_PACKAGE_ID
    delete process.env.SUI_RPC_URL
  })
})
