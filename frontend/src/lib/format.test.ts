import { describe, expect, it } from 'vitest'
import { formatSsr, formatSui, formatFullPrecision } from './format'

describe('formatSsr (3 decimals with dynamic threshold)', () => {
  it('should format 0 to 0.000', () => {
    expect(formatSsr(0n)).toBe('0.000')
    expect(formatSsr(0)).toBe('0.000')
  })

  it('should show < 0.001 for positive values below 0.001 (1_000_000 base units)', () => {
    expect(formatSsr(1n)).toBe('< 0.001')
    expect(formatSsr(500_000n)).toBe('< 0.001')
    expect(formatSsr(999_999n)).toBe('< 0.001')
  })

  it('should show > -0.001 for negative values above -0.001 (-1_000_000 base units)', () => {
    expect(formatSsr(-1n)).toBe('> -0.001')
    expect(formatSsr(-500_000n)).toBe('> -0.001')
    expect(formatSsr(-999_999n)).toBe('> -0.001')
  })

  it('should round and format values >= 0.001', () => {
    expect(formatSsr(1_000_000n)).toBe('0.001')
    expect(formatSsr(1_499_999n)).toBe('0.001')
    expect(formatSsr(1_500_000n)).toBe('0.002')
    expect(formatSsr(999_999_999n)).toBe('1.000')
    expect(formatSsr(1_234_567_890n)).toBe('1.235')
  })

  it('should round and format negative values <= -0.001', () => {
    expect(formatSsr(-1_000_000n)).toBe('-0.001')
    expect(formatSsr(-1_499_999n)).toBe('-0.001')
    expect(formatSsr(-1_500_000n)).toBe('-0.002')
    expect(formatSsr(-999_999_999n)).toBe('-1.000')
    expect(formatSsr(-1_234_567_890n)).toBe('-1.235')
  })
})

describe('formatSui (3 decimals with dynamic threshold)', () => {
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

describe('formatFullPrecision', () => {
  it('should format 0 to 0.0', () => {
    expect(formatFullPrecision(0n)).toBe('0.0')
  })

  it('should strip trailing zeros but keep at least one decimal place', () => {
    expect(formatFullPrecision(1_000_000_000n)).toBe('1.0')
    expect(formatFullPrecision(1_500_000_000n)).toBe('1.5')
    expect(formatFullPrecision(123_450_000_000n)).toBe('123.45')
  })

  it('should show full precision when trailing digits are non-zero', () => {
    expect(formatFullPrecision(1_000_000_001n)).toBe('1.000000001')
    expect(formatFullPrecision(123_456_789n)).toBe('0.123456789')
    expect(formatFullPrecision(1n)).toBe('0.000000001')
  })

  it('should handle negative values correctly', () => {
    expect(formatFullPrecision(-1_000_000_000n)).toBe('-1.0')
    expect(formatFullPrecision(-1_000_000_001n)).toBe('-1.000000001')
  })
})
