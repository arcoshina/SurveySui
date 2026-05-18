import type { SbtChainClient, SbtIssueResult } from './chain-client.js'

let serial = 0n

/**
 * 開發期佔位實作，合約部署後替換為真實 chain client（T1.7 完成後）
 */
export class NoOpSbtChainClient implements SbtChainClient {
  async issue(): Promise<SbtIssueResult> {
    serial += 1n
    return { objectId: `0xnoop${serial}`, serial }
  }

  async reissue(): Promise<SbtIssueResult> {
    serial += 1n
    return { objectId: `0xnoop${serial}`, serial }
  }

  async revoke(): Promise<void> {}
}
