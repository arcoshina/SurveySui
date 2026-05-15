import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { requireEnv, assertAllRequired } from './env.js'

const TEST_VAR = '__TEST_SURVEYSUI_VAR__'

describe('env utilities', () => {
  beforeEach(() => {
    delete process.env[TEST_VAR]
  })

  afterEach(() => {
    delete process.env[TEST_VAR]
  })

  it('test_env_loader_aborts_on_missing_required_var', () => {
    expect(() => assertAllRequired([TEST_VAR])).toThrowError(TEST_VAR)
  })

  it('test_requireEnv_throws_on_missing', () => {
    expect(() => requireEnv(TEST_VAR)).toThrowError(`Missing required env var: ${TEST_VAR}`)
  })

  it('test_requireEnv_returns_value_when_present', () => {
    process.env[TEST_VAR] = 'hello'
    expect(requireEnv(TEST_VAR)).toBe('hello')
  })

  it('assertAllRequired passes when all vars are set', () => {
    process.env[TEST_VAR] = 'value'
    expect(() => assertAllRequired([TEST_VAR])).not.toThrow()
  })

  it('assertAllRequired error message lists all missing vars', () => {
    const missing = [TEST_VAR, '__TEST_ANOTHER__']
    expect(() => assertAllRequired(missing)).toThrowError(
      /(__TEST_SURVEYSUI_VAR__|__TEST_ANOTHER__)/,
    )
  })
})
