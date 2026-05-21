import type { Question } from './frontmatter'

export interface EncodedAnswersPayload {
  answers: Array<string | string[] | null>
  schema_hash: string
}

export function normalizeBytes(input: any): Uint8Array {
  if (Array.isArray(input)) {
    return new Uint8Array(input.map(Number))
  }
  if (typeof input === 'string') {
    if (input.startsWith('0x')) {
      return new Uint8Array(
        input.slice(2).match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
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
  answersMap: Record<string, string | string[]>,
  questions: Question[],
  schemaHash: string | Uint8Array,
): EncodedAnswersPayload {
  const hashStr = typeof schemaHash === 'string' ? schemaHash : bytesToHex(schemaHash)
  
  const answers = questions.map((q) => {
    const val = answersMap[q.id]
    return val !== undefined ? val : null
  })

  return {
    answers,
    schema_hash: hashStr,
  }
}

export function decodeAnswers(
  payloadStr: string,
  questions: Question[],
  vaultSchemaHash: string | Uint8Array,
): Record<string, string | string[]> {
  const payload = JSON.parse(payloadStr)

  // 向後相容 V1 舊格式：
  // 舊格式直接是 { q1: "...", q2: "..." }，不包含 "answers" 欄位，或者 answers 不是 Array
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.answers)) {
    return payload as Record<string, string | string[]>
  }

  const expectedHash = typeof vaultSchemaHash === 'string' ? vaultSchemaHash : bytesToHex(vaultSchemaHash)
  
  const cleanExpected = expectedHash.startsWith('0x') ? expectedHash.slice(2) : expectedHash
  const cleanPayload = payload.schema_hash && typeof payload.schema_hash === 'string'
    ? (payload.schema_hash.startsWith('0x') ? payload.schema_hash.slice(2) : payload.schema_hash)
    : ''

  if (cleanExpected !== cleanPayload) {
    console.warn(`Schema hash mismatch! Expected: ${cleanExpected}, Payload: ${cleanPayload}. Answers might be misaligned.`)
  }

  const answersMap: Record<string, string | string[]> = {}
  questions.forEach((q, index) => {
    const val = payload.answers[index]
    if (val !== undefined && val !== null) {
      answersMap[q.id] = val
    }
  })

  return answersMap
}
