import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSuiClient, useSuiClientQuery } from '@mysten/dapp-kit'
import type { SuiClient } from '@mysten/sui/client'
import { AlertTriangle, Info } from 'lucide-react'
import {
  aggregateStats,
  decodeAllPlainResponses,
  fetchClaimedEvents,
  type DashboardStats,
  type SurveyClaimedEvent,
  type DecryptedResponse,
} from '../lib/dashboardDecrypt'
import { parseFullSurveyMarkdown, type Question, type FullSurveyData, sanitizeQuestionIds } from '../lib/frontmatter'
import { parseContentBlob } from '../lib/crypto'
import { normalizeBytes, bytesToHex } from '../lib/answerCodec'
import { useT } from '../i18n'
import { downloadFromDecentralizedStorage } from '../lib/storage'

function normalizeSuiId(id: string): string {
  if (!id) return ''
  let cleaned = id.toLowerCase().trim()
  if (cleaned.startsWith('0x')) {
    cleaned = cleaned.slice(2)
  }
  return cleaned.padStart(64, '0')
}

function getOptionVec(opt: any): Uint8Array | null {
  if (!opt) return null
  if (Array.isArray(opt)) {
    if (opt.length === 0) return null
    const first = opt[0]
    if (Array.isArray(first)) {
      return new Uint8Array(first.map(Number))
    } else if (typeof first === 'string') {
      return new Uint8Array(first.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || [])
    }
    return new Uint8Array(opt.map(Number))
  }
  const vec = opt.fields?.vec || opt.vec
  if (!Array.isArray(vec) || vec.length === 0) return null
  const first = vec[0]
  if (Array.isArray(first)) {
    return new Uint8Array(first.map(Number))
  } else if (typeof first === 'string') {
    return new Uint8Array(first.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || [])
  } else if (typeof (vec as any) === 'string') {
    return new Uint8Array((vec as any).match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || [])
  }
  return new Uint8Array(vec.map(Number))
}

function formatDateTime(ms: number) {
  if (!ms) return null
  const d = new Date(ms)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const offsetMin = -d.getTimezoneOffset()
  const offsetHours = Math.floor(Math.abs(offsetMin) / 60)
  const sign = offsetMin >= 0 ? '+' : '-'
  const tz = `UTC${sign}${offsetHours}`
  return {
    date: `${yyyy}/${mm}/${dd}`,
    time: `${hh}:${min}`,
    tz
  }
}

function getPackageId(): string {
  return import.meta.env.VITE_PACKAGE_ID ?? ''
}

function formatValidCount(count: number): string {
  if (count >= 10000) {
    const kVal = Math.round(count / 1000)
    return `${kVal}k`
  }
  return String(count)
}

