/**
 * Formats a base unit amount of SSR (with 9 decimals) into a string with 4 decimal places.
 * Uses exact BigInt math to round to the nearest multiple of 100,000 base units (10^-4 SSR)
 * to avoid floating-point inaccuracies.
 *
 * Examples:
 *   1_000_000_001n -> "1.0000"
 *   999_999_999n   -> "1.0000"
 *   123_456_789_012n -> "123.4568"
 *   50_000n        -> "0.0001"
 *   49_999n        -> "0.0000"
 */
export function formatSsr(base: bigint | number | string): string {
  const val = BigInt(base)
  const decimalsToRound = 100000n
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
    const fractionalPart = padded.slice(1, 5)
    formatted = `${integerPart}.${fractionalPart}`
  } else {
    const integerPart = str.slice(0, str.length - 9)
    const fractionalPart = str.slice(str.length - 9, str.length - 5)
    formatted = `${integerPart}.${fractionalPart}`
  }

  return isNegative ? `-${formatted}` : formatted
}
