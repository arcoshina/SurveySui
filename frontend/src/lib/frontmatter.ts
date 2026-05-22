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

export type QuestionType = 'single_choice' | 'multi_choice' | 'text' | 'scale'

export interface Question {
  id: string
  type: QuestionType
  prompt: string
  options_json: string[] | null
  required: boolean
}

export interface FullSurveyData {
  title: string
  perResponse: number
  maxResponses: number
  deadlineMs: number
  /** 0 = 無門檻；1/2/3 對應 KYC tier */
  minTier: number
  /** 問卷說明文字（純 markdown，frontmatter 與 questions 程式碼區塊之間） */
  description: string
  questions: Question[]
}

export type FullSurveyResult =
  | { ok: true; data: FullSurveyData }
  | { ok: false; error: string }

const QUESTION_TYPE_TO_YAML: Record<QuestionType, string> = {
  single_choice: 'SINGLE_CHOICE',
  multi_choice: 'MULTI_CHOICE',
  text: 'SHORT_ANSWER',
  scale: 'SCALE',
}

function mapYamlTypeToInternal(t: string): QuestionType | null {
  const lower = t.trim().toLowerCase()
  if (lower === 'single_choice') return 'single_choice'
  if (lower === 'multi_choice') return 'multi_choice'
  if (lower === 'short_answer' || lower === 'text') return 'text'
  if (lower === 'scale') return 'scale'
  return null
}

function stripQuotes(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'")
  }
  return t
}

/**
 * 三段式 markdown 格式：
 *   ---
 *   <frontmatter: title/perResponse/maxResponses/deadline/minTier/draftStamp>
 *   ---
 *
 *   <description: 純 markdown 文字>
 *
 *   ```yaml
 *   questions:
 *     - id: q1
 *       type: SINGLE_CHOICE
 *       ...
 *   ```
 */
export function parseFullSurveyMarkdown(md: string): FullSurveyResult {
  // 1) frontmatter
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!fmMatch) {
    return { ok: false, error: '缺少 YAML frontmatter（需以 --- 開頭並以 --- 結尾）' }
  }
  const yaml = fmMatch[1]
  const afterFm = md.slice(fmMatch[0].length)

  const getVal = (key: string): string | null => {
    const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(yaml)
    return m ? stripQuotes(m[1]) : null
  }

  const title = (getVal('title') ?? '').trim()
  if (!title) return { ok: false, error: 'frontmatter 缺少 title' }

  const perResponseStr = getVal('perResponse')
  const maxResponsesStr = getVal('maxResponses')
  const deadlineStr = getVal('deadline')
  const minTierStr = getVal('minTier')

  if (!perResponseStr) return { ok: false, error: 'frontmatter 缺少 perResponse' }
  if (!maxResponsesStr) return { ok: false, error: 'frontmatter 缺少 maxResponses' }
  if (!deadlineStr) return { ok: false, error: 'frontmatter 缺少 deadline' }

  const perResponse = Number(perResponseStr)
  if (!Number.isInteger(perResponse) || perResponse <= 0)
    return { ok: false, error: 'perResponse 必須為正整數' }

  const maxResponses = Number(maxResponsesStr)
  if (!Number.isInteger(maxResponses) || maxResponses <= 0)
    return { ok: false, error: 'maxResponses 必須為正整數' }

  const deadlineMs = new Date(deadlineStr).getTime()
  if (isNaN(deadlineMs)) return { ok: false, error: 'deadline 格式無效（需為 ISO 日期字串）' }

  const minTier = minTierStr == null ? 0 : Number(minTierStr)
  if (!Number.isInteger(minTier) || minTier < 0 || minTier > 3) {
    return { ok: false, error: 'minTier 必須為 0-3 的整數' }
  }

  // 2) yaml code block (questions)
  const codeBlockMatch = /^([\s\S]*?)\r?\n```yaml\r?\n([\s\S]*?)\r?\n```/m.exec(afterFm)
  if (!codeBlockMatch) {
    return { ok: false, error: '找不到題目區塊（需用 ```yaml ... ``` 包住 questions:）' }
  }
  const description = codeBlockMatch[1].trim()
  const questionsYaml = codeBlockMatch[2]

  // 3) parse questions block
  const questionsResult = parseQuestionsYaml(questionsYaml)
  if (!questionsResult.ok) return questionsResult
  if (questionsResult.questions.length === 0) {
    return { ok: false, error: '問卷至少需要一題' }
  }

  return {
    ok: true,
    data: {
      title,
      perResponse,
      maxResponses,
      deadlineMs,
      minTier,
      description,
      questions: questionsResult.questions,
    },
  }
}

