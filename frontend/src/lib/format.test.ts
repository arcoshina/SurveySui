import { describe, expect, it } from 'vitest'
import {
  formatFullPrecision,
  formatSsr,
  formatSsrFullPrecision,
  formatSui,
  formatSuiFullPrecision,
} from './format'

describe('formatSsr (6 decimals, 3 display decimals)', () => {
  it('should format 0 to 0.000', () => {
    expect(formatSsr(0n)).toBe('0.000')
    expect(formatSsr(0)).toBe('0.000')
  })

  it('should show < 0.001 for positive values below 0.001 (1_000 base units)', () => {
    expect(formatSsr(1n)).toBe('< 0.001')
    expect(formatSsr(500n)).toBe('< 0.001')
    expect(formatSsr(999n)).toBe('< 0.001')
  })

  it('should show > -0.001 for negative values above -0.001', () => {
    expect(formatSsr(-1n)).toBe('> -0.001')
    expect(formatSsr(-500n)).toBe('> -0.001')
    expect(formatSsr(-999n)).toBe('> -0.001')
  })

  it('should round and format values >= 0.001', () => {
    expect(formatSsr(1_000n)).toBe('0.001')
    expect(formatSsr(1_499n)).toBe('0.001')
    expect(formatSsr(1_500n)).toBe('0.002')
    expect(formatSsr(999_999n)).toBe('1.000')
    expect(formatSsr(1_234_567n)).toBe('1.235')
  })

  it('should round and format negative values <= -0.001', () => {
    expect(formatSsr(-1_000n)).toBe('-0.001')
    expect(formatSsr(-1_499n)).toBe('-0.001')
    expect(formatSsr(-1_500n)).toBe('-0.002')
    expect(formatSsr(-999_999n)).toBe('-1.000')
    expect(formatSsr(-1_234_567n)).toBe('-1.235')
  })
})

describe('formatSui (9 decimals, 3 display decimals)', () => {
  it('should format 0 to 0.000', () => {
    expect(formatSui(0n)).toBe('0.000')
  })

  it('should show < 0.001 for positive values below 0.001 (1_000_000 Mist)', () => {
    expect(formatSui(1n)).toBe('< 0.001')
    expect(formatSui(999_999n)).toBe('< 0.001')
  })

  it('should show > -0.001 for negative values above -0.001', () => {
    expect(formatSui(-1n)).toBe('> -0.001')
  })

  it('should round and format values >= 0.001 SUI', () => {
    expect(formatSui(1_000_000n)).toBe('0.001')
    expect(formatSui(1_234_567_890n)).toBe('1.235')
  })
})

describe('formatSsrFullPrecision', () => {
  it('should format 0 to 0.0', () => {
    expect(formatSsrFullPrecision(0n)).toBe('0.0')
  })

  it('should strip trailing zeros but keep at least one decimal place', () => {
    expect(formatSsrFullPrecision(1_000_000n)).toBe('1.0')
    expect(formatSsrFullPrecision(1_500_000n)).toBe('1.5')
    expect(formatSsrFullPrecision(123_450_000n)).toBe('123.45')
  })

  it('should show full precision when trailing digits are non-zero', () => {
    expect(formatSsrFullPrecision(1_000_001n)).toBe('1.000001')
    expect(formatSsrFullPrecision(123_456n)).toBe('0.123456')
    expect(formatSsrFullPrecision(1n)).toBe('0.000001')
  })
})

describe('formatSuiFullPrecision', () => {
  it('should handle 9-decimal SUI values', () => {
    expect(formatSuiFullPrecision(1_000_000_000n)).toBe('1.0')
    expect(formatSuiFullPrecision(1_000_000_001n)).toBe('1.000000001')
  })
})

describe('formatFullPrecision (SSR alias)', () => {
  it('delegates to SSR 6-decimal formatting', () => {
    expect(formatFullPrecision(1_000_000n)).toBe('1.0')
    expect(formatFullPrecision(-1_000_001n)).toBe('-1.000001')
  })
})
