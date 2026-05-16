export interface SurveyRegisterResult {
  txDigest: string
}

export interface SurveyChainClient {
  register(params: {
    contentHash: string
    creatorAddress: string
  }): Promise<SurveyRegisterResult>
}
