import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'

export class EligibilityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'EligibilityError'
  }
}

export interface SubmitResponseParams {
  surveyId: string
  subHash: string
  suiAddress: string
  answersJson: unknown
  claimedTx?: string
  now?: Date
}

export interface SubmitResponseResult {
  id: string
  contentHash: string
  vaultObjectId: string
  sbtObjectId: string
}

export class ResponseService {
  async submit(params: SubmitResponseParams): Promise<SubmitResponseResult> {
    const now = params.now ?? new Date()

    const survey = await prisma.survey.findUnique({
      where: { id: params.surveyId },
      include: { _count: { select: { responses: true } } },
    })

    if (!survey) throw new EligibilityError('not_found', 'Survey not found')
    if (survey.status !== 'ACTIVE') throw new EligibilityError('survey_closed', 'Survey is closed')
    if (survey.deadline < now) throw new EligibilityError('survey_expired', 'Survey has expired')

    const sbt = await prisma.participantSbt.findFirst({
      where: { subHash: params.subHash },
      orderBy: { createdAt: 'desc' },
    })

    if (!sbt) throw new EligibilityError('no_sbt', 'No SBT found for this user')
    if (sbt.status !== 'ACTIVE' || sbt.expiresAt < now) {
      throw new EligibilityError('sbt_invalid', 'SBT is not valid (revoked, superseded, or expired)')
    }

    const existing = await prisma.response.findUnique({
      where: { surveyId_subHash: { surveyId: params.surveyId, subHash: params.subHash } },
    })
    if (existing) throw new EligibilityError('already_claimed', 'Already responded to this survey')

    if (survey._count.responses >= survey.maxResponses) {
      throw new EligibilityError('quota_exhausted', 'Survey quota exhausted')
    }

    const contentHash = computeResponseHash(params.surveyId, params.subHash, params.answersJson)

    const response = await prisma.response.create({
      data: {
        surveyId: params.surveyId,
        subHash: params.subHash,
        suiAddress: params.suiAddress,
        answersJson: params.answersJson as Prisma.InputJsonValue,
        contentHash,
        claimedTx: params.claimedTx || null,
      },
    })

    return {
      id: response.id,
      contentHash,
      vaultObjectId: survey.vaultObjectId,
      sbtObjectId: sbt.sbtObjectId,
    }
  }
}

export function computeResponseHash(
  surveyId: string,
  subHash: string,
  answersJson: unknown,
): string {
  const payload = JSON.stringify({ surveyId, subHash, answers: answersJson })
  return createHash('sha256').update(payload).digest('hex')
}
