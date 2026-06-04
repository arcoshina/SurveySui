import { readFileSync } from 'node:fs'

/**
 * Resolved counting scope for SurveyPass gas sponsorship.
 *
 * 免費額度沒有獨立資料表，而是即時數鏈上歷史（見 sponsorLedger.ts）。此型別
 * 把「要數哪些交易」抽成一組具體條件，由單一 env `SPONSOR_COUNT_SCOPE` 決定。
 */
export interface SponsorCountScope {
  /** 僅計入 MoveCall package 等於此 id 的代付交易；null = 不過濾 package。 */
  packageId: string | null
  /** > 0 時只計入 timestampMs >= sinceMs 的交易；0 = 不過濾時間。 */
  sinceMs: number
  /** 每錢包終身代付上限。 */
  passMax: number
}

const DEFAULT_PASS_MAX = 2

function currentPackageId(): string | null {
  return process.env.SUI_PACKAGE_ID ?? null
}

function defaultScope(): SponsorCountScope {
  return { packageId: currentPackageId(), sinceMs: 0, passMax: DEFAULT_PASS_MAX }
}

/** 解析 ISO-8601 字串或 epoch-ms 數字成 epoch ms；失敗回 NaN。 */
function parseSinceMs(raw: string): number {
  if (/^\d+$/.test(raw)) return Number(raw)
  const t = Date.parse(raw)
  return Number.isNaN(t) ? NaN : t
}

function looksLikePath(raw: string): boolean {
  return (
    raw.startsWith('file:') ||
    raw.endsWith('.json') ||
    raw.startsWith('./') ||
    raw.startsWith('../') ||
    raw.startsWith('/') ||
    raw.startsWith('.\\') ||
    raw.startsWith('..\\')
  )
}

interface PolicyFileShape {
  packageScope?: 'current' | 'all'
  sinceMs?: number
  passMax?: number
}

function loadPolicyFile(raw: string): SponsorCountScope {
  const path = raw.startsWith('file:') ? raw.slice('file:'.length) : raw
  const base = defaultScope()
  try {
    const json = JSON.parse(readFileSync(path, 'utf8')) as PolicyFileShape
    const packageId =
      json.packageScope === 'all'
        ? null
        : json.packageScope === 'current'
          ? currentPackageId()
          : base.packageId
    return {
      packageId,
      sinceMs: typeof json.sinceMs === 'number' && json.sinceMs > 0 ? json.sinceMs : base.sinceMs,
      passMax: typeof json.passMax === 'number' && json.passMax > 0 ? json.passMax : base.passMax,
    }
  } catch (err) {
    console.warn(
      `[sponsorPolicy] failed to load policy file "${path}", falling back to default scope:`,
      (err as Error)?.message
    )
    return base
  }
}

/**
 * 把單一 env `SPONSOR_COUNT_SCOPE` 解析成具體計數條件：
 *  - 未設 / 空 → 只數當前 package（安全預設）
 *  - "all"     → 不過濾 package 與時間（= 舊行為）
 *  - 時間值（epoch ms 或 ISO 字串）→ 當前 package，且只數該時間之後的交易
 *  - 檔案路徑（.json / file: 前綴）→ 載入 JSON 規則檔覆寫上述欄位
 * 任何解析失敗一律 fallback 預設（絕不放寬成 all）。
 */
export function resolveCountScope(rawInput?: string): SponsorCountScope {
  const raw = (rawInput ?? process.env.SPONSOR_COUNT_SCOPE ?? '').trim()
  if (!raw) return defaultScope()
  if (raw.toLowerCase() === 'all') {
    return { packageId: null, sinceMs: 0, passMax: DEFAULT_PASS_MAX }
  }
  if (looksLikePath(raw)) return loadPolicyFile(raw)

  const sinceMs = parseSinceMs(raw)
  if (Number.isNaN(sinceMs) || sinceMs <= 0) {
    console.warn(
      `[sponsorPolicy] unrecognised SPONSOR_COUNT_SCOPE="${raw}", falling back to default (current package).`
    )
    return defaultScope()
  }
  return { packageId: currentPackageId(), sinceMs, passMax: DEFAULT_PASS_MAX }
}
