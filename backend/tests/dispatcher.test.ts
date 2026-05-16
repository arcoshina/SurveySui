import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

import { RewardDispatcher, TransientError, DispatchError } from '../src/survey/reward-dispatcher.js'
import type { RewardChainClient, RewardClaimResult } from '../src/survey/reward-chain-client.js'

const prisma = new PrismaClient()

async function truncate(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "responses", "questions", "surveys", "participant_sbts", "users" RESTART IDENTITY CASCADE',
  )
}

async function seedSurvey(): Promise<{ id: string; vaultObjectId: string }> {
  const now = new Date()
  return prisma.survey.create({
    data: {
      creatorAddress: '0xcreator',
      vaultObjectId: `0xvault-${Date.now()}-${Math.random()}`,
      contentMd: '# Test',
      contentHash: 'abcd1234',
      perResponse: 1000000000n,
      maxResponses: 200,
      deadline: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    },
  })
}

async function seedUserAndSbt(opts: { subHash: string; suiAddress?: string }): Promise<{
  sbtObjectId: string
}> {
  const suiAddress = opts.suiAddress ?? '0xtest'
  const now = new Date()
  const serial = BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 100000))
  const sbtObjectId = `0xsbt-${opts.subHash}-${serial}`

  await prisma.user.upsert({
    where: { zkSubHash: opts.subHash },
    update: {},
    create: { zkSubHash: opts.subHash, suiAddress },
  })
  await prisma.participantSbt.create({
    data: {
      subHash: opts.subHash,
      serial,
      suiAddress,
      sbtObjectId,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    },
  })
  return { sbtObjectId }
}

async function seedResponse(opts: {
  surveyId: string
  subHash: string
  suiAddress?: string
}): Promise<{ id: string; contentHash: string }> {
  const row = await prisma.response.create({
    data: {
      surveyId: opts.surveyId,
      subHash: opts.subHash,
      suiAddress: opts.suiAddress ?? '0xtest',
      answersJson: { q1: 'answer' },
      contentHash: `hash-${opts.subHash}-${Date.now()}`,
    },
  })
  return { id: row.id, contentHash: row.contentHash }
}

function makeDispatcher(
  client: RewardChainClient,
  maxRetries = 0,
): RewardDispatcher {
  return new RewardDispatcher(client, maxRetries, 0)
}

beforeEach(async () => {
  await truncate()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// ─── test_dispatcher_signs_and_submits ────────────────────────────────────────

describe('test_dispatcher_signs_and_submits', () => {
  it('呼叫 chain client 並將 txDigest 寫回 DB', async () => {
    const survey = await seedSurvey()
    const { sbtObjectId } = await seedUserAndSbt({ subHash: 'sub-dispatch-1' })
    const resp = await seedResponse({ surveyId: survey.id, subHash: 'sub-dispatch-1' })

    const claimMock = vi.fn<[], Promise<RewardClaimResult>>().mockResolvedValue({
      txDigest: '0xtest-claim-tx',
    })
    const client: RewardChainClient = { claim: claimMock }
    const dispatcher = makeDispatcher(client)

    const result = await dispatcher.dispatch({
      responseId: resp.id,
      vaultObjectId: survey.vaultObjectId,
      sbtObjectId,
      recipientAddress: '0xtest',
      subHash: 'sub-dispatch-1',
      contentHash: resp.contentHash,
    })

    expect(result.txDigest).toBe('0xtest-claim-tx')
    expect(claimMock).toHaveBeenCalledOnce()
    expect(claimMock).toHaveBeenCalledWith({
      vaultObjectId: survey.vaultObjectId,
      sbtObjectId,
      recipientAddress: '0xtest',
      subHash: 'sub-dispatch-1',
      contentHash: resp.contentHash,
    })

    const stored = await prisma.response.findUnique({ where: { id: resp.id } })
    expect(stored?.claimedTx).toBe('0xtest-claim-tx')
  })
})

// ─── test_concurrent_claims_serialized ────────────────────────────────────────

describe('test_concurrent_claims_serialized', () => {
  it('100 個並發 dispatch 不超過 1 個同時執行 chain call', async () => {
    const N = 100
    const survey = await seedSurvey()

    const responseIds: string[] = []
    for (let i = 0; i < N; i++) {
      const subHash = `sub-concurrent-${i}`
      await seedUserAndSbt({ subHash, suiAddress: `0xaddr${i}` })
      const resp = await seedResponse({ surveyId: survey.id, subHash })
      responseIds.push(resp.id)
    }

    let concurrent = 0
    let maxConcurrent = 0
    const client: RewardChainClient = {
      async claim(): Promise<RewardClaimResult> {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 1))
        concurrent--
        return { txDigest: `0x${Math.random().toString(16).slice(2)}` }
      },
    }

    const dispatcher = makeDispatcher(client)

    await Promise.all(
      responseIds.map((responseId, i) =>
        dispatcher.dispatch({
          responseId,
          vaultObjectId: survey.vaultObjectId,
          sbtObjectId: `0xsbt-concurrent-${i}`,
          recipientAddress: `0xaddr${i}`,
          subHash: `sub-concurrent-${i}`,
          contentHash: `hash-${i}`,
        }),
      ),
    )

    expect(maxConcurrent).toBe(1)

    const rows = await prisma.response.findMany({
      where: { surveyId: survey.id },
    })
    expect(rows.every((r) => r.claimedTx !== null)).toBe(true)
  })
})

