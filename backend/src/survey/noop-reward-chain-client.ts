import type { RewardChainClient, RewardClaimParams, RewardClaimResult } from './reward-chain-client.js'

export class NoOpRewardChainClient implements RewardChainClient {
  async claim(_params: RewardClaimParams): Promise<RewardClaimResult> {
    return { txDigest: '0xnoop-claim-tx' }
  }
}
