import { describe, it, expect } from 'vitest'
import {
  parseFullSurveyMarkdown,
  serializeFullSurveyToMarkdown,
  makeBlankSurveyData,
  type FullSurveyData,
} from '../frontmatter'

const FIXED_STAMP = '2026-05-22T08:00:00.000Z'
const FUTURE_DEADLINE = new Date('2030-01-01T00:00:00.000Z').getTime()

function sample(overrides: Partial<FullSurveyData> = {}): FullSurveyData {
  return {
    title: '測試問卷',
    perResponse: 10,
    maxResponses: 100,
    deadlineMs: FUTURE_DEADLINE,
    minTier: 0,
    description: '這是說明文字。\n\n第二段。',
    questions: [
      {
        id: 'q1',
        type: 'single_choice',
        prompt: '單選題?',
        options_json: ['A', 'B', 'C'],
        required: true,
      },
      {
        id: 'q2',
        type: 'multi_choice',
        prompt: '複選題?',
        options_json: ['X', 'Y'],
        required: false,
      },
      {
        id: 'q3',
        type: 'text',
        prompt: '簡答題?',
        options_json: null,
        required: false,
      },
      {
        id: 'q4',
        type: 'scale',
        prompt: '量表題?',
        options_json: null,
        required: true,
      },
    ],
    ...overrides,
  }
}

describe('serializeFullSurveyToMarkdown', () => {
  it('輸出三段式：frontmatter → description → yaml code block', () => {
    const md = serializeFullSurveyToMarkdown(sample(), { draftStamp: FIXED_STAMP })
    expect(md).toContain('---\ntitle:')
    expect(md.indexOf('```yaml')).toBeGreaterThan(md.indexOf('---\n', 4))
    // description 必須在 frontmatter 之後、yaml block 之前
    const fmEnd = md.indexOf('\n---\n', 4) + '\n---\n'.length
    const ymlStart = md.indexOf('```yaml')
    expect(md.slice(fmEnd, ymlStart)).toContain('這是說明文字。')
  })

  it('保留 draftStamp 並使用大寫 type 字串', () => {
    const md = serializeFullSurveyToMarkdown(sample(), { draftStamp: FIXED_STAMP })
    expect(md).toContain(`draftStamp: "${FIXED_STAMP}"`)
    expect(md).toContain('type: SINGLE_CHOICE')
    expect(md).toContain('type: MULTI_CHOICE')
    expect(md).toContain('type: SHORT_ANSWER')
    expect(md).toContain('type: SCALE')
  })

  it('字串欄位用雙引號包裹並轉義雙引號與換行', () => {
    const data = sample({ title: '含 "引號" 的標題' })
    data.questions[0].prompt = '含\n換行的 prompt'
    const md = serializeFullSurveyToMarkdown(data, { draftStamp: FIXED_STAMP })
    expect(md).toContain('title: "含 \\"引號\\" 的標題"')
    expect(md).toContain('prompt: "含 換行的 prompt"')
  })

  it('輸出 minTier 欄位', () => {
    const md = serializeFullSurveyToMarkdown(sample({ minTier: 2 }), { draftStamp: FIXED_STAMP })
    expect(md).toContain('minTier: 2')
  })
})

describe('parseFullSurveyMarkdown', () => {
  it('能解析 serializer 輸出', () => {
    const original = sample({ minTier: 3 })
    const md = serializeFullSurveyToMarkdown(original, { draftStamp: FIXED_STAMP })
    const result = parseFullSurveyMarkdown(md)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.title).toBe(original.title)
    expect(result.data.perResponse).toBe(original.perResponse)
    expect(result.data.maxResponses).toBe(original.maxResponses)
    expect(result.data.deadlineMs).toBe(original.deadlineMs)
    expect(result.data.minTier).toBe(3)
    expect(result.data.description).toBe(original.description)
    expect(result.data.questions).toEqual(original.questions)
  })

  it('缺 frontmatter 報錯', () => {
    const r = parseFullSurveyMarkdown('沒有 frontmatter\n```yaml\nquestions:\n  - id: q1\n```')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/frontmatter/)
  })

  it('缺 yaml code block 報錯', () => {
    const md = `---\ntitle: "X"\nperResponse: 1\nmaxResponses: 1\ndeadline: "2030-01-01T00:00:00.000Z"\n---\n\n只有說明文字`
    const r = parseFullSurveyMarkdown(md)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/題目區塊/)
  })

  it('minTier 範圍外報錯', () => {
    const md = serializeFullSurveyToMarkdown(sample(), { draftStamp: FIXED_STAMP }).replace(
      'minTier: 0',
      'minTier: 5',
    )
    const r = parseFullSurveyMarkdown(md)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/minTier/)
  })

  it('title 為空報錯', () => {
    const md = serializeFullSurveyToMarkdown(sample({ title: '佔位' }), {
      draftStamp: FIXED_STAMP,
    }).replace('title: "佔位"', 'title: ""')
    const r = parseFullSurveyMarkdown(md)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/title/)
  })

  it('minTier 預設 0', () => {
    const md = serializeFullSurveyToMarkdown(sample(), { draftStamp: FIXED_STAMP }).replace(
      /^minTier:.*$/m,
      '',
    )
    const r = parseFullSurveyMarkdown(md)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.minTier).toBe(0)
  })
})

describe('round-trip', () => {
  it('serialize → parse → serialize 結果穩定（含 minTier）', () => {
    const data = sample({ minTier: 2 })
    const md1 = serializeFullSurveyToMarkdown(data, { draftStamp: FIXED_STAMP })
    const parsed = parseFullSurveyMarkdown(md1)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const md2 = serializeFullSurveyToMarkdown(parsed.data, { draftStamp: FIXED_STAMP })
    expect(md2).toBe(md1)
  })

  it('makeBlankSurveyData round-trip', () => {
    const blank = makeBlankSurveyData()
    const md = serializeFullSurveyToMarkdown(blank, { draftStamp: FIXED_STAMP })
    const parsed = parseFullSurveyMarkdown(md)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.minTier).toBe(0)
      expect(parsed.data.questions.length).toBeGreaterThan(0)
    }
  })
})
