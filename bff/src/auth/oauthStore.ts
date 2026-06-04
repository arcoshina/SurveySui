export interface OAuthStateEntry {
  verifier: string   // PKCE code_verifier（base64url random）
  provider: string
  owner: string      // Sui address of the connected wallet
  expiresAt: number
}

export class MemoryOAuthStore {
  private store = new Map<string, OAuthStateEntry>()
  private readonly ttlMs: number

  constructor(ttlMs = 600_000) {
    this.ttlMs = ttlMs
  }

  set(state: string, entry: Omit<OAuthStateEntry, 'expiresAt'>): void {
    this.store.set(state, { ...entry, expiresAt: Date.now() + this.ttlMs })
  }

  get(state: string): OAuthStateEntry | null {
    const entry = this.store.get(state)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(state)
      return null
    }
    return entry
  }

  invalidate(state: string): void {
    this.store.delete(state)
  }

  clear(): void {
    this.store.clear()
  }
}

export const oauthStore = new MemoryOAuthStore()
