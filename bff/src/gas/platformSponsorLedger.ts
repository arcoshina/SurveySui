import { todayUtcDate as coreTodayUtcDate } from '@surveysui/gas-station-core'
import { getDbClient } from '../security/db.js'
import { getPlatformSponsorStore } from './stores/sqlitePlatformSponsorStore.js'

export function platformSponsorDailyLimit(): number {
  return getPlatformSponsorStore().getDailyLimit()
}

export const todayUtcDate = coreTodayUtcDate

export async function getPlatformSponsorCount(
  senderAddress: string,
  day: string = todayUtcDate()
): Promise<number> {
  return getPlatformSponsorStore().getCount(senderAddress, day)
}

export async function incrementPlatformSponsorCount(
  senderAddress: string,
  day: string = todayUtcDate()
): Promise<number> {
  return getPlatformSponsorStore().increment(senderAddress, day)
}

export async function tryIncrementPlatformSponsorCount(
  senderAddress: string,
  day: string = todayUtcDate()
): Promise<{ ok: boolean; count: number }> {
  const limit = platformSponsorDailyLimit()
  return getPlatformSponsorStore().tryIncrement(senderAddress, day, limit)
}

export async function __resetPlatformSponsorLedger(): Promise<void> {
  const db = getDbClient()
  await db.execute(`DELETE FROM platform_sponsor_daily`)
  await db.execute(`DELETE FROM wallet_sponsor_rate`)
  await db.execute(`DELETE FROM pass_sponsor_reservation`)
  await db.execute(`DELETE FROM realtime_ticket_slot`)
  await db.execute(`DELETE FROM pass_sponsor_onchain_cache`)
}
