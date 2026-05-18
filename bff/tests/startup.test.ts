import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { assertSecureEnv } from '../src/security.js'

const FORBIDDEN = ['ADMIN_PRIVATE_KEY', 'SESSION_SECRET', 'DATABASE_URL'] as const

// ── test_bff_crashes_if_admin_key_present ─────────────────────────────────────

describe('test_bff_crashes_if_admin_key_present', () => {
  afterEach(() => {
    for (const key of FORBIDDEN) delete process.env[key]
  })

  it('ADMIN_PRIVATE_KEY 存在時拋出含變數名稱的錯誤', () => {
    process.env.ADMIN_PRIVATE_KEY = 'super-secret'
    expect(() => assertSecureEnv()).toThrow('ADMIN_PRIVATE_KEY')
  })

  it('SESSION_SECRET 存在時拋出含變數名稱的錯誤', () => {
    process.env.SESSION_SECRET = 'some-session-secret'
    expect(() => assertSecureEnv()).toThrow('SESSION_SECRET')
  })

  it('DATABASE_URL 存在時拋出含變數名稱的錯誤', () => {
    process.env.DATABASE_URL = 'postgres://localhost/surveysui'
    expect(() => assertSecureEnv()).toThrow('DATABASE_URL')
  })
})

// ── test_bff_starts_with_minimal_env ──────────────────────────────────────────

describe('test_bff_starts_with_minimal_env', () => {
  beforeEach(() => {
    for (const key of FORBIDDEN) delete process.env[key]
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
