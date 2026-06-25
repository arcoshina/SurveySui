import type { SuiClient, CoinStruct } from '@mysten/sui/client'

/**
 * 共用挑幣邏輯：從可用 coin 中過濾未鎖定且餘額足夠者，依餘額由大到小取首。
 * 以 isLocked 注入鎖定判斷，避免依賴 store 實例（this）。
 */
export function pickCoin(
  coins: CoinStruct[],
  isLocked: (coinObjectId: string, now: number) => boolean,
  minBalanceMist: bigint,
  now: number
): CoinStruct | null {
  const eligible = coins
    .filter((c) => !isLocked(c.coinObjectId, now))
    .filter((c) => BigInt(c.balance) >= minBalanceMist)
    .sort((a, b) => {
      const balA = BigInt(a.balance)
      const balB = BigInt(b.balance)
      return balA > balB ? -1 : balA < balB ? 1 : 0
    })
  return eligible[0] ?? null
}

/**
 * 共用分頁抓取：列出 owner 名下所有 SUI coin。不含快取（快取由各 store 自理）。
 */
export async function fetchSuiCoins(suiClient: SuiClient, owner: string): Promise<CoinStruct[]> {
  const all: CoinStruct[] = []
  let cursor: string | null | undefined = undefined
  do {
    const res = await suiClient.getCoins({ owner, coinType: '0x2::sui::SUI', cursor })
    all.push(...res.data)
    cursor = res.hasNextPage ? res.nextCursor : null
  } while (cursor)
  return all
}
