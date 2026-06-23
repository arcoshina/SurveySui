import type { DurableObjectStorage } from '@cloudflare/workers-types'
import { GAS_STATION_MAX_SKEW_MS } from '@surveysui/gas-station-core'

type StoredState = {
  // nonce -> expiresAt（毫秒）。過期後可安全清除：同窗口外的請求本就被 skew 檢查擋下。
  seen: Record<string, number>
}

/**
 * DO 端的 nonce 去重存儲：記錄已見過的 per-request nonce 以防重放。
 * 比照 DurableObjectCoinLockStore 的「載入→記憶體 map→變更時 persist→prune 過期」範本。
 */
export class DurableObjectNonceStore {
  private state: StoredState = { seen: {} }

  constructor(private readonly storage: DurableObjectStorage) {}

  async load(): Promise<void> {
    const stored = await this.storage.get<StoredState>('nonceState')
    if (stored) this.state = stored
  }

  async persist(): Promise<void> {
    await this.storage.put('nonceState', this.state)
  }

  /**
   * 消費一個 nonce：先清除過期項，若已見過回 false（重放），否則記錄並回 true。
   * 同步操作（不 persist），由呼叫端 await persist() 後再處理請求。
   */
  consume(nonce: string, timestampMs: number, now = Date.now()): boolean {
    this.pruneExpired(now)
    if (this.state.seen[nonce] !== undefined) return false
    this.state.seen[nonce] = timestampMs + GAS_STATION_MAX_SKEW_MS
    return true
  }

  private pruneExpired(now: number): void {
    for (const [nonce, expiresAt] of Object.entries(this.state.seen)) {
      if (expiresAt <= now) delete this.state.seen[nonce]
    }
  }
}
