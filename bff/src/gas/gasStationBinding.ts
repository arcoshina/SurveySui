import type { Fetcher } from '@cloudflare/workers-types'

// §10：BFF → gas-station Worker 的傳輸層。
// 綁定 Service Binding（env.GAS_STATION）後走內部 RPC，免公網、低延遲；
// 未綁定時（local 模式 / 測試）回退到 global fetch，行為與舊版 GAS_STATION_URL 一致。

let _fetcher: Fetcher | null = null

export function setGasStationFetcher(f: Fetcher): void {
  _fetcher = f
}

/** 取得目前傳輸用的 fetch；預設回退 global fetch（維持 local 模式與測試相容）。 */
export function getGasStationFetch(): typeof fetch {
  if (_fetcher) return _fetcher.fetch.bind(_fetcher) as unknown as typeof fetch
  return fetch
}

/** 是否已綁定 Service Binding（決定 503 守衛是否還需要 GAS_STATION_URL）。 */
export function hasGasStationBinding(): boolean {
  return _fetcher !== null
}