function parseQuestionsYaml(
  yaml: string,
): { ok: true; questions: Question[] } | { ok: false; error: string } {
  const lines = yaml.split('\n')
  const questions: Question[] = []
  let current: Question | null = null
  let inQuestions = false
  let inOptions = false

  const flush = () => {
    if (current) questions.push(current)
    current = null
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    const trimmed = line.trim()
    if (!trimmed) continue

    if (!inQuestions) {
      if (trimmed.startsWith('questions:')) {
        inQuestions = true
      }
      continue
    }

    // 新題目（以 `  - ` 或 `   - ` 起始）
    if (/^\s{2,3}-\s/.test(line)) {
      flush()
      inOptions = false
      current = { id: '', type: 'text', prompt: '', options_json: null, required: false }
      const content = line.replace(/^\s*-\s*/, '')
      const colonIdx = content.indexOf(':')
      if (colonIdx !== -1) {
        const k = content.slice(0, colonIdx).trim()
        const v = stripQuotes(content.slice(colonIdx + 1))
        applyQuestionField(current, k, v)
      }
      continue
    }

    // 選項列表（以 6/7 空格 - 起始）
    if (/^\s{6,7}-\s/.test(line)) {
      if (inOptions && current) {
        const opt = stripQuotes(trimmed.replace(/^-\s*/, ''))
        if (!current.options_json) current.options_json = []
        current.options_json.push(opt)
      }
      continue
    }

    // 題目內欄位
    const colonIdx = line.indexOf(':')
    if (colonIdx !== -1 && current) {
      const k = line.slice(0, colonIdx).trim()
      const v = stripQuotes(line.slice(colonIdx + 1))
      if (k === 'options') {
        inOptions = true
        current.options_json = []
      } else {
        inOptions = false
        applyQuestionField(current, k, v)
      }
    }
  }

  flush()

  for (const q of questions) {
    if (!q.id) return { ok: false, error: `題目缺少 id：${q.prompt || '(空 prompt)'}` }
    if (!q.prompt) return { ok: false, error: `題目 ${q.id} 缺少 prompt` }
  }

  return { ok: true, questions }
}

function applyQuestionField(q: Question, key: string, value: string): void {
  if (key === 'id') q.id = value
  else if (key === 'type') {
    const t = mapYamlTypeToInternal(value)
    if (t) q.type = t
  } else if (key === 'prompt') q.prompt = value
  else if (key === 'required') q.required = value === 'true'
}

export interface SerializeOptions {
  /** ISO 字串；不傳則使用當下時間。預覽期應鎖定，submit 時刷新。 */
  draftStamp?: string
}

/**
 * 將 FullSurveyData 序列化為三段式 markdown。
 * 嚴格輸出（key 順序固定、縮排固定、字串雙引號）以保證 schema_hash 可重現。
 */
export function serializeFullSurveyToMarkdown(
  data: FullSurveyData,
  opts: SerializeOptions = {},
): string {
  const draftStamp = opts.draftStamp ?? new Date().toISOString()
  const deadlineIso = new Date(data.deadlineMs).toISOString()

  const fmLines = [
    '---',
    `title: ${quoteString(data.title)}`,
    `perResponse: ${data.perResponse}`,
    `maxResponses: ${data.maxResponses}`,
    `deadline: ${quoteString(deadlineIso)}`,
    `minTier: ${data.minTier}`,
    `draftStamp: ${quoteString(draftStamp)}`,
    '---',
  ]

  const questionLines: string[] = ['```yaml', 'questions:']
  for (const q of data.questions) {
    questionLines.push(`  - id: ${quoteString(q.id)}`)
    questionLines.push(`    type: ${QUESTION_TYPE_TO_YAML[q.type]}`)
    questionLines.push(`    prompt: ${quoteString(q.prompt)}`)
    questionLines.push(`    required: ${q.required ? 'true' : 'false'}`)
    if (q.options_json && q.options_json.length > 0) {
      questionLines.push('    options:')
      for (const opt of q.options_json) {
        questionLines.push(`      - ${quoteString(opt)}`)
      }
    }
  }
  questionLines.push('```')

  const description = data.description.trim()
  const parts = [fmLines.join('\n'), '']
  if (description) {
    parts.push(description, '')
  }
  parts.push(questionLines.join('\n'), '')

  return parts.join('\n')
}

function quoteString(s: string): string {
  // 移除換行，避免破壞 YAML 結構
  const safe = s.replace(/\r?\n/g, ' ').replace(/"/g, '\\"')
  return `"${safe}"`
}

/** 產生空白範本資料（給範本下載與 Builder 初始 state 用）。 */
export function makeBlankSurveyData(): FullSurveyData {
  const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // 60 天後
  return {
    title: '問卷標題',
    perResponse: 10,
    maxResponses: 100,
    deadlineMs: future.getTime(),
    minTier: 0,
    description: '在這裡撰寫問卷說明文字…',
    questions: [
      {
        id: 'q1',
        type: 'single_choice',
        prompt: '您最喜歡 Sui 的哪個特性？',
        options_json: ['Move 語言', 'Object model', '低 gas'],
        required: true,
      },
    ],
  }
}
