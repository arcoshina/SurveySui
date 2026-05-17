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
