import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCurrentAccount, useSuiClientQuery } from '@mysten/dapp-kit'
import { renderMarkdown } from '../lib/markdown'
import {
  type FullSurveyData,
  type Question,
  type QuestionType,
  makeBlankSurveyData,
  parseFullSurveyMarkdown,
  serializeFullSurveyToMarkdown,
} from '../lib/frontmatter'
import { estimateFundCostV2 } from '../lib/ptb'
import { formatSsr } from '../lib/format'

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

const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: '單選',
  multi_choice: '複選',
  text: '簡答',
  scale: '量表（1-5）',
}

const TYPE_LABELS_INFO: Record<QuestionType, { label: string; icon: string }> = {
  single_choice: { label: '單選', icon: '🔘' },
  multi_choice: { label: '複選', icon: '☑️' },
  text: { label: '簡答', icon: '📝' },
  scale: { label: '量表 (1-5)', icon: '📊' },
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
  const [activeTab, setActiveTab] = useState<'questions' | 'settings'>('questions')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (draftId) {
      const entry = readDraft(draftId)
      if (entry) {
        const result = parseFullSurveyMarkdown(entry.contentMd)
        if (result.ok) {
          setData(result.data)
        }
      }
    }
  }, [draftId])

  // 預覽期鎖定 draftStamp，避免 hash 飄動
  const previewDraftStamp = useMemo(() => new Date().toISOString(), [])
  const previewMd = useMemo(
    () => serializeFullSurveyToMarkdown(data, { draftStamp: previewDraftStamp }),
    [data, previewDraftStamp],
  )

  const account = useCurrentAccount()
  const packageId = import.meta.env.VITE_PACKAGE_ID ?? ''
  const poolId = import.meta.env.VITE_AMM_POOL_ID ?? ''

  const { data: poolData } = useSuiClientQuery(
    'getObject',
    { id: poolId, options: { showContent: true } },
    { enabled: !!poolId },
  )

  const { data: coinsData } = useSuiClientQuery(
    'getCoins',
    {
      owner: account?.address ?? '',
      coinType: `${packageId}::stacked_survey_reward::STACKED_SURVEY_REWARD`,
    },
    { enabled: !!account && !!packageId },
  )

  const totalSuiInvested = useMemo<bigint>(() => {
    if (poolData?.data?.content?.dataType !== 'moveObject') return 0n
    const fields = (poolData.data.content as { fields: Record<string, string> }).fields
    return BigInt(fields.total_sui_invested ?? '0')
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

  const [costBreakdown, setCostBreakdown] = useState<{
    netSsrBase: bigint
    effectiveFeeBps: bigint
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
          maxResponses: data.maxResponses,
          totalSuiInvested,
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
  }, [data.perResponse, data.maxResponses, totalSuiInvested, feeConfig, creatorSsrBalance])

  // ── 表單更新 helpers ────────────────────────────────────────────────────────

  function updateField<K extends keyof FullSurveyData>(key: K, value: FullSurveyData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
  }

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
          prompt: '新題目',
          options_json: ['選項 A', '選項 B'],
          required: false,
        },
      ],
    }))
  }

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
    updateQuestion(index, {
      type: newType,
      options_json: needsOptions
        ? data.questions[index].options_json ?? ['選項 A', '選項 B']
        : null,
    })
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
        i === qIndex && q.options_json
          ? { ...q, options_json: [...q.options_json, '新選項'] }
          : q,
      ),
    }))
  }

  function removeOption(qIndex: number, optIndex: number) {
    setData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === qIndex && q.options_json
          ? { ...q, options_json: q.options_json.filter((_, j) => j !== optIndex) }
          : q,
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

  function handleDownloadDraft() {
    const md = serializeFullSurveyToMarkdown(data, { draftStamp: previewDraftStamp })
    const date = new Date().toISOString().slice(0, 10)
    const slug = data.title.replace(/[^\w一-龥-]+/g, '-').slice(0, 40) || 'survey'
    downloadMd(md, `survey-${slug}-${date}.md`)
  }

  function handleDownloadTemplate() {
    const md = serializeFullSurveyToMarkdown(makeBlankSurveyData(), {
      draftStamp: new Date().toISOString(),
    })
    downloadMd(md, 'survey-template.md')
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
        setError(`上傳檔案解析失敗：${result.error}`)
        return
      }
      const ok = window.confirm('將以上傳檔案覆蓋目前內容，確定嗎？')
      if (!ok) return
      setData(result.data)
      setError(null)
    }
    reader.onerror = () => setError('讀取檔案失敗')
    reader.readAsText(file)
    e.target.value = '' // 允許重複上傳同名檔案
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!data.title.trim()) return '請填寫問卷標題'
    if (!Number.isInteger(data.perResponse) || data.perResponse <= 0)
      return 'perResponse 必須為正整數'
    if (!Number.isInteger(data.maxResponses) || data.maxResponses <= 0)
      return 'maxResponses 必須為正整數'
    if (!data.deadlineMs || isNaN(data.deadlineMs))
      return 'deadline 格式無效'
    if (data.deadlineMs <= Date.now()) return 'deadline 須為未來時間'
    if (data.minTier < 0 || data.minTier > 3) return 'minTier 必須為 0-3'
    if (data.questions.length === 0) return '至少需要一題'
    for (const q of data.questions) {
      if (!q.id.trim()) return '題目 id 不可為空'
      if (!q.prompt.trim()) return `題目 ${q.id} prompt 不可為空`
      if ((q.type === 'single_choice' || q.type === 'multi_choice') &&
          (!q.options_json || q.options_json.length === 0)) {
        return `題目 ${q.id} 至少需要一個選項`
      }
    }
    const ids = new Set<string>()
    for (const q of data.questions) {
      if (ids.has(q.id)) return `題目 id 重複：${q.id}`
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
    setError(null)

    // submit 時用「當下時間」刷新 draftStamp，避免長時間預覽後 hash 衝突
    const contentMd = serializeFullSurveyToMarkdown(data, {
      draftStamp: new Date().toISOString(),
    })

    const draftId = makeDraftId()
    window.localStorage.setItem(
      `${DRAFT_KEY_PREFIX}${draftId}`,
      JSON.stringify({ contentMd, encrypt: true, savedAt: Date.now() }),
    )
    navigate(`/fund/${draftId}`)
  }

  const deadlineLocal = deadlineMsToLocalInput(data.deadlineMs)

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn">
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            📝 建立問卷
          </h1>
          <p className="text-sm text-slate-500">
            請在下方分頁中設計您的問卷內容與設定。完成後，下一步可進行互動預覽、下載 Markdown 草稿並發佈至 Sui 鏈上。
          </p>
        </div>

        {/* 雙分頁 Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`flex-1 py-3.5 text-center font-bold text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === 'questions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
            }`}
          >
            📋 問題編輯 ({data.questions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3.5 text-center font-bold text-sm border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === 'settings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
            }`}
          >
            ⚙️ 問卷設定
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {activeTab === 'questions' && (
            <div className="space-y-6">
              {/* 基本資訊 */}
              <section className="bg-slate-50/50 border border-slate-100 rounded-2xl p-5 space-y-4">
                <h2 className="font-bold text-slate-800 text-lg flex items-center gap-1.5 border-b pb-2 border-slate-100">
                  ℹ️ 基本資訊
                </h2>

                <label className="block">
                  <span className="text-sm font-bold text-slate-600">問卷標題</span>
                  <input
                    type="text"
                    value={data.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    className="mt-1.5 w-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 font-semibold text-slate-800 bg-white"
                    placeholder="請輸入問卷標題..."
                    aria-label="問卷標題"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-600">問卷說明（顯示給填寫者）</span>
                  <textarea
                    value={data.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    rows={4}
                    className="mt-1.5 w-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 font-mono text-sm text-slate-700 bg-white"
                    placeholder="請輸入問卷前言、注意事項或說明..."
                    aria-label="description"
                  />
                </label>
              </section>

              {/* 題目區 */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-800 text-lg">💡 題目列表</h2>
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-bold hover:shadow-md hover:brightness-110 transition-all flex items-center gap-1.5"
                  >
                    ➕ 新增題目
                  </button>
                </div>

                {data.questions.map((q, idx) => (
                  <div key={idx} className="border border-slate-100 rounded-2xl p-5 space-y-4 bg-slate-50/50 hover:bg-slate-50 transition-colors relative shadow-sm animate-fadeIn" aria-label={`題目 ${q.id}`}>
                    <div className="flex items-center justify-between border-b pb-2 border-slate-200/60">
                      <span className="text-sm font-black text-slate-700">第 {idx + 1} 題</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => moveQuestion(idx, -1)}
                          disabled={idx === 0}
                          className="w-7 h-7 flex items-center justify-center text-xs border border-slate-200 bg-white text-slate-600 rounded-lg disabled:opacity-30 disabled:hover:bg-white hover:bg-slate-100 transition-colors"
                          aria-label={`上移 ${q.id}`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestion(idx, 1)}
                          disabled={idx === data.questions.length - 1}
                          className="w-7 h-7 flex items-center justify-center text-xs border border-slate-200 bg-white text-slate-600 rounded-lg disabled:opacity-30 disabled:hover:bg-white hover:bg-slate-100 transition-colors"
                          aria-label={`下移 ${q.id}`}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('確定要刪除這道題目嗎？')) {
                              deleteQuestion(idx)
                            }
                          }}
                          className="w-7 h-7 flex items-center justify-center text-xs border border-red-200 bg-white text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          aria-label={`刪除 ${q.id}`}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span className="text-xs font-bold text-slate-500">題型</span>
                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {(Object.keys(TYPE_LABELS_INFO) as QuestionType[]).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => changeQuestionType(idx, t)}
                              className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                                q.type === t
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <span>{TYPE_LABELS_INFO[t].icon}</span>
                              <span>{TYPE_LABELS_INFO[t].label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 py-1">
                        <input
                          id={`required-${idx}`}
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                        />
                        <label htmlFor={`required-${idx}`} className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                          設為必填問題
                        </label>
                      </div>

                      <label className="block">
                        <span className="text-xs font-bold text-slate-500">問題內容 (Prompt)</span>
                        <input
                          type="text"
                          value={q.prompt}
                          onChange={(e) => updateQuestion(idx, { prompt: e.target.value })}
                          className="mt-1.5 w-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 bg-white"
                          placeholder="請輸入題目內容..."
                          aria-label={`prompt ${q.id}`}
                        />
                      </label>

                      {(q.type === 'single_choice' || q.type === 'multi_choice') && q.options_json && (
                        <div className="space-y-2 pt-2">
                          <span className="text-xs font-bold text-slate-500">選項列表 (按 Enter 新增下一項，空值按 Backspace 刪除)</span>
                          <div className="space-y-1.5">
                            {q.options_json.map((opt, oi) => (
                              <div key={oi} className="flex gap-2 items-center">
                                <span className="text-slate-400 text-xs font-bold select-none">{oi + 1}.</span>
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => updateOption(idx, oi, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      addOption(idx)
                                    } else if (e.key === 'Backspace' && opt === '' && q.options_json && q.options_json.length > 1) {
                                      e.preventDefault()
                                      removeOption(idx, oi)
                                    }
                                  }}
                                  className="flex-1 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 bg-white"
                                  placeholder={`選項 ${oi + 1}`}
                                  aria-label={`選項 ${q.id} #${oi + 1}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeOption(idx, oi)}
                                  className="w-7 h-7 flex items-center justify-center border border-red-100 text-red-500 rounded-lg hover:bg-red-50 transition-colors text-xs"
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
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1 mt-1"
                          >
                            ➕ 新增選項
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {data.questions.length === 0 && (
                  <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <p className="text-sm text-slate-400 font-medium mb-3">目前問卷中沒有任何題目</p>
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="px-4 py-2 bg-white border border-slate-200 text-blue-600 hover:bg-slate-50 transition-all rounded-xl text-xs font-bold shadow-sm"
                    >
                      ➕ 新增第一題
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* 獎勵與限制設定 */}
              <section className="bg-slate-50/50 border border-slate-100 rounded-2xl p-5 space-y-4">
                <h2 className="font-bold text-slate-800 text-lg flex items-center gap-1.5 border-b pb-2 border-slate-100">
                  💰 獎勵與限制
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-bold text-slate-600">每份填答獎勵 (SSR)</span>
                    <input
                      type="number"
                      min={1}
                      value={data.perResponse}
                      onChange={(e) => updateField('perResponse', Number(e.target.value))}
                      className="mt-1.5 w-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 font-semibold text-slate-800 bg-white"
                      placeholder="請輸入 SSR 數額"
                      aria-label="perResponse"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-600">限制名額上限</span>
                    <input
                      type="number"
                      min={1}
                      value={data.maxResponses}
                      onChange={(e) => updateField('maxResponses', Number(e.target.value))}
                      className="mt-1.5 w-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 font-semibold text-slate-800 bg-white"
                      placeholder="請輸入最大份數"
                      aria-label="maxResponses"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-sm font-bold text-slate-600">截止時間</span>
                    <input
                      type="datetime-local"
                      value={deadlineLocal}
                      onChange={(e) => {
                        const ms = new Date(e.target.value).getTime()
                        if (!isNaN(ms)) updateField('deadlineMs', ms)
                      }}
                      className="mt-1.5 w-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 font-semibold text-slate-800 bg-white"
                      aria-label="deadline"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-600">身分憑證門檻</span>
                    <select
                      value={data.minTier}
                      onChange={(e) => updateField('minTier', Number(e.target.value))}
                      className="mt-1.5 w-full border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 font-semibold text-slate-800 bg-white"
                      aria-label="minTier"
                    >
                      <option value={0}>0 — 開放所有人填寫</option>
                      <option value={1}>1 — 需要 Tier 1 身分認證</option>
                      <option value={2}>2 — 需要 Tier 2 身分認證</option>
                      <option value={3}>3 — 需要 Tier 3 身分認證</option>
                    </select>
                  </label>
                </div>

                {/* 簡易試算卡片 */}
                {data.perResponse > 0 && data.maxResponses > 0 && (
                  <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 shadow-sm space-y-2 mt-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-bold text-blue-800 text-base">💰 簡易費用估計</span>
                      <span className="text-xs text-blue-600 font-medium">基於當前 AMM 曲線</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div>
                        <p className="text-xs text-slate-500 font-bold">總發放獎勵</p>
                        <p className="text-lg font-black text-slate-800 font-mono">
                          {data.perResponse * data.maxResponses} <span className="text-xs font-bold">SSR</span>
                        </p>
                      </div>
                      {costBreakdown && (
                        <div>
                          <p className="text-xs text-slate-500 font-bold">預估所需 SUI 總計</p>
                          <p className="text-lg font-black text-blue-700 font-mono">
                            {(Number(costBreakdown.suiToInvest) / 1e9).toFixed(4)} <span className="text-xs font-bold">SUI</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* 匯入與範本工具 */}
              <section className="bg-slate-50/50 border border-slate-100 rounded-2xl p-5 space-y-4">
                <h2 className="font-bold text-slate-800 text-lg flex items-center gap-1.5 border-b pb-2 border-slate-100">
                  📁 匯入與備份工具
                </h2>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleUploadClick}
                    className="px-4 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    📤 匯入 Markdown 草稿 (.md)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-4 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    📄 下載空白問卷範本
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
              </section>
            </div>
          )}

          {error && (
            <div role="alert" className="text-rose-500 text-xs font-bold bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-center gap-1.5">
              ⚠️ {error}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            {activeTab === 'questions' ? (
              <>
                <div />
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-3 rounded-2xl hover:shadow-lg transition-all"
                >
                  前往設定步驟 ➔
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('questions')}
                  className="border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-sm px-6 py-3 rounded-2xl transition-all"
                >
                  ⬅ 回到問題編輯
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm px-6 py-3 rounded-2xl hover:shadow-lg transition-all"
                >
                  下一步：預覽與發佈 ➔
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}
