import type { Transaction } from '@mysten/sui/transactions'

/** Canonical Sui address form: lowercase, 0x-prefixed, zero-padded to 64 hex chars. */
export function normalizeAddress(addr: string): string {
  let clean = addr.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}

/**
 * Decode a MoveCall argument that references a Pure input by index, returning its
 * raw bytes. Returns null for non-Input args, non-Pure inputs, or empty values.
 */
export function getPureBytes(tx: Transaction, arg: unknown): Uint8Array | null {
  if (!arg || typeof arg !== 'object') return null
  const a = arg as { $kind?: string; Input?: number }
  if (a.$kind === 'Input' && typeof a.Input === 'number') {
    const inputData = tx.getData().inputs[a.Input]
    if (inputData && inputData.$kind === 'Pure') {
      const pureVal = inputData.Pure
      if (pureVal) {
        if (typeof pureVal === 'object' && pureVal !== null && 'bytes' in pureVal) {
          const bytes = (pureVal as { bytes?: string }).bytes
          if (bytes) return new Uint8Array(Buffer.from(bytes, 'base64'))
        }
        if (typeof pureVal === 'string') return new Uint8Array(Buffer.from(pureVal, 'base64'))
        if (Array.isArray(pureVal)) return new Uint8Array(pureVal)
      }
    }
  }
  return null
}
