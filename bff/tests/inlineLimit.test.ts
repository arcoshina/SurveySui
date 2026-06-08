import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_MAX_INLINE_ANSWER_BYTES,
  effectiveInlineLimit,
  resolveMaxInlineAnswerBytes,
} from '../src/gas/inlineLimit.js'

describe('inlineLimit', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    saved.MAX_INLINE_ANSWER_BYTES = process.env.MAX_INLINE_ANSWER_BYTES
    saved.MAX_INLINE_ANSWER_KB = process.env.MAX_INLINE_ANSWER_KB
    delete process.env.MAX_INLINE_ANSWER_BYTES
    delete process.env.MAX_INLINE_ANSWER_KB
  })

  afterEach(() => {
    if (saved.MAX_INLINE_ANSWER_BYTES === undefined) {
      delete process.env.MAX_INLINE_ANSWER_BYTES
    } else {
      process.env.MAX_INLINE_ANSWER_BYTES = saved.MAX_INLINE_ANSWER_BYTES
    }
    if (saved.MAX_INLINE_ANSWER_KB === undefined) {
      delete process.env.MAX_INLINE_ANSWER_KB
    } else {
      process.env.MAX_INLINE_ANSWER_KB = saved.MAX_INLINE_ANSWER_KB
    }
  })

  it('defaults to 6144 bytes when env unset', () => {
    expect(resolveMaxInlineAnswerBytes()).toBe(DEFAULT_MAX_INLINE_ANSWER_BYTES)
  })

  it('reads MAX_INLINE_ANSWER_BYTES with underscore separators', () => {
    process.env.MAX_INLINE_ANSWER_BYTES = '8_192'
    expect(resolveMaxInlineAnswerBytes()).toBe(8192)
  })

  it('effectiveInlineLimit uses min of env cap and on-chain vault max', () => {
    process.env.MAX_INLINE_ANSWER_BYTES = '4096'
    expect(effectiveInlineLimit(6144n)).toBe(4096)
    expect(effectiveInlineLimit(2048n)).toBe(2048)
  })
})
