export interface FrontmatterData {
  perResponse: number
  maxResponses: number
  deadlineMs: number
}

export type FrontmatterResult =
  | { ok: true; data: FrontmatterData }
  | { ok: false; error: string }

/** 從 Markdown frontmatter 解析 perResponse / maxResponses / deadline，不依賴 js-yaml */
export function parseFrontmatter(md: string): FrontmatterResult {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!match) {
    return { ok: false, error: '缺少 YAML frontmatter（需以 --- 開頭並以 --- 結尾）' }
  }
  const yaml = match[1]

  const getVal = (key: string): string | null => {
    const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(yaml)
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
  }

  const perResponseStr = getVal('perResponse')
  const maxResponsesStr = getVal('maxResponses')
  const deadlineStr = getVal('deadline')

  if (!perResponseStr) return { ok: false, error: 'frontmatter 缺少 perResponse' }
  if (!maxResponsesStr) return { ok: false, error: 'frontmatter 缺少 maxResponses' }
  if (!deadlineStr) return { ok: false, error: 'frontmatter 缺少 deadline' }

  const perResponse = Number(perResponseStr)
  if (!Number.isInteger(perResponse) || perResponse <= 0)
    return { ok: false, error: 'perResponse 必須為正整數（RWD 數量）' }

  const maxResponses = Number(maxResponsesStr)
  if (!Number.isInteger(maxResponses) || maxResponses <= 0)
    return { ok: false, error: 'maxResponses 必須為正整數' }

  const deadlineMs = new Date(deadlineStr).getTime()
  if (isNaN(deadlineMs)) return { ok: false, error: 'deadline 格式無效（需為 ISO 日期字串）' }
  if (deadlineMs <= Date.now()) return { ok: false, error: 'deadline 須為未來時間' }

  return { ok: true, data: { perResponse, maxResponses, deadlineMs } }
}

export interface Question {
  id: string
  type: 'single_choice' | 'multi_choice' | 'text' | 'scale'
  prompt: string
  options_json: string[] | null
  required: boolean
}

export interface FullSurveyData {
  title: string
  perResponse: number
  maxResponses: number
  deadlineMs: number
  questions: Question[]
}

export type FullSurveyResult =
  | { ok: true; data: FullSurveyData }
  | { ok: false; error: string }

export function parseFullSurveyMarkdown(md: string): FullSurveyResult {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!match) {
    return { ok: false, error: '缺少 YAML frontmatter（需以 --- 開頭並以 --- 結尾）' }
  }
  const yaml = match[1]
  const lines = yaml.split('\n')

  let title = '無標題問卷'
  let perResponse = 0
  let maxResponses = 0
  let deadlineMs = 0
  const questions: Question[] = []

  let currentQuestion: any = null
  let inQuestions = false
  let inOptions = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Detect questions: block
    if (trimmed.startsWith('questions:')) {
      inQuestions = true
      inOptions = false
      continue
    }

    if (!inQuestions) {
      // Parse top-level keys
      const colonIdx = line.indexOf(':')
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim()
        const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '')
        if (key === 'title') {
          title = value
        } else if (key === 'perResponse') {
          perResponse = Number(value)
        } else if (key === 'maxResponses') {
          maxResponses = Number(value)
        } else if (key === 'deadline') {
          deadlineMs = new Date(value).getTime()
        }
      }
    } else {
      // Inside questions block
      if (line.startsWith('  -') || line.startsWith('   -')) {
        // New question item
        if (currentQuestion) {
          questions.push(currentQuestion)
        }
        inOptions = false
        // Parse any key-value on the same line if present, e.g. "  - id: q1"
        const content = line.replace(/^\s*-\s*/, '') // remove "  - "
        const colonIdx = content.indexOf(':')
        currentQuestion = {
          id: '',
          type: 'text',
          prompt: '',
          options_json: null,
          required: false,
        }
        if (colonIdx !== -1) {
          const key = content.slice(0, colonIdx).trim()
          const value = content.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '')
          if (key === 'id') currentQuestion.id = value
          if (key === 'type') currentQuestion.type = mapType(value)
          if (key === 'prompt') currentQuestion.prompt = value
          if (key === 'required') currentQuestion.required = value === 'true'
        }
      } else if (line.startsWith('      -') || line.startsWith('       -')) {
        // Inside options list
        if (inOptions && currentQuestion) {
          const opt = trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '')
          if (!currentQuestion.options_json) {
            currentQuestion.options_json = []
          }
          currentQuestion.options_json.push(opt)
        }
      } else {
        // Regular key-value inside a question
        const colonIdx = line.indexOf(':')
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim()
          const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '')
          if (currentQuestion) {
            if (key === 'id') currentQuestion.id = value
            else if (key === 'type') currentQuestion.type = mapType(value)
            else if (key === 'prompt') currentQuestion.prompt = value
            else if (key === 'required') currentQuestion.required = value === 'true'
            else if (key === 'options') {
              inOptions = true
              currentQuestion.options_json = []
            }
          }
        }
      }
    }
  }

  if (currentQuestion) {
    questions.push(currentQuestion)
  }

  // Helper to map YAML types to our standard types
  function mapType(t: string): 'single_choice' | 'multi_choice' | 'text' | 'scale' {
    const lower = t.toLowerCase()
    if (lower === 'single_choice') return 'single_choice'
    if (lower === 'multi_choice') return 'multi_choice'
    if (lower === 'short_answer' || lower === 'text') return 'text'
    if (lower === 'scale') return 'scale'
    return 'text'
  }

  if (!perResponse || isNaN(perResponse) || perResponse <= 0) {
    return { ok: false, error: 'perResponse 必須為正整數' }
  }
  if (!maxResponses || isNaN(maxResponses) || maxResponses <= 0) {
    return { ok: false, error: 'maxResponses 必須為正整數' }
  }
  if (!deadlineMs || isNaN(deadlineMs)) {
    return { ok: false, error: 'deadline 格式無效' }
  }

  return {
    ok: true,
    data: {
      title,
      perResponse,
      maxResponses,
      deadlineMs,
      questions,
    },
  }
}

