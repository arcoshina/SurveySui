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

export async function __resetPlatformSponsorLedger(): Promise<void> {
  const db = getDbClient()
  await db.execute(`DELETE FROM platform_sponsor_daily`)
  await db.execute(`DELETE FROM wallet_sponsor_rate`)
}
