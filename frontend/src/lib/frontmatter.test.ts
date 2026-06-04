import { describe, it, expect } from 'vitest'
import {
  parseFullSurveyMarkdown,
  serializeFullSurveyToMarkdown,
  type FullSurveyData,
  sanitizeQuestionIds
} from './frontmatter'

describe('frontmatter parser & serializer (character limits)', () => {
  it('should parse survey YAML with max_len correctly', () => {
    const md = `---
title: "測試字數上限"
perResponse: 5
repeatReward: 0
repeatMaxTimes: 3
maxResponses: 10
deadline: "2028-12-31T23:59:59.000Z"
minTier: 0
encryptAnswers: true
storageCompensationAmount: 0.01
draftStamp: "2026-06-02T12:00:00.000Z"
---

這是問卷說明。

\`\`\`yaml
questions:
  - id: "q1"
    type: SHORT_ANSWER
    prompt: "請填寫回饋"
    required: true
    max_len: 150
  - id: "q2"
    type: SHORT_ANSWER
    prompt: "無字數限制"
    required: false
\`\`\`
`

    const parsed = parseFullSurveyMarkdown(md)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.questions[0].maxLen).toBe(150)
      expect(parsed.data.questions[1].maxLen).toBeUndefined()
    }
  })

  it('should serialize survey data with maxLen correctly', () => {
    const data: FullSurveyData = {
      title: "測試序列化",
      perResponse: 5,
      repeatReward: 0,
      repeatMaxTimes: 3,
      maxResponses: 10,
      deadlineMs: new Date("2028-12-31T23:59:59.000Z").getTime(),
      minTier: 0,
      encryptAnswers: true,
      storageCompensationAmount: 0.01,
      description: "問卷說明內容",
      questions: [
        {
          id: "q1",
          type: "text",
          prompt: "問題一",
          options_json: null,
          required: true,
          maxLen: 80
        },
        {
          id: "q2",
          type: "text",
          prompt: "問題二",
          options_json: null,
          required: false
        }
      ]
    }

    const md = serializeFullSurveyToMarkdown(data, { draftStamp: "2026-06-02T12:00:00.000Z" })
    expect(md).toContain('max_len: 80')
    expect(md).not.toContain('max_len: undefined')

    // Parse it back to verify consistency
    const reparsed = parseFullSurveyMarkdown(md)
    expect(reparsed.ok).toBe(true)
    if (reparsed.ok) {
      expect(reparsed.data.questions[0].maxLen).toBe(80)
      expect(reparsed.data.questions[1].maxLen).toBeUndefined()
    }
  })

  it('should fail to parse survey with duplicate question IDs', () => {
    const md = `---
title: "測試重複ID"
perResponse: 5
repeatReward: 0
repeatMaxTimes: 3
maxResponses: 10
deadline: "2028-12-31T23:59:59.000Z"
minTier: 0
encryptAnswers: true
storageCompensationAmount: 0.01
draftStamp: "2026-06-02T12:00:00.000Z"
---

說明。

\`\`\`yaml
questions:
  - id: "q1"
    type: SHORT_ANSWER
    prompt: "問題一"
    required: true
  - id: "q1"
    type: SHORT_ANSWER
    prompt: "問題二"
    required: false
\`\`\`
`
    const parsed = parseFullSurveyMarkdown(md)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error).toContain('題目 ID 重複：q1')
    }
  })

  it('should parse ordered list options correctly and set shuffle: undefined/false', () => {
    const md = `---
title: "測試有序"
perResponse: 5
repeatReward: 0
repeatMaxTimes: 3
maxResponses: 10
deadline: "2028-12-31T23:59:59.000Z"
minTier: 0
encryptAnswers: true
storageCompensationAmount: 0.01
draftStamp: "2026-06-02T12:00:00.000Z"
---

\`\`\`yaml
questions:
  - id: "q1"
    type: SINGLE_CHOICE
    prompt: "有序選項"
    required: true
    options:
      1. 第一項
      2. 第二項
\`\`\`
`
    const parsed = parseFullSurveyMarkdown(md)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.questions[0].options_json).toEqual(['第一項', '第二項'])
      expect(parsed.data.questions[0].shuffle).toBeUndefined()
    }
  })

  it('should parse unordered list options correctly and set shuffle: true', () => {
    const md = `---
title: "測試無序"
perResponse: 5
repeatReward: 0
repeatMaxTimes: 3
maxResponses: 10
deadline: "2028-12-31T23:59:59.000Z"
minTier: 0
encryptAnswers: true
storageCompensationAmount: 0.01
draftStamp: "2026-06-02T12:00:00.000Z"
---

\`\`\`yaml
questions:
  - id: "q1"
    type: SINGLE_CHOICE
    prompt: "無序選項"
    required: true
    options:
      - 第一項
      - 第二項
\`\`\`
`
    const parsed = parseFullSurveyMarkdown(md)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.questions[0].options_json).toEqual(['第一項', '第二項'])
      expect(parsed.data.questions[0].shuffle).toBe(true)
    }
  })

  it('should sanitize duplicate question IDs and duplicate options correctly', () => {
    const questions = [
      { id: 'q1', type: 'text', prompt: 'P1', options_json: null, required: true },
      { id: 'q1', type: 'text', prompt: 'P2', options_json: null, required: false },
      { id: '', type: 'text', prompt: 'P3', options_json: null, required: false },
      { id: 'q1', type: 'multi_choice', prompt: 'P4', options_json: ['A', 'A', 'B', 'A'], required: false }
    ] as any[]

    const sanitized = sanitizeQuestionIds(questions)

    expect(sanitized[0].id).toBe('q1')
    expect(sanitized[1].id).toBe('q1_1')
    expect(sanitized[2].id).toBe('q_3')
    expect(sanitized[3].id).toBe('q1_2')
    expect(sanitized[3].options_json).toEqual(['A', 'A_1', 'B', 'A_2'])
  })
})
