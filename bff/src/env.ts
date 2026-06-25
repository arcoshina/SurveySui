import type { D1Database, Fetcher } from '@cloudflare/workers-types'

/**
 * BFF Worker 執行期環境。
 *
 * 字串型設定（SUI_*、GAS_*、WORLDCOIN_*、OAuth、Resend…）在 `nodejs_compat` +
 * 近期 compatibility_date 下，會由 wrangler.toml `[vars]` 與 `wrangler secret` 自動
 * 注入 `process.env`，故既有以 `process.env.X` 讀取的程式無須改動。此介面只列出
 * **無法經 process.env 取得的繫結（bindings）**：D1 與 gas-station Service Binding。
 */
export interface BffEnv {
  /** D1：撤銷名單、即時票券槽、代付額度快取/預留、rate-limit、平台日額度。 */
  DB: D1Database
  /** Service Binding → surveysui-gas-station Worker（§10 串接後取代 GAS_STATION_URL）。 */
  GAS_STATION?: Fetcher
  /** 其餘字串設定一律經 process.env 取用（nodejs_compat 注入）。 */
  [key: string]: unknown
}
