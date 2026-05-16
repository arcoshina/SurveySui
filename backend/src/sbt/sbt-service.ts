import { prisma } from '../db.js'
import type { SbtChainClient } from './chain-client.js'

export const TTL_MS = 180 * 24 * 60 * 60 * 1000
export const REISSUE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000

export type SbtAction = 'issued' | 'reissued' | 'skipped'

export interface HandleLoginSbtResult {
  action: SbtAction
  sbtObjectId?: string
}

export class SbtService {
  constructor(private readonly chainClient: SbtChainClient) {}

  async handleLoginSbt(params: {
    subHash: string
    suiAddress: string
    now?: Date
  }): Promise<HandleLoginSbtResult> {
    const now = params.now ?? new Date()

    const activeSbt = await prisma.participantSbt.findFirst({
      where: { subHash: params.subHash, status: 'ACTIVE' },
    })

    if (!activeSbt) {
      return await this.issueSbt(params.subHash, params.suiAddress, now)
    }

    const msToExpiry = activeSbt.expiresAt.getTime() - now.getTime()
    if (msToExpiry < REISSUE_THRESHOLD_MS) {
      return await this.reissueSbt(activeSbt, params.subHash, params.suiAddress, now)
    }

    return { action: 'skipped', sbtObjectId: activeSbt.sbtObjectId }
  }

  async adminRevoke(sbtObjectId: string): Promise<void> {
    await this.chainClient.revoke({ objectId: sbtObjectId })
    await prisma.participantSbt.update({
      where: { sbtObjectId },
      data: { status: 'REVOKED' },
    })
  }

  async adminReissue(sbtObjectId: string): Promise<{ sbtObjectId: string }> {
    const existing = await prisma.participantSbt.findUniqueOrThrow({
      where: { sbtObjectId },
    })
    const now = new Date()
    const result = await this.chainClient.reissue({
      oldObjectId: sbtObjectId,
      suiAddress: existing.suiAddress,
      subHash: existing.subHash,
      ttlMs: TTL_MS,
    })
    await prisma.$transaction(async (tx) => {
      await tx.participantSbt.update({
        where: { id: existing.id },
        data: { status: 'SUPERSEDED' },
      })
      await tx.participantSbt.create({
        data: {
          subHash: existing.subHash,
          serial: result.serial,
          suiAddress: existing.suiAddress,
          sbtObjectId: result.objectId,
          issuedAt: now,
          expiresAt: new Date(now.getTime() + TTL_MS),
          status: 'ACTIVE',
          supersedeOfId: existing.id,
        },
      })
    })
    return { sbtObjectId: result.objectId }
  }

  async scanNearExpiry(now?: Date): Promise<void> {
    const ref = now ?? new Date()
    const threshold = new Date(ref.getTime() + REISSUE_THRESHOLD_MS)
    const nearExpiry = await prisma.participantSbt.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: threshold } },
    })
    for (const sbt of nearExpiry) {
      console.log(`[SBT] Near expiry: ${sbt.sbtObjectId} expires at ${sbt.expiresAt.toISOString()}`)
    }
  }

  private async issueSbt(
    subHash: string,
    suiAddress: string,
    now: Date,
  ): Promise<HandleLoginSbtResult> {
    const issuedAt = now
    const expiresAt = new Date(now.getTime() + TTL_MS)
    const result = await this.chainClient.issue({ suiAddress, subHash, ttlMs: TTL_MS })
    await prisma.participantSbt.create({
      data: {
        subHash,
        serial: result.serial,
        suiAddress,
        sbtObjectId: result.objectId,
        issuedAt,
        expiresAt,
        status: 'ACTIVE',
      },
    })
    return { action: 'issued', sbtObjectId: result.objectId }
  }

  private async reissueSbt(
    oldSbt: { id: string; sbtObjectId: string },
    subHash: string,
    suiAddress: string,
    now: Date,
  ): Promise<HandleLoginSbtResult> {
    const issuedAt = now
    const expiresAt = new Date(now.getTime() + TTL_MS)
    const result = await this.chainClient.reissue({
      oldObjectId: oldSbt.sbtObjectId,
      suiAddress,
      subHash,
      ttlMs: TTL_MS,
    })
    await prisma.$transaction(async (tx) => {
      await tx.participantSbt.update({
        where: { id: oldSbt.id },
        data: { status: 'SUPERSEDED' },
      })
      await tx.participantSbt.create({
        data: {
          subHash,
          serial: result.serial,
          suiAddress,
          sbtObjectId: result.objectId,
          issuedAt,
          expiresAt,
          status: 'ACTIVE',
          supersedeOfId: oldSbt.id,
        },
      })
    })
    return { action: 'reissued', sbtObjectId: result.objectId }
  }
}
