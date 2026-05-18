import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient, ParticipantSbtStatus, SurveyStatus, QuestionType } from '@prisma/client'

const prisma = new PrismaClient()

async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "responses", "questions", "surveys", "participant_sbts", "users" RESTART IDENTITY CASCADE',
  )
}

beforeEach(async () => {
  await truncateAll()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('schema parity with ER', () => {
  it('contains all five base tables', async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `
    const names = new Set(rows.map((r) => r.table_name))
    expect(names).toContain('users')
    expect(names).toContain('participant_sbts')
    expect(names).toContain('surveys')
    expect(names).toContain('questions')
    expect(names).toContain('responses')
  })

  it('users has the expected columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
    `
    const names = cols.map((c) => c.column_name)
    expect(names).toEqual(
      expect.arrayContaining(['id', 'zk_sub_hash', 'sui_address', 'created_at']),
    )
  })

  it('participant_sbts has the expected columns including supersede_of', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'participant_sbts'
    `
    const names = cols.map((c) => c.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'sub_hash',
        'serial',
        'sui_address',
        'sbt_object_id',
        'issued_at',
        'expires_at',
        'status',
        'supersede_of',
      ]),
    )
  })

  it('surveys has the expected columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'surveys'
    `
    const names = cols.map((c) => c.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'creator_address',
        'vault_object_id',
        'content_md',
        'content_hash',
        'per_response',
        'max_responses',
        'deadline',
        'status',
        'created_at',
      ]),
    )
  })

  it('questions has the expected columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'questions'
    `
    const names = cols.map((c) => c.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'survey_id',
        'order',
        'type',
        'prompt',
        'options_json',
        'required',
      ]),
    )
  })

  it('responses has the expected columns', async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'responses'
    `
    const names = cols.map((c) => c.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'survey_id',
        'sub_hash',
        'sui_address',
        'answers_json',
        'content_hash',
        'claimed_tx',
        'created_at',
      ]),
    )
  })

  it('responses has a UNIQUE(survey_id, sub_hash) index', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'responses'
    `
    const compoundUnique = rows.find(
      (r) =>
        r.indexdef.includes('UNIQUE') &&
        r.indexdef.includes('survey_id') &&
        r.indexdef.includes('sub_hash'),
    )
    expect(compoundUnique).toBeTruthy()
  })
})

describe('test_unique_constraints_block_duplicates', () => {
  it('users.zk_sub_hash UNIQUE blocks duplicate inserts', async () => {
    await prisma.user.create({
      data: { zkSubHash: 'sub-hash-A', suiAddress: '0xaaa' },
    })

    await expect(
      prisma.user.create({
        data: { zkSubHash: 'sub-hash-A', suiAddress: '0xbbb' },
      }),
    ).rejects.toThrow()
  })

  it('participant_sbts.serial UNIQUE blocks duplicate inserts', async () => {
    await prisma.user.create({
      data: { zkSubHash: 'sub-hash-1', suiAddress: '0x1' },
    })
    await prisma.user.create({
      data: { zkSubHash: 'sub-hash-2', suiAddress: '0x2' },
    })
    const now = new Date()
    const exp = new Date(Date.now() + 180 * 24 * 3600 * 1000)

    await prisma.participantSbt.create({
      data: {
        subHash: 'sub-hash-1',
        serial: 42n,
        suiAddress: '0x1',
        sbtObjectId: '0xsbt-1',
        issuedAt: now,
        expiresAt: exp,
        status: ParticipantSbtStatus.ACTIVE,
      },
    })

    await expect(
      prisma.participantSbt.create({
        data: {
          subHash: 'sub-hash-2',
          serial: 42n,
          suiAddress: '0x2',
          sbtObjectId: '0xsbt-2',
          issuedAt: now,
          expiresAt: exp,
          status: ParticipantSbtStatus.ACTIVE,
        },
      }),
    ).rejects.toThrow()
  })

  it('participant_sbts.sbt_object_id UNIQUE blocks duplicate inserts', async () => {
    await prisma.user.create({
      data: { zkSubHash: 'sub-hash-3', suiAddress: '0x3' },
    })
    const now = new Date()
    const exp = new Date(Date.now() + 180 * 24 * 3600 * 1000)

    await prisma.participantSbt.create({
      data: {
        subHash: 'sub-hash-3',
        serial: 1n,
        suiAddress: '0x3',
        sbtObjectId: '0xsame-obj',
        issuedAt: now,
        expiresAt: exp,
        status: ParticipantSbtStatus.ACTIVE,
      },
    })

    await expect(
      prisma.participantSbt.create({
        data: {
          subHash: 'sub-hash-3',
          serial: 2n,
          suiAddress: '0x3',
          sbtObjectId: '0xsame-obj',
          issuedAt: now,
          expiresAt: exp,
          status: ParticipantSbtStatus.SUPERSEDED,
        },
      }),
    ).rejects.toThrow()
  })

  it('surveys.vault_object_id UNIQUE blocks duplicate inserts', async () => {
    const base = {
      creatorAddress: '0xcreator',
      contentMd: '# survey',
      contentHash: '0xhash',
      perResponse: 1_000_000_000n,
      maxResponses: 100,
      deadline: new Date(Date.now() + 86_400_000),
      status: SurveyStatus.ACTIVE,
    }

    await prisma.survey.create({
      data: { ...base, vaultObjectId: '0xvault' },
    })

    await expect(
      prisma.survey.create({
        data: { ...base, vaultObjectId: '0xvault' },
      }),
    ).rejects.toThrow()
  })

  it('responses UNIQUE(survey_id, sub_hash) blocks duplicate inserts', async () => {
    const survey = await prisma.survey.create({
      data: {
        creatorAddress: '0xc',
        vaultObjectId: '0xvault-r',
        contentMd: '# s',
        contentHash: '0xh',
        perResponse: 1n,
        maxResponses: 10,
        deadline: new Date(Date.now() + 86_400_000),
        status: SurveyStatus.ACTIVE,
      },
    })

    await prisma.response.create({
      data: {
        surveyId: survey.id,
        subHash: 'sub-hash-r',
        suiAddress: '0xr',
        answersJson: { q1: 'a' },
        contentHash: '0xrh',
      },
    })

    await expect(
      prisma.response.create({
        data: {
          surveyId: survey.id,
          subHash: 'sub-hash-r',
          suiAddress: '0xr',
          answersJson: { q1: 'b' },
          contentHash: '0xrh2',
        },
      }),
    ).rejects.toThrow()
  })

  it('allows different sub_hash on the same survey', async () => {
    const survey = await prisma.survey.create({
      data: {
        creatorAddress: '0xc',
        vaultObjectId: '0xvault-r2',
        contentMd: '# s',
        contentHash: '0xh',
        perResponse: 1n,
        maxResponses: 10,
        deadline: new Date(Date.now() + 86_400_000),
        status: SurveyStatus.ACTIVE,
      },
    })

    await prisma.response.create({
      data: {
        surveyId: survey.id,
        subHash: 'hash-A',
        suiAddress: '0xA',
        answersJson: {},
        contentHash: '0x1',
      },
    })
    await prisma.response.create({
      data: {
        surveyId: survey.id,
        subHash: 'hash-B',
        suiAddress: '0xB',
        answersJson: {},
        contentHash: '0x2',
      },
    })

    const count = await prisma.response.count({ where: { surveyId: survey.id } })
    expect(count).toBe(2)
  })

  it('questions persist with all four question types', async () => {
    const survey = await prisma.survey.create({
      data: {
        creatorAddress: '0xc',
        vaultObjectId: '0xvault-q',
        contentMd: '# s',
        contentHash: '0xh',
        perResponse: 1n,
        maxResponses: 10,
        deadline: new Date(Date.now() + 86_400_000),
        status: SurveyStatus.ACTIVE,
      },
    })

    await prisma.question.createMany({
      data: [
        {
          surveyId: survey.id,
          questionKey: 'q1',
          order: 1,
          type: QuestionType.SINGLE_CHOICE,
          prompt: 'pick one',
          optionsJson: ['a', 'b'],
          required: true,
        },
        {
          surveyId: survey.id,
          questionKey: 'q2',
          order: 2,
          type: QuestionType.MULTI_CHOICE,
          prompt: 'pick many',
          optionsJson: ['x', 'y'],
          required: false,
        },
        {
          surveyId: survey.id,
          questionKey: 'q3',
          order: 3,
          type: QuestionType.SHORT_ANSWER,
          prompt: 'write',
          optionsJson: {},
          required: false,
        },
        {
          surveyId: survey.id,
          questionKey: 'q4',
          order: 4,
          type: QuestionType.SCALE,
          prompt: 'rate 1-5',
          optionsJson: { min: 1, max: 5 },
          required: true,
        },
      ],
    })

    const count = await prisma.question.count({ where: { surveyId: survey.id } })
    expect(count).toBe(4)
  })
})