export default function ResultsPage() {
  const { vaultId } = useParams<{ vaultId: string }>()
  const suiClient = useSuiClient()
  const t = useT('results')
  const [surveyTitle, setSurveyTitle] = useState<string>('')

  // ── 鏈上 vault 物件 ────────────────────────────────────────────────────────
  const { data: vaultData, isLoading: isVaultLoading } = useSuiClientQuery(
    'getObject',
    { id: vaultId ?? '', options: { showContent: true } },
    { enabled: !!vaultId }
  )

  const vault = useMemo(() => {
    const content = (
      vaultData as { data?: { content?: { dataType: string; fields: any } } } | undefined
    )?.data?.content
    if (!content || content.dataType !== 'moveObject') return null
    return content.fields
  }, [vaultData])

  // ── SurveyClaimed events ───────────────────────────────────────────────────
  const [events, setEvents] = useState<SurveyClaimedEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  // ── 鏈上 survey 物件 ────────────────────────────────────────────────────────
  const [surveyId, setSurveyId] = useState<string | null>(null)
  const [surveyResolveFailed, setSurveyResolveFailed] = useState(false)
  const [surveyData, setSurveyData] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [surveyMeta, setSurveyMeta] = useState<{
    allowedSources: number[]
    allowedNftType: string | null
    repeatReward: number
    repeatMaxTimes: number
    perResponse: number
    deadlineMs: number
    encryptAnswers: boolean
  } | null>(null)
  const [schemaHashStr, setSchemaHashStr] = useState<string>('')
  const [resolvingSurvey, setResolvingSurvey] = useState(false)

  // 1. 查詢 Registry 得到 survey_id
  useEffect(() => {
    if (!vaultId) return
    let cancelled = false
    setSurveyResolveFailed(false)
    setResolvingSurvey(true)

    async function resolveSurvey() {
      if (
        !suiClient ||
        typeof suiClient.queryEvents !== 'function' ||
        typeof suiClient.getObject !== 'function'
      )
        return
      try {
        let cursor: any = null
        let hit: any = null
        let pageCount = 0
        do {
          const res = await suiClient.queryEvents({
            query: {
              MoveEventType: `${getPackageId()}::survey_registry::SurveyRegistered`,
            },
            cursor,
            limit: 50,
            order: 'descending',
          })
          hit = res.data.find(
            (e: any) =>
              e.parsedJson &&
              normalizeSuiId(e.parsedJson.vault_id) === normalizeSuiId(vaultId ?? '')
          )
          if (hit) break
          cursor = res.hasNextPage ? res.nextCursor : null
          pageCount++
        } while (cursor && pageCount < 10)

        if (hit && !cancelled) {
          const sId = hit.parsedJson.survey_id
          setSurveyId(sId)
          const obj = await suiClient.getObject({
            id: sId,
            options: { showContent: true },
          })
          if (obj.data && !cancelled) {
            setSurveyData(obj.data)
          }
        } else if (!cancelled) {
          setSurveyResolveFailed(true)
        }
      } catch (err) {
        console.error('[ResultsPage] Failed to resolve survey:', err)
        if (!cancelled) setSurveyResolveFailed(true)
      } finally {
        if (!cancelled) setResolvingSurvey(false)
      }
    }
    void resolveSurvey()
    return () => {
      cancelled = true
    }
  }, [vaultId, suiClient])

  // 2. 解析 Survey Markdown 題目
  useEffect(() => {
    if (!surveyData) return
    const fields = surveyData.content?.fields as any
    if (!fields) return

    let hashBytes = fields.schema_hash ? normalizeBytes(fields.schema_hash) : new Uint8Array(0)
    const newHash = bytesToHex(hashBytes)
    setSchemaHashStr(newHash)

    function applyMeta(data: FullSurveyData) {
      setSurveyMeta({
        allowedSources: data.allowedSources,
        allowedNftType: data.allowedNftType || null,
        repeatReward: data.repeatReward,
        repeatMaxTimes: data.repeatMaxTimes,
        perResponse: data.perResponse,
        deadlineMs: data.deadlineMs,
        encryptAnswers: data.encryptAnswers,
      })
    }

    async function loadQuestions() {
      try {
        const surveyBlobIdBytes = getOptionVec(fields.survey_blob_id)
        let rawContent: Uint8Array

        if (surveyBlobIdBytes) {
          const blobId = new TextDecoder().decode(surveyBlobIdBytes)
          rawContent = await downloadFromDecentralizedStorage(blobId)
        } else {
          const encryptedContentBytes = getOptionVec(fields.encrypted_content)
          if (!encryptedContentBytes) {
            throw new Error('Survey content data corrupted')
          }
          rawContent = encryptedContentBytes
        }

        const parsedBlob = parseContentBlob(rawContent)
        if (parsedBlob.version === 0x00) {
          // 公開問卷 (明文)：與 SurveyPage 走同一條解析路徑
          const parsed = parseFullSurveyMarkdown(parsedBlob.markdown || '')
          if (parsed.ok) {
            setQuestions(sanitizeQuestionIds(parsed.data.questions))
            applyMeta(parsed.data)
            if (parsed.data.title) {
              setSurveyTitle(parsed.data.title)
            }
          }
        } else {
          // 加密／legacy：結果頁只服務公開問卷，標記為加密以顯示警告畫面、不抓事件
          setSurveyMeta({
            allowedSources: [],
            allowedNftType: null,
            repeatReward: 0,
            repeatMaxTimes: 0,
            perResponse: 0,
            deadlineMs: 0,
            encryptAnswers: true,
          })
        }
      } catch (err) {
        console.error('[ResultsPage] Failed to parse survey questions:', err)
      }
    }

    void loadQuestions()
  }, [surveyData])

  // 3. 獲取填答 Events (僅在確認 encryptAnswers === false 時執行)
  useEffect(() => {
    if (!vaultId || !getPackageId() || !surveyMeta || surveyMeta.encryptAnswers !== false) return
    let cancelled = false
    setLoadingEvents(true)

    fetchClaimedEvents(suiClient as unknown as SuiClient, vaultId, getPackageId())
      .then((evs) => {
        if (!cancelled) {
          setEvents(evs)
          setLoadingEvents(false)
        }
      })
      .catch((err: unknown) => {
        console.error('[ResultsPage] Failed to fetch events:', err)
        if (!cancelled) setLoadingEvents(false)
      })

    return () => {
      cancelled = true
    }
  }, [vaultId, suiClient, surveyMeta])

  // 4. 解析與統計明文數據
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [decryptedResponses, setDecryptedResponses] = useState<DecryptedResponse[] | null>(null)

  useEffect(() => {
    if (surveyMeta?.encryptAnswers === false && questions && events && schemaHashStr) {
      try {
        const { responses } = decodeAllPlainResponses(events, questions, schemaHashStr)
        const s = aggregateStats(responses, events.length)
        setStats(s)
        setDecryptedResponses(responses)
      } catch (err) {
        console.error('[ResultsPage] Failed to decode plain responses:', err)
      }
    }
  }, [surveyMeta?.encryptAnswers, questions, events, schemaHashStr])

  // 5. 匯出 CSV (不包含 Respondent) - 已經移除

  // ── 載入中 / 錯誤 狀態渲染 ──────────────────────────────────────────────────
  const isResolving = isVaultLoading || resolvingSurvey || loadingEvents
  const hasError = surveyResolveFailed || !vaultId

  if (isResolving && !surveyMeta) {
    return (
      <main className="w-full flex-1 p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl p-8 text-center space-y-4 animate-fadeIn w-full">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p aria-live="polite" className="text-muted">
            {t.loading}
          </p>
        </div>
      </main>
    )
  }

  if (hasError) {
    return (
      <main className="w-full flex-1 p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="alert-error p-8 text-center space-y-4 flex flex-col items-center justify-center w-full animate-fadeIn">
          <AlertTriangle size={24} className="text-rose-800 dark:text-rose-300" />
          <p role="alert" className="text-sm font-normal">
            {t.errLoadFailed}
          </p>
        </div>
      </main>
    )
  }

  // 若為加密問卷，則拒絕公開存取
  const isEncrypted = surveyMeta && surveyMeta.encryptAnswers !== false

  if (isEncrypted) {
    return (
      <main className="w-full flex-1 p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl p-8 text-center space-y-5 animate-fadeIn w-full">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500 border border-blue-100 dark:border-blue-900/30">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-h2">{t.protectedData}</h2>
          <div className="alert-info p-4 text-left leading-relaxed w-full">
            <p role="alert" className="text-sm font-normal">
              {t.errEncrypted}
            </p>
          </div>
          {surveyId && (
            <Link
              to={`/s/${surveyId}`}
              className="btn-secondary w-full inline-block"
            >
              {t.backToSurvey}
            </Link>
          )}
        </div>
      </main>
    )
  }

  const responseCount = events.length
  const maxResponses = vault ? Number(vault.max_responses) : 0
  const displayTitle = surveyTitle || t.title

  return (
    <main className="w-full flex-1 p-4 sm:p-8 max-w-4xl mx-auto text-slate-800 dark:text-neutral-300">
      <h1 className="text-h1 mb-2 pb-1.5">{displayTitle}</h1>
      <p className="text-muted mb-6">{t.subtitle}</p>

      {/* ── 基本資訊與統計卡片 ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-100 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-muted">{t.statResponseCount}</p>
          <p className="text-h2 mt-2 font-mono tracking-tight text-right" aria-label="response-count">
            {responseCount}
          </p>
        </div>
        <div className="bg-slate-100 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-muted">{t.statResponseProgress}</p>
          <p className="text-h2 mt-2 font-mono tracking-tight text-right">
            {responseCount} / {maxResponses || '—'}
          </p>
        </div>
        <div className="bg-slate-100 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-muted">{t.statDeadline}</p>
          {surveyMeta && surveyMeta.deadlineMs ? (
            (() => {
              const dt = formatDateTime(surveyMeta.deadlineMs)
              if (!dt) return <p className="text-h2 mt-2 font-mono tracking-tight text-right">—</p>
              return (
                <div className="mt-2 font-mono tracking-tight text-right">
                  <p className="text-h2">{dt.date}</p>
                  <p className="text-h3 text-muted mt-1">
                    {dt.time} <span className="ml-1">{dt.tz}</span>
                  </p>
                </div>
              )
            })()
          ) : (
            <p className="text-h2 mt-2 font-mono tracking-tight text-right">—</p>
          )}
        </div>
      </div>

      {/* ── 統計圖表渲染區 ─────────────────────────────────────────────── */}
      {responseCount === 0 ? (
        <div className="bg-slate-100 dark:bg-neutral-900 rounded p-6 text-center text-slate-600 dark:text-neutral-400 mb-6 transition-colors">
          {t.noResponses}
        </div>
      ) : (
        <section className="mb-6 space-y-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-h3">
                {t.responsesTitlePublic}
              </h3>
              <span className="text-sm text-muted font-mono">
                {t.displayCount(responseCount)}
              </span>
            </div>
          </div>

          {decryptedResponses && questions && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
              {questions.map((q, idx) => {
                const questionStats = stats?.questions?.[q.id]
                const totalAnswers = stats?.decrypted_count || 0

                if (q.type === 'scale') {
                  const validScores = decryptedResponses
                    ?.map((resp) => resp.answers[q.id])
                    .filter((val) => val !== undefined && val !== null && val !== '')
                    .map(Number)
                    .filter((num) => !isNaN(num)) || []
                  const totalValid = validScores.length

                  if (totalValid === 0) {
                    return (
                      <div
                        key={q.id}
                        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 transition-colors shadow-xs"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-sm font-normal ${q.required ? 'text-rose-800 dark:text-rose-400/80' : 'text-slate-700 dark:text-neutral-200'}`}>
                            {t.questionIndex(idx + 1)}
                          </span>
                          <span className="badge-decentralized">
                            {t.questionTypeScale}
                          </span>
                        </div>
                        <h4 className="text-base font-normal text-slate-900 dark:text-neutral-100 mb-4 break-words">
                          {q.prompt}
                        </h4>
                        <p className="text-sm text-slate-400 dark:text-neutral-500 italic">
                          無填答數據
                        </p>
                      </div>
                    )
                  }

                  const avg = (validScores.reduce((sum, val) => sum + val, 0) / totalValid).toFixed(1)
                  const pct = (Number(avg) / 5) * 100

                  return (
                    <div
                      key={q.id}
                      className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 transition-colors shadow-xs"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-sm font-normal ${q.required ? 'text-rose-800 dark:text-rose-400/80' : 'text-slate-700 dark:text-neutral-200'}`}>
                          {t.questionIndex(idx + 1)}
                        </span>
                        <span className="badge-decentralized">
                          {t.questionTypeScale}
                        </span>
                      </div>
                      <h4 className="text-base font-normal text-slate-900 dark:text-neutral-100 mb-4 break-words">
                        {q.prompt}
                      </h4>

                      <div className="space-y-2.5">
                        <div className="flex items-baseline justify-start gap-1.5">
                          <span className="text-2xl font-normal text-slate-900 dark:text-neutral-100 font-mono tracking-tight">
                            {avg}
                          </span>
                          <span className="text-sm text-slate-400 dark:text-neutral-500 font-normal font-mono">
                            ({formatValidCount(totalValid)})
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-neutral-800/80 rounded-full h-4 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500 bg-blue-600 dark:bg-blue-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                }

                if (q.type === 'text') {
                  return (
                    <div
                      key={q.id}
                      className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 transition-colors shadow-xs"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-sm font-normal ${q.required ? 'text-rose-800 dark:text-rose-400/80' : 'text-slate-700 dark:text-neutral-200'}`}>
                          {t.questionIndex(idx + 1)}
                        </span>
                        <span className="chip-optional">
                          {t.questionTypeText}
                        </span>
                      </div>
                      <h4 className="text-base font-normal text-slate-900 dark:text-neutral-100 mb-3 break-words">
                        {q.prompt}
                      </h4>
                      <div className="alert-info flex items-start gap-2.5 leading-relaxed">
                        <Info size={18} className="text-blue-800 dark:text-blue-300 flex-shrink-0 mt-0.5" />
                        <span>{t.textAnswersHiddenInfo}</span>
                      </div>
                    </div>
                  )
                }

                const options = q.options_json || []
                const counts = questionStats?.counts || {}

                const displayOptions =
                  options.length > 0
                    ? options
                    : Object.keys(counts).sort((a, b) => (counts[b] || 0) - (counts[a] || 0))

                const typeLabel =
                  q.type === 'single_choice'
                    ? t.questionTypeSingle
                    : q.type === 'multi_choice'
                      ? t.questionTypeMulti
                      : t.questionTypeScale

                return (
                  <div
                    key={q.id}
                    className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 transition-colors shadow-xs"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-sm font-normal ${q.required ? 'text-rose-800 dark:text-rose-400/80' : 'text-slate-700 dark:text-neutral-200'}`}>
                        {t.questionIndex(idx + 1)}
                      </span>
                      <span className="badge-decentralized">
                        {typeLabel}
                      </span>
                    </div>
                    <h4 className="text-base font-normal text-slate-900 dark:text-neutral-100 mb-4 break-words">
                      {q.prompt}
                    </h4>

                    <div className="space-y-4">
                      {q.options_json?.map((opt, optIdx) => {
                        const count = counts[String(optIdx)] || counts[optIdx] || 0
                        const pct = totalAnswers > 0 ? (count / totalAnswers) * 100 : 0
                        const displayPct = pct.toFixed(1)

                        return (
                          <div key={opt} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-800 dark:text-neutral-200 font-normal break-all pr-4">
                                {opt}
                              </span>
                              <span className="text-slate-500 dark:text-neutral-400 text-sm font-mono whitespace-nowrap">
                                {count} 次 ({displayPct}%)
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-neutral-800/80 rounded-full h-3 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500 bg-blue-600 dark:bg-blue-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}

                      {displayOptions.length === 0 && (
                        <p className="text-sm text-slate-400 dark:text-neutral-500 italic">
                          無填答數據
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

    </main>
  )
}
