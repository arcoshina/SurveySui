export interface WalletRateLimitResult {
  allowed: boolean
  retryAfterMs?: number
  count?: number
}

export interface WalletSponsorRateLimitStore {
  checkAndIncrement(
    senderAddress: string,
    maxPerWindow: number,
    windowMs: number,
    now?: number
  ): Promise<WalletRateLimitResult>
}
