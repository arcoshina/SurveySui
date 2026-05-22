import { describe, it, expect } from 'vitest'
import { formatSsr } from '../format'

describe('S3.1 SSR format helper', () => {
  it('test_format_ssr_no_floating_artifact — format correct strings without floating point artifacts', () => {
    expect(formatSsr(1000000001n)).toBe('1.0000')
    expect(formatSsr(999999999n)).toBe('1.0000')
    expect(formatSsr(123456789012n)).toBe('123.4568')
    expect(formatSsr(50000n)).toBe('0.0001')
    expect(formatSsr(49999n)).toBe('0.0000')

    expect(formatSsr('1000000001')).toBe('1.0000')
    expect(formatSsr(999999999)).toBe('1.0000')
  })

  it('test_format_ssr_rounding_consistent_with_move — checks consistency with Move display_ssr rounding logic', () => {
    expect(formatSsr(0n)).toBe('0.0000')
    expect(formatSsr(100000n)).toBe('0.0001')
    expect(formatSsr(150000n)).toBe('0.0002')
    expect(formatSsr(149999n)).toBe('0.0001')
  })
})
