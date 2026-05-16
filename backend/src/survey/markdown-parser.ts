import { createHash } from 'node:crypto'
import yaml from 'js-yaml'

export type QuestionType = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'SHORT_ANSWER' | 'SCALE'

export interface QuestionDef {
  id: string
  type: QuestionType
  prompt: string
  required: boolean
  options?: string[]
  min?: number
  max?: number
}

export interface SurveyMetadata {
  title: string
  perResponse: bigint
  maxResponses: number
  deadline: Date
}

export interface ParsedSurvey {
  metadata: SurveyMetadata
  questions: QuestionDef[]
  contentMd: string
  contentHash: string
}

export class MarkdownParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarkdownParseError'
  }
}

const VALID_TYPES = new Set<string>(['SINGLE_CHOICE', 'MULTI_CHOICE', 'SHORT_ANSWER', 'SCALE'])

export function parseSurveyMarkdown(content: string): ParsedSurvey {
  const frontmatter = extractFrontmatter(content)
  const raw = yaml.load(frontmatter) as Record<string, unknown>

  const metadata = parseMetadata(raw)
  const questions = parseQuestions(raw)

  const contentHash = createHash('sha256').update(content).digest('hex')

  return { metadata, questions, contentMd: content, contentHash }
}

function extractFrontmatter(content: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!match) {
    throw new MarkdownParseError('缺少 YAML frontmatter（需以 --- 開頭並以 --- 結尾）')
  }
  return match[1]
}

function parseMetadata(raw: Record<string, unknown>): SurveyMetadata {
  if (typeof raw.title !== 'string' || raw.title.trim() === '') {
    throw new MarkdownParseError('metadata.title 必須為非空字串')
  }

  if (raw.perResponse === undefined || raw.perResponse === null) {
    throw new MarkdownParseError('metadata.perResponse 為必填')
  }
  const perResponseNum = Number(raw.perResponse)
  if (!Number.isInteger(perResponseNum) || perResponseNum <= 0) {
    throw new MarkdownParseError('metadata.perResponse 必須為正整數')
  }

  if (raw.maxResponses === undefined || raw.maxResponses === null) {
    throw new MarkdownParseError('metadata.maxResponses 為必填')
  }
  const maxResponses = Number(raw.maxResponses)
  if (!Number.isInteger(maxResponses) || maxResponses <= 0) {
    throw new MarkdownParseError('metadata.maxResponses 必須為正整數')
  }

  if (typeof raw.deadline !== 'string' || raw.deadline.trim() === '') {
    throw new MarkdownParseError('metadata.deadline 必須為 ISO 日期字串')
  }
  const deadline = new Date(raw.deadline)
  if (isNaN(deadline.getTime())) {
    throw new MarkdownParseError('metadata.deadline 格式無效')
  }

  return {
    title: raw.title.trim(),
    perResponse: BigInt(perResponseNum),
    maxResponses,
    deadline,
  }
}

function parseQuestions(raw: Record<string, unknown>): QuestionDef[] {
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    throw new MarkdownParseError('questions 必須為非空陣列')
  }

  const seenIds = new Set<string>()
  return raw.questions.map((q: unknown, idx: number) => {
    if (typeof q !== 'object' || q === null) {
      throw new MarkdownParseError(`questions[${idx}] 必須為物件`)
    }
    const question = q as Record<string, unknown>

    if (typeof question.id !== 'string' || question.id.trim() === '') {
      throw new MarkdownParseError(`questions[${idx}].id 必須為非空字串`)
    }
    const id = question.id.trim()
    if (seenIds.has(id)) {
      throw new MarkdownParseError(`重複的 question id: "${id}"`)
    }
    seenIds.add(id)

    if (typeof question.type !== 'string' || !VALID_TYPES.has(question.type)) {
      throw new MarkdownParseError(
        `questions[${idx}].type 無效，必須為 SINGLE_CHOICE / MULTI_CHOICE / SHORT_ANSWER / SCALE`,
      )
    }
    const type = question.type as QuestionType

    if (typeof question.prompt !== 'string' || question.prompt.trim() === '') {
      throw new MarkdownParseError(`questions[${idx}].prompt 必須為非空字串`)
    }

    const required = question.required === true

    const def: QuestionDef = { id, type, prompt: question.prompt.trim(), required }

    if (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') {
      if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new MarkdownParseError(
          `questions[${idx}] 類型為 ${type}，options 必須有至少 2 個選項`,
        )
      }
      def.options = (question.options as unknown[]).map((o, oi) => {
        if (typeof o !== 'string' || o.trim() === '') {
          throw new MarkdownParseError(`questions[${idx}].options[${oi}] 必須為非空字串`)
        }
        return o.trim()
      })
    }

    if (type === 'SCALE') {
      const min = Number(question.min)
      const max = Number(question.max)
      if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) {
        throw new MarkdownParseError(
          `questions[${idx}] 類型為 SCALE，需要 min < max 的整數`,
        )
      }
      def.min = min
      def.max = max
    }

    return def
  })
}
