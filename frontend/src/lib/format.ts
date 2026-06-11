/** SSR coin decimals (matches on-chain `DECIMALS`). */
export const SSR_DECIMALS = 6
export const SSR_BASE_PER_UNIT = 10n ** BigInt(SSR_DECIMALS)

/** SUI uses 9 decimals (MIST). */
export const SUI_DECIMALS = 9
export const SUI_BASE_PER_UNIT = 10n ** BigInt(SUI_DECIMALS)

function formatCoinBase(
  base: bigint,
  decimals: number,
  displayDecimals: number,
): string {
  if (base === 0n) return `0.${'0'.repeat(displayDecimals)}`

  const roundUnit = 10n ** BigInt(decimals - displayDecimals)
  const limit = roundUnit

  if (base > 0n && base < limit) {
    return `< 0.${'0'.repeat(displayDecimals - 1)}1`
  }
  if (base < 0n && base > -limit) {
    return `> -0.${'0'.repeat(displayDecimals - 1)}1`
  }

  const half = roundUnit / 2n
  const rounded = base >= 0n
    ? ((base + half) / roundUnit) * roundUnit
    : ((base - half) / roundUnit) * roundUnit

  const isNegative = rounded < 0n
  const absRounded = isNegative ? -rounded : rounded
  const str = absRounded.toString()
  const padLen = decimals + 1

  let formatted: string
  if (str.length <= decimals) {
    const padded = str.padStart(padLen, '0')
    const integerPart = padded.slice(0, padded.length - decimals)
    const fractionalPart = padded.slice(padded.length - decimals, padded.length - decimals + displayDecimals)
    formatted = `${integerPart}.${fractionalPart}`
  } else {
    const integerPart = str.slice(0, str.length - decimals)
    const fractionalPart = str.slice(str.length - decimals, str.length - decimals + displayDecimals)
    formatted = `${integerPart}.${fractionalPart}`
  }

  return isNegative ? `-${formatted}` : formatted
}

/**
 * Formats SSR base units (6 decimals) to 3 decimal places.
 */
export function formatSsr(base: bigint | number | string): string {
  return formatCoinBase(BigInt(base), SSR_DECIMALS, 3)
}

/**
 * Formats SUI base units / MIST (9 decimals) to 3 decimal places.
 */
export function formatSui(mist: bigint | number | string): string {
  return formatCoinBase(BigInt(mist), SUI_DECIMALS, 3)
}

function formatFullPrecisionCoin(base: bigint, decimals: number): string {
  if (base === 0n) return '0.0'

  const isNegative = base < 0n
  const absVal = isNegative ? -base : base
  const str = absVal.toString()

  let formatted: string
  if (str.length <= decimals) {
    const padded = str.padStart(decimals + 1, '0')
    const integerPart = padded.slice(0, padded.length - decimals)
    const fractionalPart = padded.slice(padded.length - decimals)
    const trimmedFraction = fractionalPart.replace(/0+$/, '')
    formatted = trimmedFraction.length > 0 ? `${integerPart}.${trimmedFraction}` : `${integerPart}.0`
  } else {
    const integerPart = str.slice(0, str.length - decimals)
    const fractionalPart = str.slice(str.length - decimals)
    const trimmedFraction = fractionalPart.replace(/0+$/, '')
    formatted = trimmedFraction.length > 0 ? `${integerPart}.${trimmedFraction}` : `${integerPart}.0`
  }

  return isNegative ? `-${formatted}` : formatted
}

/** Full-precision SSR display. */
export function formatSsrFullPrecision(base: bigint | number | string): string {
  return formatFullPrecisionCoin(BigInt(base), SSR_DECIMALS)
}

/** Full-precision SUI display. */
export function formatSuiFullPrecision(mist: bigint | number | string): string {
  return formatFullPrecisionCoin(BigInt(mist), SUI_DECIMALS)
}

/** @deprecated Use formatSsrFullPrecision or formatSuiFullPrecision explicitly. */
export function formatFullPrecision(base: bigint | number | string): string {
  return formatSsrFullPrecision(base)
}

/**
 * Formats a raw integer (like response counts, no decimals) compactly (e.g., 1.5K, 2M).
 */
export function formatCompactInt(val: number | bigint | string): string {
  const num = Number(val)
  if (isNaN(num)) return '0'
  const isNegative = num < 0
  const absNum = Math.abs(num)

  if (absNum < 1000) {
    return String(num)
  }

  const suffixes = [
    { value: 1e9, symbol: 'B' },
    { value: 1e6, symbol: 'M' },
    { value: 1e3, symbol: 'K' },
  ]

  for (const { value, symbol } of suffixes) {
    if (absNum >= value) {
      const formatted = (absNum / value).toFixed(1)
      const cleanFormatted = formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted
      const prefix = isNegative ? '-' : ''
      return `${prefix}${cleanFormatted}${symbol}`
    }
  }

  return String(num)
}

function formatCompactCoinBase(
  base: bigint,
  basePerUnit: bigint,
  small: (v: bigint) => string,
): string {
  const isNegative = base < 0n
  const absVal = isNegative ? -base : base

  if (absVal < 1000n * basePerUnit) {
    return small(base)
  }

  const humanVal = Number(absVal) / Number(basePerUnit)

  const suffixes = [
    { value: 1e9, symbol: 'B' },
    { value: 1e6, symbol: 'M' },
    { value: 1e3, symbol: 'K' },
  ]

  for (const { value, symbol } of suffixes) {
    if (humanVal >= value) {
      const formatted = (humanVal / value).toFixed(1)
      const cleanFormatted = formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted
      const prefix = isNegative ? '-' : ''
      return `${prefix}${cleanFormatted}${symbol}`
    }
  }

  return small(base)
}

/**
 * Formats SSR base units (6 decimals) compactly (e.g., 1.2K, 3.4M).
 */
export function formatCompactCoin(base: bigint | number | string): string {
  return formatCompactCoinBase(BigInt(base), SSR_BASE_PER_UNIT, formatSsr)
}

/**
 * Formats SUI base units / MIST (9 decimals) compactly (e.g., 1.2K, 3.4M).
 */
export function formatCompactSui(mist: bigint | number | string): string {
  return formatCompactCoinBase(BigInt(mist), SUI_BASE_PER_UNIT, formatSui)
}
