import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'
import { parseSurveyMarkdown } from './markdown-parser.js'
import type { SurveyChainClient } from './chain-client.js'

export interface CreateSurveyParams {
  creatorAddress: string
  contentMd: string
  vaultObjectId: string
}

export interface CreateSurveyResult {
  id: string
  contentHash: string
  txDigest: string
}

export interface SurveyWithQuestions {
  id: string
  creatorAddress: string
  vaultObjectId: string
  contentMd: string
  contentHash: string
  perResponse: bigint
  maxResponses: number
  deadline: Date
  status: string
  createdAt: Date
  questions: Array<{
    id: string
    questionKey: string
    order: number
    type: string
    prompt: string
    optionsJson: unknown
    required: boolean
  }>
}

export interface QuestionStat {
  questionId: string
  questionKey: string
  type: string
  prompt: string
  distribution?: Record<string, number>
  average?: number
  answerCount?: number
}

export interface SurveyStats {
  surveyId: string
  responseCount: number
  maxResponses: number
  completionRate: number
  vaultBalance: string
  questions: QuestionStat[]
}

export class CloseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CloseError'
  }
}

export class SurveyService {
  constructor(private readonly chainClient: SurveyChainClient) {}

  async createSurvey(params: CreateSurveyParams): Promise<CreateSurveyResult> {
    const parsed = parseSurveyMarkdown(params.contentMd)

    const { txDigest } = await this.chainClient.register({
      contentHash: parsed.contentHash,
      creatorAddress: params.creatorAddress,
    })

    const survey = await prisma.$transaction(async (tx) => {
      const created = await tx.survey.create({
        data: {
          creatorAddress: params.creatorAddress,
          vaultObjectId: params.vaultObjectId,
          contentMd: parsed.contentMd,
          contentHash: parsed.contentHash,
          perResponse: parsed.metadata.perResponse,
          maxResponses: parsed.metadata.maxResponses,
          deadline: parsed.metadata.deadline,
          status: 'ACTIVE',
        },
      })

      await tx.question.createMany({
        data: parsed.questions.map((q, idx) => ({
          surveyId: created.id,
          questionKey: q.id,
          order: idx + 1,
          type: q.type,
          prompt: q.prompt,
          optionsJson: q.options !== undefined
            ? q.options
            : q.type === 'SCALE'
              ? ({ min: q.min, max: q.max } as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          required: q.required,
        })),
      })

      return created
    })

    return { id: survey.id, contentHash: parsed.contentHash, txDigest }
  }

  async getSurvey(id: string): Promise<SurveyWithQuestions | null> {
    const survey = await prisma.survey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
      },
    })
    return survey
  }

  async closeSurvey(id: string, creatorAddress: string): Promise<void> {
    const survey = await prisma.survey.findUnique({ where: { id } })
    if (!survey) throw new CloseError('not_found', 'Survey not found')
    if (survey.creatorAddress !== creatorAddress) throw new CloseError('forbidden', 'Not the creator')

    await prisma.survey.update({
      where: { id },
      data: { status: 'CLOSED' },
    })
  }

  async getStats(id: string): Promise<SurveyStats | null> {
    const survey = await prisma.survey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        responses: { select: { answersJson: true } },
      },
    })

    if (!survey) return null

    const responseCount = survey.responses.length
    const completionRate = survey.maxResponses > 0 ? responseCount / survey.maxResponses : 0
    const remaining = BigInt(survey.maxResponses - responseCount)
    const vaultBalance = (remaining * survey.perResponse).toString()

    const questions: QuestionStat[] = survey.questions.map((q) => {
      const stat: QuestionStat = {
        questionId: q.id,
        questionKey: q.questionKey,
        type: q.type,
        prompt: q.prompt,
      }

      const key = q.questionKey

      if (q.type === 'SINGLE_CHOICE') {
        const dist: Record<string, number> = {}
        for (const resp of survey.responses) {
          const answers = resp.answersJson as Record<string, unknown>
          const val = answers[key]
          if (typeof val === 'string') {
            dist[val] = (dist[val] ?? 0) + 1
          }
        }
        stat.distribution = dist
      } else if (q.type === 'MULTI_CHOICE') {
        const dist: Record<string, number> = {}
        for (const resp of survey.responses) {
          const answers = resp.answersJson as Record<string, unknown>
          const val = answers[key]
          if (Array.isArray(val)) {
            for (const choice of val) {
              if (typeof choice === 'string') {
                dist[choice] = (dist[choice] ?? 0) + 1
              }
            }
          }
        }
        stat.distribution = dist
      } else if (q.type === 'SCALE') {
        let sum = 0
        let count = 0
        for (const resp of survey.responses) {
          const answers = resp.answersJson as Record<string, unknown>
          const val = answers[key]
          if (typeof val === 'number') {
            sum += val
            count++
          }
        }
        stat.average = count > 0 ? sum / count : 0
      } else if (q.type === 'SHORT_ANSWER') {
        let count = 0
        for (const resp of survey.responses) {
          const answers = resp.answersJson as Record<string, unknown>
          const val = answers[key]
          if (val !== undefined && val !== null && val !== '') {
            count++
          }
        }
        stat.answerCount = count
      }

      return stat
    })

    return {
      surveyId: id,
      responseCount,
      maxResponses: survey.maxResponses,
      completionRate,
      vaultBalance,
      questions,
    }
  }
}
