export interface SbtIssueResult {
  objectId: string
  serial: bigint
}

export interface SbtChainClient {
  issue(params: {
    suiAddress: string
    subHash: string
    ttlMs: number
  }): Promise<SbtIssueResult>

  reissue(params: {
    oldObjectId: string
    suiAddress: string
    subHash: string
    ttlMs: number
  }): Promise<SbtIssueResult>

  revoke(params: { objectId: string }): Promise<void>
}
