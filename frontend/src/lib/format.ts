/**
 * Formats a base unit amount of SSR (with 9 decimals) into a string with 3 decimal places.
 * Uses exact BigInt math to round to the nearest multiple of 1,000,000 base units (10^-3 SSR)
 * to avoid floating-point inaccuracies.
 *
 * If the value is greater than 0 but less than 0.001 SSR (1,000,000 base units), it returns "< 0.001".
 * If the value is less than 0 but greater than -0.001 SSR, it returns "> -0.001".
 *
 * Examples:
 *   1_000_000_001n -> "1.000"
 *   999_999_999n   -> "1.000"
 *   123_456_789_012n -> "123.457"
 *   500_000n       -> "< 0.001"
 *   -500_000n      -> "> -0.001"
 */
export function formatSsr(base: bigint | number | string): string {
  const val = BigInt(base)
  if (val === 0n) return '0.000'

  const limit = 1000000n // 0.001 SSR
  if (val > 0n && val < limit) {
    return '< 0.001'
  }
  if (val < 0n && val > -limit) {
    return '> -0.001'
  }

  const decimalsToRound = 1000000n
  const half = decimalsToRound / 2n

  let rounded: bigint
  if (val >= 0n) {
    rounded = ((val + half) / decimalsToRound) * decimalsToRound
  } else {
    rounded = ((val - half) / decimalsToRound) * decimalsToRound
  }

  const isNegative = rounded < 0n
  const absRounded = isNegative ? -rounded : rounded
  const str = absRounded.toString()

  let formatted: string
  if (str.length <= 9) {
    const padded = str.padStart(10, '0')
    const integerPart = padded.slice(0, 1)
    const fractionalPart = padded.slice(1, 4)
    formatted = `${integerPart}.${fractionalPart}`
  } else {
    const integerPart = str.slice(0, str.length - 9)
    const fractionalPart = str.slice(str.length - 9, str.length - 6)
    formatted = `${integerPart}.${fractionalPart}`
  }

  return isNegative ? `-${formatted}` : formatted
}

/**
 * Formats a base unit amount of SUI (with 9 decimals, i.e., Mist) into a string with 3 decimal places.
 * Uses exact BigInt math to round to the nearest multiple of 1,000,000 base units (10^-3 SUI).
 * 
 * If the value is greater than 0 but less than 0.001 SUI (1,000,000 Mist), it returns "< 0.001".
 * If the value is less than 0 but greater than -0.001 SUI, it returns "> -0.001".
 */
export function formatSui(mist: bigint | number | string): string {
  return formatSsr(mist)
}

/**
 * Formats a base unit amount (SUI/SSR, 9 decimals) into a string showing the full precision,
 * stripping trailing zeros in the fractional part, but keeping at least 1 decimal if it's fractional.
 */
export function formatFullPrecision(base: bigint | number | string): string {
  const val = BigInt(base)
  if (val === 0n) return '0.0'

  const isNegative = val < 0n
  const absVal = isNegative ? -val : val
  const str = absVal.toString()

  let formatted: string
  if (str.length <= 9) {
    const padded = str.padStart(10, '0')
    const integerPart = padded.slice(0, 1)
    const fractionalPart = padded.slice(1)
    const trimmedFraction = fractionalPart.replace(/0+$/, '')
    formatted = trimmedFraction.length > 0 ? `${integerPart}.${trimmedFraction}` : `${integerPart}.0`
  } else {
    const integerPart = str.slice(0, str.length - 9)
    const fractionalPart = str.slice(str.length - 9)
    const trimmedFraction = fractionalPart.replace(/0+$/, '')
    formatted = trimmedFraction.length > 0 ? `${integerPart}.${trimmedFraction}` : `${integerPart}.0`
  }

  return isNegative ? `-${formatted}` : formatted
}
