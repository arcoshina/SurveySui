import { prisma } from '../db.js'
import type { RewardChainClient } from './reward-chain-client.js'

export class TransientError extends Error {
  readonly transient = true
  constructor(message: string) {
    super(message)
    this.name = 'TransientError'
  }
}

export class DispatchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DispatchError'
  }
}

export interface DispatchRewardParams {
  responseId: string
  vaultObjectId: string
  sbtObjectId: string
  recipientAddress: string
  subHash: string
  contentHash: string
}

export interface DispatchResult {
  txDigest: string
}

export class RewardDispatcher {
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly chainClient: RewardChainClient,
    private readonly maxRetries = 3,
    private readonly retryDelayMs = 100,
  ) {}

  dispatch(params: DispatchRewardParams): Promise<DispatchResult> {
    const task = (): Promise<DispatchResult> => this.executeWithRetry(params)
    const result: Promise<DispatchResult> = this.tail.then(task, task)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async executeWithRetry(params: DispatchRewardParams): Promise<DispatchResult> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const chainResult = await this.chainClient.claim({
          vaultObjectId: params.vaultObjectId,
          sbtObjectId: params.sbtObjectId,
          recipientAddress: params.recipientAddress,
          subHash: params.subHash,
          contentHash: params.contentHash,
        })
        await prisma.response.update({
          where: { id: params.responseId },
          data: { claimedTx: chainResult.txDigest },
        })
        return { txDigest: chainResult.txDigest }
      } catch (err) {
        lastError = err
        if (attempt < this.maxRetries && isTransientError(err)) {
          await sleep(this.retryDelayMs * (attempt + 1))
          continue
        }
        break
      }
    }
    await prisma.response.delete({ where: { id: params.responseId } })
    throw new DispatchError('chain_failure', 'Claim failed after retries', lastError)
  }
}

function isTransientError(err: unknown): boolean {
  return err instanceof TransientError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
