export interface RewardClaimParams {
  vaultObjectId: string
  sbtObjectId: string
  recipientAddress: string
  subHash: string
  contentHash: string
}

export interface RewardClaimResult {
  txDigest: string
}

export interface RewardChainClient {
  claim(params: RewardClaimParams): Promise<RewardClaimResult>
}
