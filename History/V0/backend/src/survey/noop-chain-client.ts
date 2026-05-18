import type { SurveyChainClient, SurveyRegisterResult } from './chain-client.js'

/**
 * 開發期佔位實作，合約部署後替換為真實 chain client（T1.7 完成後）
 */
export class NoOpSurveyChainClient implements SurveyChainClient {
  async register(): Promise<SurveyRegisterResult> {
    return { txDigest: `0xnoop-survey-${Date.now()}` }
  }
}
