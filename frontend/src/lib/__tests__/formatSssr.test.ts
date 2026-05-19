import { describe, it, expect } from 'vitest'
import { formatSssr } from '../format'

describe('S3.1 sSSR format helper', () => {
  it('test_format_sssr_no_floating_artifact — format correct strings without floating point artifacts', () => {
    expect(formatSssr(1000000001n)).toBe('1.0000')
    expect(formatSssr(999999999n)).toBe('1.0000')
    expect(formatSssr(123456789012n)).toBe('123.4568')
    expect(formatSssr(50000n)).toBe('0.0001')
    expect(formatSssr(49999n)).toBe('0.0000')
    
    expect(formatSssr('1000000001')).toBe('1.0000')
    expect(formatSssr(999999999)).toBe('1.0000')
  })

  it('test_format_sssr_rounding_consistent_with_move — checks consistency with Move display_sssr rounding logic', () => {
    expect(formatSssr(0n)).toBe('0.0000')
    expect(formatSssr(100000n)).toBe('0.0001')
    expect(formatSssr(150000n)).toBe('0.0002')
    expect(formatSssr(149999n)).toBe('0.0001')
  })
})
