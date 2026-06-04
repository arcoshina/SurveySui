import { describe, it, expect, afterEach } from 'vitest'
import { getIssuerSalt } from '../src/config.js'

describe('getIssuerSalt — nullifier pepper guard', () => {
  afterEach(() => {
    delete process.env.SURVEY_PASS_ISSUER_SALT
  })

  it('throws when the env var is unset (no silent fallback)', () => {
    delete process.env.SURVEY_PASS_ISSUER_SALT
    expect(() => getIssuerSalt()).toThrow(/SURVEY_PASS_ISSUER_SALT is not set/)
  })

  it('throws when the env var is empty / whitespace', () => {
    process.env.SURVEY_PASS_ISSUER_SALT = '   '
    expect(() => getIssuerSalt()).toThrow(/not set/)
  })

  it('throws on the placeholder value "default_salt"', () => {
    process.env.SURVEY_PASS_ISSUER_SALT = 'default_salt'
    expect(() => getIssuerSalt()).toThrow(/default_salt/)
  })

  it('throws when the salt is too short (< 12 chars)', () => {
    process.env.SURVEY_PASS_ISSUER_SALT = 'short'
    expect(() => getIssuerSalt()).toThrow(/too short/)
  })

  it('returns the salt when a strong value is set', () => {
    process.env.SURVEY_PASS_ISSUER_SALT = 'dev_salt_surveysui_v2'
    expect(getIssuerSalt()).toBe('dev_salt_surveysui_v2')
  })
})
