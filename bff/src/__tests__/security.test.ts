import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { assertSecureEnv } from '../security.js'

describe('S0.3 BFF 啟動權限檢查（INV-7）', () => {
  let savedAdminKey: string | undefined
  let savedIssuerKey: string | undefined

  beforeEach(() => {
    savedAdminKey = process.env.SUI_ADMIN_PRIVATE_KEY
    savedIssuerKey = process.env.SURVEY_PASS_ISSUER_PRIV
    delete process.env.SUI_ADMIN_PRIVATE_KEY
    delete process.env.SURVEY_PASS_ISSUER_PRIV
  })

  afterEach(() => {
    if (savedAdminKey !== undefined) process.env.SUI_ADMIN_PRIVATE_KEY = savedAdminKey
    else delete process.env.SUI_ADMIN_PRIVATE_KEY
    if (savedIssuerKey !== undefined) process.env.SURVEY_PASS_ISSUER_PRIV = savedIssuerKey
    else delete process.env.SURVEY_PASS_ISSUER_PRIV
    vi.restoreAllMocks()
  })

  it('test_bff_refuses_admin_tx_key', () => {
    process.env.SUI_ADMIN_PRIVATE_KEY = 'suiprivkeyfakeadminkey'
    expect(() => assertSecureEnv()).toThrow('BFF must not hold admin TX key')
  })

  it('test_bff_logs_ticket_only_when_issuer_key_present', () => {
    process.env.SURVEY_PASS_ISSUER_PRIV = 'someissuerkey'
    const spy = vi.spyOn(console, 'log')
    expect(() => assertSecureEnv()).not.toThrow()
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('ticket-only, cannot sign TX'))
  })

  it('test_bff_starts_clean_without_keys', () => {
    expect(() => assertSecureEnv()).not.toThrow()
  })
})
