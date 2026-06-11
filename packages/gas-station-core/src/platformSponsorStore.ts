export interface PlatformSponsorStore {
  getDailyLimit(): number
  getCount(senderAddress: string, day: string): Promise<number>
  increment(senderAddress: string, day: string): Promise<number>
  tryIncrement?(
    senderAddress: string,
    day: string,
    limit: number
  ): Promise<{ ok: boolean; count: number }>
}

export function todayUtcDate(now = new Date()): string {
  return now.toISOString().split('T')[0]
}