// ─── test_chain_failure_rolls_back_db ─────────────────────────────────────────

describe('test_chain_failure_rolls_back_db', () => {
  it('chain call 失敗（非 transient）後 response 從 DB 刪除', async () => {
    const survey = await seedSurvey()
    const { sbtObjectId } = await seedUserAndSbt({ subHash: 'sub-rollback-1' })
    const resp = await seedResponse({ surveyId: survey.id, subHash: 'sub-rollback-1' })

    const client: RewardChainClient = {
      async claim(): Promise<RewardClaimResult> {
        throw new Error('permanent chain error')
      },
    }
    const dispatcher = makeDispatcher(client, 0)

    await expect(
      dispatcher.dispatch({
        responseId: resp.id,
        vaultObjectId: survey.vaultObjectId,
        sbtObjectId,
        recipientAddress: '0xtest',
        subHash: 'sub-rollback-1',
        contentHash: resp.contentHash,
      }),
    ).rejects.toBeInstanceOf(DispatchError)

    const stored = await prisma.response.findUnique({ where: { id: resp.id } })
    expect(stored).toBeNull()
  })
})

// ─── test_retry_on_transient_error ────────────────────────────────────────────

describe('test_retry_on_transient_error', () => {
  it('transient error 重試後成功，寫回 claimedTx', async () => {
    const survey = await seedSurvey()
    const { sbtObjectId } = await seedUserAndSbt({ subHash: 'sub-retry-1' })
    const resp = await seedResponse({ surveyId: survey.id, subHash: 'sub-retry-1' })

    let callCount = 0
    const client: RewardChainClient = {
      async claim(): Promise<RewardClaimResult> {
        callCount++
        if (callCount < 3) {
          throw new TransientError('network timeout')
        }
        return { txDigest: '0xretried-tx' }
      },
    }
    const dispatcher = new RewardDispatcher(client, 3, 0)

    const result = await dispatcher.dispatch({
      responseId: resp.id,
      vaultObjectId: survey.vaultObjectId,
      sbtObjectId,
      recipientAddress: '0xtest',
      subHash: 'sub-retry-1',
      contentHash: resp.contentHash,
    })

    expect(callCount).toBe(3)
    expect(result.txDigest).toBe('0xretried-tx')

    const stored = await prisma.response.findUnique({ where: { id: resp.id } })
    expect(stored?.claimedTx).toBe('0xretried-tx')
  })

  it('超過最大重試次數後拋出 DispatchError 並刪除 response', async () => {
    const survey = await seedSurvey()
    const { sbtObjectId } = await seedUserAndSbt({ subHash: 'sub-retry-2' })
    const resp = await seedResponse({ surveyId: survey.id, subHash: 'sub-retry-2' })

    const client: RewardChainClient = {
      async claim(): Promise<RewardClaimResult> {
        throw new TransientError('always fails')
      },
    }
    const dispatcher = new RewardDispatcher(client, 2, 0)

    await expect(
      dispatcher.dispatch({
        responseId: resp.id,
        vaultObjectId: survey.vaultObjectId,
        sbtObjectId,
        recipientAddress: '0xtest',
        subHash: 'sub-retry-2',
        contentHash: resp.contentHash,
      }),
    ).rejects.toBeInstanceOf(DispatchError)

    const stored = await prisma.response.findUnique({ where: { id: resp.id } })
    expect(stored).toBeNull()
  })
})
