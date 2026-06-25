import type { Question } from './frontmatter'

export interface EncodedAnswersPayload {
  answers: Array<number | number[] | string | null>
  schema_hash: string
  version: number
}

/**
 * 回覆的題目結構與目前問卷不相容（version 不符或 schema_hash 不符），
 * 無法按 index 可信對映。上層應將此類回覆獨立計數、排除於統計之外，
 * 而非靜默錯位對映或當成空答案。
 */
export class SchemaMismatchError extends Error {
  constructor(public readonly reason: 'version' | 'schema_hash') {
    super(`Answer payload is incompatible with current schema: ${reason}`)
    this.name = 'SchemaMismatchError'
  }
}

export function normalizeBytes(input: unknown): Uint8Array {
  if (Array.isArray(input)) {
    return new Uint8Array(input.map(Number))
  }
  if (typeof input === 'string') {
    if (input.startsWith('0x')) {
      return new Uint8Array(
        input
          .slice(2)
          .match(/.{1,2}/g)
          ?.map((byte) => parseInt(byte, 16)) || []
      )
    }
    try {
      const binary = atob(input)
      return Uint8Array.from(binary, (c) => c.charCodeAt(0))
    } catch {
      // Not base64
    }
  }
  return new Uint8Array(0)
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function computeSchemaHash(questions: Question[]): Promise<Uint8Array> {
  const schemaStr = JSON.stringify(questions || [])
  const data = new TextEncoder().encode(schemaStr)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(hashBuffer)
}

export function encodeAnswers(
  answersMap: Record<string, string | number | Array<string | number>>,
  questions: Question[],
  schemaHash: string | Uint8Array
): EncodedAnswersPayload {
  const hashStr = typeof schemaHash === 'string' ? schemaHash : bytesToHex(schemaHash)

  const answers = questions.map((q) => {
    const val = answersMap[q.id]
    if (val === undefined || val === null) return null

    if (q.type === 'single_choice') {
      if (typeof val === 'number') return val
      if (typeof val === 'string' && q.options_json) {
        const idx = q.options_json.indexOf(val)
        return idx !== -1 ? idx : null
      }
      return null
    }

    if (q.type === 'multi_choice') {
      if (Array.isArray(val)) {
        return val
          .map((item) => {
            if (typeof item === 'number') return item
            if (typeof item === 'string' && q.options_json) {
              const idx = q.options_json.indexOf(item)
              return idx !== -1 ? idx : -1
            }
            return -1
          })
          .filter((idx) => idx !== -1)
      }
      return null
    }

    // text / scale 題目直接返回 string
    return String(val)
  })

  return {
    answers,
    schema_hash: hashStr,
    version: 1,
  }
}

export function decodeAnswers(
  payloadStr: string,
  questions: Question[],
  vaultSchemaHash: string | Uint8Array
): Record<string, string | string[] | number | number[]> {
  const payload = JSON.parse(payloadStr)

  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.answers)) {
    return {}
  }

  if (payload.version !== 1) {
    throw new SchemaMismatchError('version')
  }

  const expectedHash =
    typeof vaultSchemaHash === 'string' ? vaultSchemaHash : bytesToHex(vaultSchemaHash)

  const cleanExpected = expectedHash.startsWith('0x') ? expectedHash.slice(2) : expectedHash
  const cleanPayload =
    payload.schema_hash && typeof payload.schema_hash === 'string'
      ? payload.schema_hash.startsWith('0x')
        ? payload.schema_hash.slice(2)
        : payload.schema_hash
      : ''

  if (cleanExpected !== cleanPayload) {
    // schema_hash 不符代表此回覆是依不同題序／題目集編碼，按 index 對映會錯位。
    throw new SchemaMismatchError('schema_hash')
  }

  const answersMap: Record<string, string | string[] | number | number[]> = {}
  questions.forEach((q, index) => {
    const val = payload.answers[index]
    if (val !== undefined && val !== null) {
      answersMap[q.id] = val
    }
  })

  return answersMap
}
