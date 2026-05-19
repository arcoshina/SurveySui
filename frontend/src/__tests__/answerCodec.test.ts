import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { encodeAnswers, decodeAnswers, computeSchemaHash } from '../lib/answerCodec'
import type { Question } from '../lib/frontmatter'

describe('S2.3 — answerCodec tests', () => {
  const mockQuestions: Question[] = [
    {
      id: 'q1',
      type: 'single_choice',
      prompt: '您最喜歡哪種顏色？',
      options_json: ['紅色', '藍色', '綠色'],
      required: true,
    },
    {
      id: 'q2',
      type: 'multi_choice',
      prompt: '您擁有什麼設備？',
      options_json: ['手機', '電腦', '平板'],
      required: false,
    },
  ]

  let schemaHashHex: string

  beforeEach(async () => {
    const hashBytes = await computeSchemaHash(mockQuestions)
    schemaHashHex = Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  })

  it('test_answer_encode_strips_questions — given 完整作答物件，encode 後 payload 只含 answers[] + schema_hash，不含題目文字', () => {
    const answersMap = {
      q1: '紅色',
      q2: ['手機', '平板'],
    }

    const payload = encodeAnswers(answersMap, mockQuestions, schemaHashHex)

    // Check payload structure
    expect(payload).toHaveProperty('answers')
    expect(payload).toHaveProperty('schema_hash')
    expect(payload.answers).toEqual(['紅色', ['手機', '平板']])
    expect(payload.schema_hash).toBe(schemaHashHex)

    // Verify it doesn't contain prompts or question keys (like 'q1' or prompt texts) in answers value list
    const jsonStr = JSON.stringify(payload)
    expect(jsonStr).not.toContain('您最喜歡哪種顏色？')
    expect(jsonStr).not.toContain('您擁有什麼設備？')
  })

  it('test_answer_decode_by_index — given encoded answers + 原問卷 schema → decode 後按 index 正確配對', () => {
    const payloadStr = JSON.stringify({
      answers: ['藍色', ['電腦']],
      schema_hash: schemaHashHex,
    })

    const decoded = decodeAnswers(payloadStr, mockQuestions, schemaHashHex)

    expect(decoded).toEqual({
      q1: '藍色',
      q2: ['電腦'],
    })
  })

  it('test_answer_schema_hash_mismatch_warning — given encoded.schema_hash ≠ vault.schema_hash → decode 報 warning（避免題目改版後錯位）', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const wrongSchemaHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const payloadStr = JSON.stringify({
      answers: ['藍色', ['電腦']],
      schema_hash: wrongSchemaHash,
    })

    decodeAnswers(payloadStr, mockQuestions, schemaHashHex)

    expect(consoleWarnSpy).toHaveBeenCalled()
    expect(consoleWarnSpy.mock.calls[0][0]).toContain('Schema hash mismatch')

    consoleWarnSpy.mockRestore()
  })
})
