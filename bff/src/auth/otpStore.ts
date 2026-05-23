export interface OtpEntry {
  code: string
  expiresAt: number
}

export class MemoryOtpStore {
  private store = new Map<string, OtpEntry>()

  set(email: string, code: string, ttlMs: number = 600000): void {
    this.store.set(email.toLowerCase().trim(), {
      code,
      expiresAt: Date.now() + ttlMs,
    })
  }

  get(email: string): string | null {
    const entry = this.store.get(email.toLowerCase().trim())
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(email.toLowerCase().trim())
      return null
    }
    return entry.code
  }

  invalidate(email: string): void {
    this.store.delete(email.toLowerCase().trim())
  }

  clear(): void {
    this.store.clear()
  }
}

export const otpStore = new MemoryOtpStore()
