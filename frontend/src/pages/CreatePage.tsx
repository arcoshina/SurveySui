import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, AlertTriangle, Plus, Info } from 'lucide-react'
import { useCurrentAccount, useSuiClientQuery } from '@mysten/dapp-kit'
import {
  type FullSurveyData,
  type Question,
  type QuestionType,
  makeBlankSurveyData,
  parseFullSurveyMarkdown,
  serializeFullSurveyToMarkdown,
} from '../lib/frontmatter'
import { SSR_BASE_PER_UNIT, computeSsrOut, estimateFundCostV2, PURGE_GRACE_MS } from '../lib/ptb'
import { getTicketFeeMist } from '../lib/ticketFee'
import { formatSsr, formatSui, formatFullPrecision, formatSuiFullPrecision } from '../lib/format'
import { useT } from '../i18n'
import { probeGasSponsorHealth, type GasHealth } from '../lib/sponsoredTx'

const DRAFT_KEY_PREFIX = 'surveysui:draft:'

function makeDraftId(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined
  if (cryptoObj?.randomUUID) return `draft-${cryptoObj.randomUUID()}`
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function nextQuestionId(questions: Question[]): string {
  let max = 0
  for (const q of questions) {
    const m = /^q(\d+)$/.exec(q.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `q${max + 1}`
}

function deadlineMsToLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getLocalUtcOffsetLabel(): string {
  const offsetMin = -new Date().getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`
}

interface DraftEntry {
  contentMd: string
  encrypt?: boolean
  savedAt: number
}

function readDraft(draftId: string | undefined): DraftEntry | null {
  if (!draftId) return null
  try {
    const raw = window.localStorage.getItem(`${DRAFT_KEY_PREFIX}${draftId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftEntry
    if (typeof parsed?.contentMd !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export default function CreatePage() {
  const navigate = useNavigate()
  const { draftId } = useParams<{ draftId: string }>()
  const [data, setData] = useState<FullSurveyData>(makeBlankSurveyData)
  const [limitNft, setLimitNft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = useT('create')
  const purgeGraceDays = Math.max(1, Math.round(Number(PURGE_GRACE_MS) / 86_400_000))

  const maxDeadlineMs = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 3)
    return d.getTime()
  }, [])

  const deadlineErrorMsg = useMemo(() => {
    if (!data.deadlineMs || isNaN(data.deadlineMs)) return null
    if (data.deadlineMs <= Date.now()) {
      return t.errDeadlineFuture
    }
    const maxDeadline = new Date()
    maxDeadline.setMonth(maxDeadline.getMonth() + 3)
    if (data.deadlineMs > maxDeadline.getTime()) {
      return t.errDeadlineMaxExceeded
    }
    return null
  }, [data.deadlineMs, t.errDeadlineFuture, t.errDeadlineMaxExceeded])

  const TYPE_LABELS_INFO: Record<QuestionType, { label: string }> = {
    single_choice: { label: t.typeSingleChoice },
    multi_choice: { label: t.typeMultiChoice },
    text: { label: t.typeText },
    scale: { label: t.typeScaleShort },
  }

  useEffect(() => {
    if (draftId) {
      const entry = readDraft(draftId)
      if (entry) {
        const result = parseFullSurveyMarkdown(entry.contentMd)
        if (result.ok) {
          setData(result.data)
          setLimitNft(!!result.data.allowedNftType)
        }
      }
    }
  }, [draftId])

  // 預覽期鎖定 draftStamp，避免 hash 飄動
  const previewDraftStamp = useMemo(() => new Date().toISOString(), [])

  const account = useCurrentAccount()
  const packageId = import.meta.env.VITE_PACKAGE_ID ?? ''
  const poolId = import.meta.env.VITE_AMM_POOL_ID ?? ''

  const { data: poolData } = useSuiClientQuery(
    'getObject',
    { id: poolId, options: { showContent: true } },
    { enabled: !!poolId }
  )

  const { data: coinsData } = useSuiClientQuery(
    'getCoins',
    {
      owner: account?.address ?? '',
      coinType: `${packageId}::stacked_survey_reward::STACKED_SURVEY_REWARD`,
    },
    { enabled: !!account && !!packageId }
  )

  const poolReserves = useMemo(() => {
    if (poolData?.data?.content?.dataType !== 'moveObject') {
      return { suiReserve: 0n, srReserve: 0n }
    }
    const fields = (poolData.data.content as { fields: Record<string, string> }).fields
    return {
      suiReserve: BigInt(fields.sui_reserve ?? '0'),
      srReserve: BigInt(fields.sr_reserve ?? '0'),
    }
  }, [poolData])

  const feeConfig = useMemo(() => {
    if (poolData?.data?.content?.dataType !== 'moveObject') {
      return { totalFeeBps: 2000n, discountBps: 5000n }
    }
    const fields = (poolData.data.content as { fields: Record<string, any> }).fields
    const feeFields = fields?.fee_config?.fields
    if (!feeFields) return { totalFeeBps: 2000n, discountBps: 5000n }
    return {
      totalFeeBps: BigInt(feeFields.total_fee_bps ?? '2000'),
      discountBps: BigInt(feeFields.discount_bps ?? '5000'),
    }
  }, [poolData])

  const creatorSsrBalance = useMemo(() => {
    if (!coinsData) return 0n
    return coinsData.data.reduce((sum, c) => sum + BigInt(c.balance), 0n)
  }, [coinsData])

  const [gasHealth, setGasHealth] = useState<GasHealth | null>(null)

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BFF_URL ?? ''
    void probeGasSponsorHealth({ backendUrl }).then((res) => {
      setGasHealth(res)
    })
  }, [])

  const gasCompensationAmount = useMemo(() => {
    if (!gasHealth?.available) return 0n
    return BigInt(gasHealth.gasCompensationAmount ?? '0')
  }, [gasHealth])

  const ticketFeeMist = useMemo(() => getTicketFeeMist(), [])

  const requiredGas = useMemo(() => {
    if (data.perResponse <= 0 || data.maxResponses <= 0 || !gasCompensationAmount) return 0n
    const repeatMaxTimes = BigInt(data.repeatMaxTimes ?? 1)
    const perResponseGasAndFee = gasCompensationAmount + ticketFeeMist
    if (data.repeatReward > 0) {
      return BigInt(data.maxResponses) * (1n + repeatMaxTimes) * perResponseGasAndFee
    } else {
      return BigInt(data.maxResponses) * perResponseGasAndFee
    }
  }, [data.perResponse, data.maxResponses, data.repeatReward, data.repeatMaxTimes, ticketFeeMist, gasCompensationAmount])

  const currentRate = useMemo(() => {
    const { suiReserve, srReserve } = poolReserves
    const oneSui = 1_000_000_000n
    const ssrBase = computeSsrOut(oneSui, suiReserve, srReserve)
    return Number(ssrBase) / Number(SSR_BASE_PER_UNIT)
  }, [poolReserves])

  const totalSsrNum = useMemo(() => {
    const repeatMaxTimes = BigInt(data.repeatMaxTimes ?? 1)
    const base = BigInt(data.perResponse * data.maxResponses)
    const repeat = BigInt(data.repeatReward * data.maxResponses) * repeatMaxTimes
    return base + repeat
  }, [data.perResponse, data.maxResponses, data.repeatReward, data.repeatMaxTimes])

  const SURVEY_SIZE_THRESHOLD_KB = Number(import.meta.env.VITE_SURVEY_SIZE_THRESHOLD_KB || '10')

  const serializedSurvey = useMemo(() => {
    try {
      return serializeFullSurveyToMarkdown(data, { draftStamp: previewDraftStamp })
    } catch {
      return ''
    }
  }, [data, previewDraftStamp])

  const surveySizeKb = useMemo(() => {
    const bytes = new TextEncoder().encode(serializedSurvey).length
    return bytes / 1024
  }, [serializedSurvey])

  const isLargeSurvey = useMemo(() => {
    return surveySizeKb > SURVEY_SIZE_THRESHOLD_KB
  }, [surveySizeKb, SURVEY_SIZE_THRESHOLD_KB])

  const [costBreakdown, setCostBreakdown] = useState<{
    netSsrBase: bigint
    effectiveFeeBps: bigint
    feeBase: bigint
    grossSsrBase: bigint
    offsetIn: bigint
    minted: bigint
    suiToInvest: bigint
  } | null>(null)

  useEffect(() => {
    if (data.perResponse <= 0 || data.maxResponses <= 0) {
      setCostBreakdown(null)
      return
    }
    const timer = setTimeout(() => {
      try {
        const est = estimateFundCostV2({
          perResponse: BigInt(data.perResponse),
          repeatReward: BigInt(data.repeatReward),
          repeatMaxTimes: data.repeatMaxTimes,
          maxResponses: data.maxResponses,
          suiReserve: poolReserves.suiReserve,
          srReserve: poolReserves.srReserve,
          feeConfig,
          creatorSsrBalance,
        })

        setCostBreakdown(est)
      } catch (e) {
        console.error(e)
        setCostBreakdown(null)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [
    data.perResponse,
    data.repeatReward,
    data.repeatMaxTimes,
    data.maxResponses,
    poolReserves,
    feeConfig,
    creatorSsrBalance,
  ])

  // ── 表單更新 helpers ────────────────────────────────────────────────────────

  function updateField<K extends keyof FullSurveyData>(key: K, value: FullSurveyData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  // 預載空字串
  function updateQuestion(index: number, patch: Partial<Question>) {
    setData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    }))
  }

  function addQuestion() {
    setData((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          id: nextQuestionId(prev.questions),
          type: 'single_choice',
          prompt: '',
          options_json: ['', ''],
          required: false,
          shuffle: false,
        },
      ],
    }))
  }

  // 預載空字串
  function deleteQuestion(index: number) {
    setData((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== index) }))
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setData((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.questions.length) return prev
      const next = [...prev.questions]
        ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, questions: next }
    })
  }

  function changeQuestionType(index: number, newType: QuestionType) {
    const needsOptions = newType === 'single_choice' || newType === 'multi_choice'
    setData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i !== index) return q
        const { maxLen, ...rest } = q
        void maxLen
        return {
          ...rest,
          type: newType,
          options_json: needsOptions
            ? (q.options_json ?? ['', ''])
            : null,
          ...(newType === 'text' ? { maxLen: 100 } : {}),
        }
      }),
    }))
  }

  function updateOption(qIndex: number, optIndex: number, value: string) {
    setData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => {
        if (i !== qIndex || !q.options_json) return q
        const opts = [...q.options_json]
        opts[optIndex] = value
        return { ...q, options_json: opts }
      }),
    }))
  }

  function addOption(qIndex: number) {
    setData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === qIndex && q.options_json ? { ...q, options_json: [...q.options_json, ''] } : q
      ),
    }))
  }

  function removeOption(qIndex: number, optIndex: number) {
    setData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === qIndex && q.options_json
          ? { ...q, options_json: q.options_json.filter((_, j) => j !== optIndex) }
          : q
      ),
    }))
  }

  // ── 上傳 / 下載 / 範本 ─────────────────────────────────────────────────────

  function downloadMd(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 預覽期鎖定 draftStamp，避免 hash 飄動
  function handleDownloadDraft() {
    const md = serializeFullSurveyToMarkdown(data, { draftStamp: previewDraftStamp })
    const date = new Date().toISOString().slice(0, 10)
    const slug = data.title.replace(/[^\w一-龥-]+/g, '-').slice(0, 40) || 'survey'
    downloadMd(md, `survey-${slug}-${date}.md`)
  }

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const result = parseFullSurveyMarkdown(text)
      if (!result.ok) {
        setError(t.errUploadParseFailed.replace('{error}', result.error))
        return
      }
      const ok = window.confirm(t.confirmOverwrite)
      if (!ok) return
      setData(result.data)
      setError(null)
    }
    reader.onerror = () => setError(t.errReadFileFailed)
    reader.readAsText(file)
    e.target.value = '' // 允許重複上傳同名檔案
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!data.title.trim()) return t.errTitleRequired
    if (!Number.isInteger(data.perResponse) || data.perResponse <= 0)
      return t.errPerResponsePositive
    if (!Number.isInteger(data.repeatReward) || data.repeatReward < 0)
      return t.errRepeatRewardNonNegative
    if (!Number.isInteger(data.repeatMaxTimes) || data.repeatMaxTimes < 1)
      return t.errRepeatMaxTimesPositive
    if (!Number.isInteger(data.maxResponses) || data.maxResponses <= 0)
      return t.errMaxResponsesPositive
    if (!data.deadlineMs || isNaN(data.deadlineMs)) return t.errDeadlineInvalid
    if (data.deadlineMs <= Date.now()) return t.errDeadlineFuture
    const maxDeadline = new Date()
    maxDeadline.setMonth(maxDeadline.getMonth() + 3)
    if (data.deadlineMs > maxDeadline.getTime()) return t.errDeadlineMaxExceeded
    if ((!data.allowedSources || data.allowedSources.length === 0) && !limitNft) {
      return t.errAllowedSourcesRequired
    }
    if (limitNft) {
      if (!data.allowedNftType || !data.allowedNftType.trim()) {
        return t.errAllowedNftTypeRequired
      }
      const nftTypeRegex = /^0x[a-fA-F0-9]+::[a-zA-Z0-9_]+::[a-zA-Z0-9_]+$/
      if (!nftTypeRegex.test(data.allowedNftType.trim())) {
        return t.errAllowedNftTypeInvalid
      }
    }
    if (data.questions.length === 0) return t.errQuestionRequired
    for (const q of data.questions) {
      if (!q.id.trim()) return t.errQuestionIdRequired
      if (!q.prompt.trim()) return t.errQuestionPromptRequired.replace('{id}', q.id)
      if (q.type === 'single_choice' || q.type === 'multi_choice') {
        if (!q.options_json || q.options_json.length === 0) {
          return t.errOptionRequired.replace('{id}', q.id)
        }
        const trimmedOpts = q.options_json.map(o => o.trim())
        if (trimmedOpts.some(o => o === '')) {
          return t.errEmptyOption(q.id)
        }
      }
      if (q.type === 'text' && q.maxLen !== undefined) {
        if (!Number.isInteger(q.maxLen) || q.maxLen <= 0) {
          return t.errCharLimitPositive
        }
      }
    }
    const ids = new Set<string>()
    for (const q of data.questions) {
      if (ids.has(q.id)) return t.errQuestionIdDuplicate.replace('{id}', q.id)
      ids.add(q.id)
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errMsg = validate()
    if (errMsg) {
      setError(errMsg)
      return
    }
    const requiredCount = data.questions.filter((q) => q.required).length
    if (requiredCount === 0 && !window.confirm(t.confirmNoRequired)) {
      return
    }
    setError(null)

    // submit 時用「當下時間」刷新 draftStamp，避免長時間預覽後 hash 衝突
    const contentMd = serializeFullSurveyToMarkdown(data, {
      draftStamp: new Date().toISOString(),
    })

    const draftId = makeDraftId()
    window.localStorage.setItem(
      `${DRAFT_KEY_PREFIX}${draftId}`,
      JSON.stringify({ contentMd, encrypt: false, savedAt: Date.now() })
    )
    navigate(`/fund/${draftId}`)
  }

  const deadlineLocal = deadlineMsToLocalInput(data.deadlineMs)

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto text-slate-800 dark:text-neutral-200 transition-colors">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800/80 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn transition-colors">
        <div className="space-y-2">
          <h1 className="text-h1 flex items-center gap-2">
            {t.createSurvey}
          </h1>
          <p className="text-muted">
            {t.surveyDesc}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="space-y-6">
            {/* 基本資訊 */}
            <section className="bg-slate-50/50 dark:bg-neutral-900/30 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 space-y-4 transition-colors">
              <h2 className="text-h2 flex items-center gap-1.5 border-b pb-2 border-slate-100 dark:border-neutral-800">
                {t.basicInfo}
              </h2>

              <label className="block">
                <span className="form-label">{t.surveyTitle}</span>
                <input
                  type="text"
                  value={data.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="mt-1.5 form-input"
                  placeholder={t.placeholderTitle}
                  aria-label="問卷標題"
                />
              </label>

              <label className="block">
                <span className="form-label">{t.surveyIntro}</span>
                <textarea
                  value={data.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={4}
                  className="mt-1.5 form-input font-mono"
                  placeholder={t.placeholderIntro}
                  aria-label="description"
                />
              </label>
            </section>

            {/* 題目區 */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-h2">{t.questionsList}</h2>
              </div>

              {data.questions.map((q, idx) => (
                <div
                  key={idx}
                  className="border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 space-y-4 bg-slate-50/50 dark:bg-neutral-900/30 hover:bg-slate-50 dark:hover:bg-neutral-800/40 transition-colors relative animate-fadeIn"
                  aria-label={`題目 ${q.id}`}
                >
                  <div className="flex items-center justify-between border-b pb-2 border-slate-200/60 dark:border-neutral-800">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-normal transition-colors ${q.required ? 'text-rose-800 dark:text-rose-400' : 'text-slate-700 dark:text-neutral-300'}`}>
                        {t.questionIndex.replace('{index}', String(idx + 1))}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          id={`required-${idx}`}
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                          className={`checkbox-dark ${q.required
                            ? 'checked:bg-rose-700 checked:border-rose-700 dark:checked:bg-rose-950 dark:checked:border-rose-600 focus:ring-rose-500'
                            : 'checked:bg-blue-600 checked:border-blue-600'
                            }`}
                        />
                        <label
                          htmlFor={`required-${idx}`}
                          className={`text-sm font-normal cursor-pointer select-none transition-colors ${q.required ? 'text-rose-800 dark:text-rose-400' : 'text-slate-500 dark:text-neutral-400'
                            }`}
                        >
                          {t.required}
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => moveQuestion(idx, -1)}
                        disabled={idx === 0}
                        className="w-7 h-7 flex items-center justify-center text-sm border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300 rounded-lg disabled:opacity-30 disabled:hover:bg-white dark:disabled:hover:bg-neutral-900 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
                        aria-label={`上移 ${q.id}`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(idx, 1)}
                        disabled={idx === data.questions.length - 1}
                        className="w-7 h-7 flex items-center justify-center text-sm border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300 rounded-lg disabled:opacity-30 disabled:hover:bg-white dark:disabled:hover:bg-neutral-900 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
                        aria-label={`下移 ${q.id}`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t.confirmDeleteQuestion)) {
                            deleteQuestion(idx)
                          }
                        }}
                        className="w-7 h-7 flex items-center justify-center border border-red-200 dark:border-red-900/30 bg-white dark:bg-neutral-900 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                        aria-label={`刪除 ${q.id}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <span className="form-label">{t.questionType}</span>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {(Object.keys(TYPE_LABELS_INFO) as QuestionType[]).map((tType) => (
                          <button
                            key={tType}
                            type="button"
                            onClick={() => changeQuestionType(idx, tType)}
                            className={`px-3 py-1.5 rounded-xl border text-sm font-normal transition-all flex items-center gap-1.5 ${q.type === tType
                              ? 'bg-blue-700 border-blue-700 text-white dark:bg-blue-800 dark:border-blue-800 dark:text-neutral-200'
                              : 'bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-700 text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800'
                              }`}
                          >
                            <span>{TYPE_LABELS_INFO[tType].label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="block">
                      <span className="form-label">{t.questionPrompt}</span>
                      <textarea
                        value={q.prompt}
                        onChange={(e) => {
                          updateQuestion(idx, { prompt: e.target.value })
                          e.target.style.height = 'auto'
                          e.target.style.height = `${e.target.scrollHeight}px`
                        }}
                        ref={(el) => {
                          if (el) {
                            el.style.height = 'auto'
                            el.style.height = `${el.scrollHeight}px`
                          }
                        }}
                        rows={1}
                        className="mt-1.5 form-input resize-none overflow-hidden py-2"
                        placeholder={t.placeholderPrompt}
                        aria-label={`prompt ${q.id}`}
                      />
                    </label>

                    {q.type === 'text' && (
                      <div className="flex items-center gap-4 mt-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={q.maxLen !== undefined}
                            onChange={(e) => {
                              if (e.target.checked) {
                                updateQuestion(idx, { maxLen: 100 })
                              } else {
                                setData((prev) => ({
                                  ...prev,
                                  questions: prev.questions.map((item, i) => {
                                    if (i !== idx) return item
                                    const { maxLen, ...rest } = item
                                    void maxLen
                                    return rest
                                  }),
                                }))
                              }
                            }}
                            className="checkbox-dark checked:bg-blue-600 checked:border-blue-600"
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-neutral-200">
                            {t.setCharacterLimit}
                          </span>
                        </label>
                        {q.maxLen !== undefined && (
                          <div className="flex items-center gap-1.5 animate-fadeIn">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={q.maxLen ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '')
                                const val = v === '' ? 0 : Number(v)
                                updateQuestion(idx, { maxLen: val })
                              }}
                              className="w-24 form-input py-1 text-sm text-center"
                              placeholder="100"
                              aria-label={`字數上限 ${q.id}`}
                            />
                            <span className="text-sm text-slate-500 dark:text-neutral-400">
                              {t.charactersUnit}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {(q.type === 'single_choice' || q.type === 'multi_choice') &&
                      q.options_json && (
                        <div className="space-y-2 pt-2">
                          <span className="form-label">
                            {t.optionListLabel}
                          </span>
                          <div className="space-y-1.5">
                            {q.options_json.map((opt, oi) => (
                              <div key={oi} className="flex gap-2 items-center">
                                <span className="text-slate-400 dark:text-neutral-500 text-sm select-none">
                                  {oi + 1}.
                                </span>
                                <textarea
                                  value={opt}
                                  onChange={(e) => {
                                    updateOption(idx, oi, e.target.value)
                                    e.target.style.height = 'auto'
                                    e.target.style.height = `${e.target.scrollHeight}px`
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      addOption(idx)
                                    } else if (
                                      e.key === 'Backspace' &&
                                      opt === '' &&
                                      q.options_json &&
                                      q.options_json.length > 1
                                    ) {
                                      e.preventDefault()
                                      removeOption(idx, oi)
                                    }
                                  }}
                                  ref={(el) => {
                                    if (el) {
                                      el.style.height = 'auto'
                                      el.style.height = `${el.scrollHeight}px`
                                    }
                                  }}
                                  rows={1}
                                  className="flex-1 form-input py-1 text-sm resize-none overflow-hidden"
                                  placeholder={t.placeholderOption.replace('{index}', String(oi + 1))}
                                  aria-label={`選項 ${q.id} #${oi + 1}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeOption(idx, oi)}
                                  className="w-7 h-7 flex items-center justify-center border border-red-100 dark:border-red-900/30 text-red-500 dark:text-red-400 bg-white dark:bg-neutral-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-sm"
                                  aria-label={`刪除選項 ${q.id} #${oi + 1}`}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => addOption(idx)}
                            className="text-sm font-normal text-slate-500 dark:text-neutral-450 hover:text-slate-700 dark:hover:text-neutral-200 transition-colors flex items-center gap-1 mt-1"
                          >
                            {t.addOption}
                          </button>

                          <div className="flex items-center gap-2 mt-3 select-none animate-fadeIn">
                            <input
                              id={`shuffle-${idx}`}
                              type="checkbox"
                              checked={q.shuffle ?? false}
                              onChange={(e) => updateQuestion(idx, { shuffle: e.target.checked })}
                              className="checkbox-dark checked:bg-blue-600 checked:border-blue-600"
                            />
                            <label
                              htmlFor={`shuffle-${idx}`}
                              className="text-sm font-medium text-slate-700 dark:text-neutral-350 cursor-pointer"
                            >
                              {t.shuffleOptions}
                            </label>
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              ))}
              {/* 虛線框加號按鈕 */}
              <button
                type="button"
                onClick={addQuestion}
                className="w-full py-8 border-2 border-dashed border-slate-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 rounded-2xl flex flex-col items-center justify-center gap-2 group transition-all text-slate-450 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-neutral-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 flex items-center justify-center transition-colors">
                  <Plus size={20} className="text-slate-500 dark:text-neutral-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                </div>
                <div className="text-lg font-normal">{t.addQuestion}</div>
                <div className="text-sm text-slate-400 dark:text-neutral-500 group-hover:text-blue-500/80 dark:group-hover:text-blue-400/80 font-normal">
                  {t.addQuestionDesc}
                </div>
              </button>
            </section>

            {/* 獎勵與限制設定 */}
            <section className="bg-slate-50/50 dark:bg-neutral-900/30 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 space-y-4 transition-colors">
              <h2 className="text-h2 flex items-center gap-1.5 border-b pb-2 border-slate-100 dark:border-neutral-800">
                {t.rewardsTitle}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="form-label">{t.perResponseReward}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={data.perResponse}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
                      updateField('perResponse', v === '' ? 0 : Number(v))
                    }}
                    className="mt-1.5 form-input"
                    placeholder={t.placeholderSsr}
                    aria-label="perResponse"
                  />
                </label>

                <label className="block">
                  <span className="form-label">{t.maxResponses}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={data.maxResponses}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
                      updateField('maxResponses', v === '' ? 0 : Number(v))
                    }}
                    className="mt-1.5 form-input"
                    placeholder={t.placeholderMaxResponses}
                    aria-label="maxResponses"
                  />
                </label>
              </div>

              {/* 進階：允許重複填答 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="form-label">{t.repeatReward}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={data.repeatReward}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
                      updateField('repeatReward', v === '' ? 0 : Number(v))
                    }}
                    className="mt-1.5 form-input"
                    placeholder={t.placeholderRepeatSsr}
                    aria-label="repeatReward"
                  />
                </label>

                <label className="block">
                  <span className="form-label">{t.maxRepeatTimes}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={data.repeatMaxTimes}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
                      updateField('repeatMaxTimes', v === '' ? 0 : Number(v))
                    }}
                    disabled={data.repeatReward <= 0}
                    className="mt-1.5 form-input"
                    aria-label="repeatMaxTimes"
                  />
                </label>
              </div>

              {data.repeatReward > 0 && data.maxResponses > 0 && (
                <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3 text-sm text-amber-900 dark:text-amber-300 space-y-1">
                  <div className="font-medium flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                    <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{t.warningPreFund}</span>
                  </div>
                  <div className="font-mono">
                    {data.perResponse} × {data.maxResponses}
                    {' + '}
                    {data.repeatReward} × {data.maxResponses} × {data.repeatMaxTimes}
                    {' = '}
                    <span className="font-bold">
                      {data.perResponse * data.maxResponses +
                        data.repeatReward * data.maxResponses * data.repeatMaxTimes}{' '}
                      SSR
                    </span>
                  </div>
                  <div className="text-sm text-amber-700/80 dark:text-amber-400/80">
                    {t.warningPreFundDesc}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="form-label">{t.deadline.replace('{tz}', getLocalUtcOffsetLabel())}</span>
                  <input
                    type="datetime-local"
                    value={deadlineLocal}
                    onChange={(e) => {
                      const ms = new Date(e.target.value).getTime()
                      if (!isNaN(ms)) updateField('deadlineMs', ms)
                    }}
                    max={deadlineMsToLocalInput(maxDeadlineMs)}
                    className={`mt-1.5 form-input ${deadlineErrorMsg ? 'border-red-500 focus:ring-red-500 focus:border-red-500 dark:border-red-600' : ''}`}
                    aria-label="deadline"
                  />
                  {deadlineErrorMsg && (
                    <span className="text-xs text-rose-600 dark:text-rose-400 mt-1.5 block">
                      {deadlineErrorMsg}
                    </span>
                  )}
                  <span className="text-muted mt-1.5 block">
                    {t.purgeLifecycleNotice(purgeGraceDays)}
                  </span>
                </label>

              <div className="block">
                <span className="form-label">{t.allowedSourcesLabel}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { value: 2, label: 'Email' },
                    { value: 6, label: 'Google' },
                    { value: 7, label: 'GitHub' },
                    { value: 5, label: 'World ID' },
                  ].map((src) => {
                    const checked = data.allowedSources.includes(src.value)
                    return (
                      <label
                        key={src.value}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer select-none transition-all ${
                          checked
                            ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/80 text-blue-900 dark:text-blue-200 font-semibold'
                            : 'border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateField('allowedSources', [...data.allowedSources, src.value])
                            } else {
                              updateField(
                                'allowedSources',
                                data.allowedSources.filter((v) => v !== src.value)
                              )
                            }
                          }}
                          className="checkbox-dark checked:bg-blue-600 checked:border-blue-600"
                        />
                        <span className="text-sm font-medium">{src.label}</span>
                      </label>
                    )
                  })}

                  <label
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer select-none transition-all ${
                      limitNft
                        ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/80 text-blue-900 dark:text-blue-200 font-semibold'
                        : 'border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={limitNft}
                      onChange={(e) => {
                        const next = e.target.checked
                        setLimitNft(next)
                        if (!next) {
                          updateField('allowedNftType', '')
                        }
                      }}
                      className="checkbox-dark checked:bg-blue-600 checked:border-blue-600"
                    />
                    <span className="text-sm font-medium">{t.limitNftLabel}</span>
                  </label>
                </div>
              </div>

              {limitNft && (
                <div className="animate-fadeIn grid grid-cols-1 gap-4">
                  <label className="block">
                    <span className="form-label">{t.allowedNftTypeLabel}</span>
                    <input
                      type="text"
                      value={data.allowedNftType}
                      onChange={(e) => updateField('allowedNftType', e.target.value.trim())}
                      className="mt-1.5 form-input"
                      placeholder={t.placeholderAllowedNftType}
                      aria-label="allowedNftType"
                    />
                  </label>
                </div>
              )}
              </div>


              {/* 簡易試算卡片 */}
              {data.perResponse > 0 && data.maxResponses > 0 && costBreakdown && (
                <div className="bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-5 space-y-3 mt-2 transition-colors">
                  <div className="flex justify-between items-center text-sm border-b border-blue-100 dark:border-blue-900/20 pb-1.5 flex-wrap gap-2">
                    <span className="font-medium text-blue-800 dark:text-blue-400 text-base">{t.costEstimation}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 dark:text-neutral-400">
                        {t.estSize(surveySizeKb.toFixed(2))}
                      </span>
                      {isLargeSurvey ? (
                        <span className="badge-decentralized shrink-0">
                          {t.storageDecentralized}
                        </span>
                      ) : (
                        <span className="badge-direct shrink-0">
                          {t.storageDirect}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {/* SSR 預算明細組 */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center gap-x-2 text-slate-600 dark:text-neutral-400">
                        <span className="min-w-0 break-words">{t.totalSsrLabel}</span>
                        <span className="font-semibold text-slate-700 dark:text-neutral-300 shrink-0 font-mono text-right">
                          {totalSsrNum.toString()} SSR
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-x-2 text-slate-600 dark:text-neutral-400">
                        <span className="min-w-0 break-words">{t.platformFeeLabel}</span>
                        <span className="font-semibold text-slate-700 dark:text-neutral-300 shrink-0 font-mono text-right" title={`${formatFullPrecision(costBreakdown.feeBase)} SSR`}>
                          {formatSsr(costBreakdown.feeBase)} SSR
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-x-2 border-t border-slate-100 dark:border-neutral-800/50 pt-1.5 font-medium text-slate-700 dark:text-neutral-200">
                        <span className="min-w-0 break-words">{t.totalSsrRequiredLabel}</span>
                        <span className="font-bold text-blue-700 dark:text-blue-400 shrink-0 font-mono text-right" title={`${formatFullPrecision(costBreakdown.grossSsrBase)} SSR`}>
                          {formatSsr(costBreakdown.grossSsrBase)} SSR
                        </span>
                      </div>
                    </div>

                    {/* 來源分拆組 */}
                    <div className="border-t border-slate-100 dark:border-neutral-800/80 pt-2 space-y-1">
                      <div className="flex justify-between items-center gap-x-2 text-slate-600 dark:text-neutral-400">
                        <span className="min-w-0 break-words">{t.ssrOffsetLabel}</span>
                        <span className="font-semibold text-slate-700 dark:text-neutral-300 shrink-0 font-mono text-right" title={`${formatFullPrecision(costBreakdown.offsetIn)} SSR`}>
                          - {formatSsr(costBreakdown.offsetIn)} SSR
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-x-2 text-slate-600 dark:text-neutral-400">
                        <span className="min-w-0 break-words">{t.newMintSsrLabel}</span>
                        <span className="font-bold text-slate-800 dark:text-neutral-200 shrink-0 font-mono text-right" title={`${formatFullPrecision(costBreakdown.minted)} SSR`}>
                          {formatSsr(costBreakdown.minted)} SSR
                        </span>
                      </div>
                    </div>

                    {/* SUI 支付項目組 */}
                    <div className="border-t border-slate-100 dark:border-neutral-800/80 pt-2 space-y-1.5">
                      <div className="flex justify-between items-center gap-x-2 text-slate-600 dark:text-neutral-400">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="min-w-0 break-words">{t.mintSuiCostLabel}</span>
                          <div className="group relative inline-block shrink-0">
                            <Info size={13} className="text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 cursor-pointer" />
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white dark:bg-neutral-800 dark:text-neutral-100 text-xs rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed font-normal">
                              <p className="font-semibold">{t.exchangeRateLabel} 1 SUI ≈ {currentRate.toFixed(2)} SSR</p>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-neutral-800" />
                            </div>
                          </div>
                        </div>
                        <span className="font-semibold text-slate-700 dark:text-neutral-300 shrink-0 font-mono text-right" title={`${formatSuiFullPrecision(costBreakdown.suiToInvest)} SUI`}>
                          {formatSui(costBreakdown.suiToInvest)} SUI
                        </span>
                      </div>
                      {requiredGas > 0n && (
                        <div className="flex justify-between items-center gap-x-2 text-slate-600 dark:text-neutral-400">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="min-w-0 break-words">{t.gasFundLabel}</span>
                            <div className="group relative inline-block shrink-0">
                              <Info size={13} className="text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 cursor-pointer" />
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white dark:bg-neutral-800 dark:text-neutral-100 text-xs rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed font-normal">
                                {t.gasFundDesc}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-neutral-800" />
                              </div>
                            </div>
                          </div>
                          <span className="font-semibold text-slate-700 dark:text-neutral-300 shrink-0 font-mono text-right" title={`${formatSuiFullPrecision(requiredGas)} SUI`}>
                            {formatSui(requiredGas)} SUI
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 最終總結組 */}
                    <div className="flex justify-between items-center gap-x-2 border-t border-slate-200 dark:border-neutral-800 pt-2.5 font-bold">
                      <span className="text-slate-800 dark:text-neutral-200 min-w-0 break-words">{t.totalSuiCostLabel}</span>
                      <span className="text-base text-blue-700 dark:text-blue-400 font-mono shrink-0 text-right" title={`${formatSuiFullPrecision(costBreakdown.suiToInvest + requiredGas)} SUI`}>
                        {formatSui(costBreakdown.suiToInvest + requiredGas)} SUI
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </section>

          </div>

          {error && (
            <div
              role="alert"
              className="alert-error text-sm font-normal flex items-center gap-1.5"
            >
              <AlertTriangle size={14} className="shrink-0 text-rose-550" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleDownloadDraft}
                className="btn-outline text-sm flex items-center gap-1.5"
              >
                {t.btnExport}
              </button>
              <button
                type="button"
                onClick={handleUploadClick}
                className="btn-outline text-sm flex items-center gap-1.5"
              >
                {t.btnImport}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,text/markdown,text/plain"
                className="hidden"
                onChange={handleFileChange}
                aria-label="上傳 markdown 檔案"
              />
            </div>
            <button
              type="submit"
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {t.btnNext}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
