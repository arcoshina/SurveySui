import { describe, it, expect } from 'vitest'
import { encodeAnswers, decodeAnswers, SchemaMismatchError } from './answerCodec'
import type { Question } from './frontmatter'

describe('answerCodec - Version 1 (Index-Based Answers)', () => {
  const schemaHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
  
  const mockQuestions: Question[] = [
    {
      id: 'q1',
      type: 'single_choice',
      prompt: '單選題一',
      options_json: ['蘋果', '香蕉', '蘋果'], // 包含重複的選項文字
      required: true
    },
    {
      id: 'q2',
      type: 'multi_choice',
      prompt: '多選題二',
      options_json: ['A', 'B', 'A', 'C'], // 包含重複的選項文字
      required: true
    },
    {
      id: 'q3',
      type: 'text',
      prompt: '簡答題三',
      options_json: null,
      required: false
    },
    {
      id: 'q4',
      type: 'scale',
      prompt: '量表題四',
      options_json: null,
      required: false
    }
  ]

  it('should encode answers using indices for choices, and strings for text/scale', () => {
    // 答卷的狀態可能傳入 index (number/number[]) 或直接傳入 text (string/string[])
    const answersInput = {
      q1: 2, // 代表第二個 '蘋果' (索引為 2)
      q2: [0, 2], // 代表第一個 'A' (索引 0) 和第二個 'A' (索引 2)
      q3: '有些回饋意見。',
      q4: '4'
    }

    const payload = encodeAnswers(answersInput, mockQuestions, schemaHash)
    expect(payload.version).toBe(1)
    expect(payload.schema_hash).toBe(schemaHash)
    expect(payload.answers).toEqual([
      2,
      [0, 2],
      '有些回饋意見。',
      '4'
    ])
  })

  it('should support encoding from string text values for backward compatibility and fallback helper', () => {
    const answersInput = {
      q1: '香蕉',
      q2: ['B', 'C'],
      q3: '意見。',
      q4: '3'
    }

    const payload = encodeAnswers(answersInput, mockQuestions, schemaHash)
    expect(payload.answers).toEqual([
      1, // '香蕉' 索引為 1
      [1, 3], // 'B' (索引 1), 'C' (索引 3)
      '意見。',
      '3'
    ])
  })

  it('should decode answers correctly preserving raw indices', () => {
    const payloadStr = JSON.stringify({
      answers: [
        2, // 對應 '蘋果' (索引為 2)
        [1, 2], // 對應 'B' 和 'A'
        '用戶回報意見',
        '5'
      ],
      schema_hash: schemaHash,
      version: 1
    })

    const decoded = decodeAnswers(payloadStr, mockQuestions, schemaHash)
    expect(decoded).toEqual({
      q1: 2,
      q2: [1, 2],
      q3: '用戶回報意見',
      q4: '5'
    })
  })

  it('should throw SchemaMismatchError if version is missing (discard legacy)', () => {
    const payloadStr = JSON.stringify({
      answers: ['蘋果', ['B'], '回饋', '5'],
      schema_hash: schemaHash
      // 缺少 version，代表舊版
    })

    expect(() => decodeAnswers(payloadStr, mockQuestions, schemaHash)).toThrow(
      SchemaMismatchError
    )
  })

  it('should throw SchemaMismatchError if version is unsupported', () => {
    const payloadStr = JSON.stringify({
      answers: [0, [0], '意見', '3'],
      schema_hash: schemaHash,
      version: 99
    })

    expect(() => decodeAnswers(payloadStr, mockQuestions, schemaHash)).toThrow(
      SchemaMismatchError
    )
  })

  it('should throw SchemaMismatchError if schema_hash does not match (avoid misaligned mapping)', () => {
    const payloadStr = JSON.stringify({
      answers: [2, [1, 2], '意見', '5'],
      schema_hash: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      version: 1
    })

    expect(() => decodeAnswers(payloadStr, mockQuestions, schemaHash)).toThrow(
      SchemaMismatchError
    )
  })
})
