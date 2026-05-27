import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2, AlertTriangle, Plus } from 'lucide-react'
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
import { formatSsr, formatSui, formatFullPrecision } from '../lib/format'
import { useLanguage } from '../context/LanguageContext'

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

const content = {
  ZH: {
    typeSingleChoice: '單選',
    typeMultiChoice: '複選',
    typeText: '簡答',
    typeScale: '量表（1-5）',
    typeScaleShort: '量表 (1-5)',
    createSurvey: '建立問卷',
    surveyDesc: '請在下方設計您的問卷內容與設定。完成後，下一步可進行互動預覽、下載 Markdown 草稿並發佈至 Sui 鏈上。',
    basicInfo: '基本資訊',
    surveyTitle: '問卷標題',
    placeholderTitle: '請輸入問卷標題...',
    surveyIntro: '問卷說明（顯示給填寫者）',
    placeholderIntro: '請輸入問卷前言、注意事項或說明...',
    rewardsTitle: '獎勵與限制',
    perResponseReward: '每份填答獎勵 (SSR)',
    placeholderSsr: '請輸入 SSR 數額',
    maxResponses: '限制名額上限',
    placeholderMaxResponses: '請輸入最大份數',
    deadline: '截止時間 ({tz})',
    identityThreshold: '驗證等級門檻',
    tier0: 'Tier 0 - Email 驗證',
    tier1: 'Tier 1 - OAuth 驗證',
    tier2: 'Tier 2 - 真人驗證',
    repeatReward: '每次重填獎勵 (SSR)',
    placeholderRepeatSsr: '0 = 禁止重複填答',
    maxRepeatTimes: '每地址最多重填次數',
    warningPreFund: '需預注最大獎勵資金',
    warningPreFundDesc: '若預注不足，下一步注資頁將無法發佈。鏈上事件歷史不可抹除，舊版本答卷密文仍可被解出。',
    costEstimation: '簡易費用估計',
    currentAmmCurve: '基於當前 AMM 曲線',
    ssrOffset: '既有 SSR 折抵',
    newMintSsr: '新鑄 SSR (AMM)',
    platformFee: '平台手續費 (fee)',
    suiConsumption: '預估 SUI 消耗',
    questionsList: '題目列表',
    questionIndex: '第 {index} 題',
    required: '必填',
    questionType: '題型',
    questionPrompt: '問題內容 (Prompt)',
    placeholderPrompt: '請輸入題目內容...',
    optionListLabel: '選項列表 (按 Enter 新增下一項，空值按 Backspace 刪除)',
    placeholderOption: '選項 {index}',
    addOption: '新增選項',
    addQuestion: '新增題目',
    addQuestionDesc: '支援單選、複選、簡答及量表（1-5）等題型',
    btnExport: '匯出',
    btnImport: '匯入 (.md)',
    btnNext: '下一步：預覽問卷 ➡',

    // 錯誤和警告提示
    errTitleRequired: '請填寫問卷標題',
    errPerResponsePositive: 'perResponse 必須為正整數',
    errRepeatRewardNonNegative: 'repeatReward 必須為非負整數（0 = 禁止重複填答）',
    errRepeatMaxTimesPositive: 'repeatMaxTimes 必須為正整數',
    errMaxResponsesPositive: 'maxResponses 必須為正整數',
    errDeadlineInvalid: 'deadline 格式無效',
    errDeadlineFuture: 'deadline 須為未來時間',
    errMinTierInvalid: 'minTier 必須為 0-2',
    errQuestionRequired: '至少需要一題',
    errQuestionIdRequired: '題目 id 不可為空',
    errQuestionPromptRequired: '題目 {id} 不可為空',
    errOptionRequired: '題目 {id} 至少需要一個選項',
    errQuestionIdDuplicate: '題目 id 重複：{id}',
    confirmOverwrite: '將以上傳檔案覆蓋目前內容，確定嗎？',
    confirmNoRequired: '沒有「必填」題目，這樣受訪者可以交白卷。確定要繼續嗎？',
    errReadFileFailed: '讀取檔案失敗',
    errUploadParseFailed: '上傳檔案解析失敗：{error}'
  },
  EN: {
    typeSingleChoice: 'Single Choice',
    typeMultiChoice: 'Multiple Choice',
    typeText: 'Text',
    typeScale: 'Scale (1-5)',
    typeScaleShort: 'Scale (1-5)',
    createSurvey: 'Create Survey',
    surveyDesc: 'Design your survey questions and configurations below. You can preview, download a Markdown draft, and publish to Sui chain in the next step.',
    basicInfo: 'Basic Info',
    surveyTitle: 'Survey Title',
    placeholderTitle: 'Enter survey title...',
    surveyIntro: 'Survey Description (Shown to respondents)',
    placeholderIntro: 'Enter introduction, guidelines, or instructions...',
    rewardsTitle: 'Rewards & Limits',
    perResponseReward: 'Reward per Response (SSR)',
    placeholderSsr: 'Enter SSR amount',
    maxResponses: 'Max Responses Limit',
    placeholderMaxResponses: 'Enter max responses count',
    deadline: 'Deadline (your timezone: {tz})',
    identityThreshold: 'Verification level threshold',
    tier0: 'Tier 0 - Email',
    tier1: 'Tier 1 - OAuth',
    tier2: 'Tier 2 - Individual',
    repeatReward: 'Repeat Reward (SSR)',
    placeholderRepeatSsr: '0 = Disable repeat submissions',
    maxRepeatTimes: 'Max Repeats per Wallet',
    warningPreFund: 'Pre-fund Required for Max Rewards',
    warningPreFundDesc: 'If pre-funded funds are insufficient, the vault cannot be published in the next step. Note: On-chain history is immutable, encrypted responses of old versions can still be decrypted.',
    costEstimation: 'Fee Estimation',
    currentAmmCurve: 'Based on current AMM curve',
    ssrOffset: 'Existing SSR offset',
    newMintSsr: 'New Minted SSR (AMM)',
    platformFee: 'Platform fee',
    suiConsumption: 'Estimated SUI cost',
    questionsList: 'Questions List',
    questionIndex: 'Q{index}',
    required: 'Required',
    questionType: 'Question Type',
    questionPrompt: 'Question Prompt',
    placeholderPrompt: 'Enter question text...',
    optionListLabel: 'Options List (Press Enter to add next, Backspace on empty to delete)',
    placeholderOption: 'Option {index}',
    addOption: 'Add Option',
    addQuestion: 'Add Question',
    addQuestionDesc: 'Supports Single, Multiple, Text, and Scale (1-5) types',
    btnExport: 'Export',
    btnImport: 'Import (.md)',
    btnNext: 'Next: Preview Survey ➡',

    // 錯誤和警告提示
    errTitleRequired: 'Please enter survey title',
    errPerResponsePositive: 'perResponse must be a positive integer',
    errRepeatRewardNonNegative: 'repeatReward must be non-negative (0 = disable repeat)',
    errRepeatMaxTimesPositive: 'repeatMaxTimes must be a positive integer',
    errMaxResponsesPositive: 'maxResponses must be a positive integer',
    errDeadlineInvalid: 'Invalid deadline format',
    errDeadlineFuture: 'Deadline must be a future time',
    errMinTierInvalid: 'minTier must be 0-2',
    errQuestionRequired: 'At least one question is required',
    errQuestionIdRequired: 'Question ID cannot be empty',
    errQuestionPromptRequired: 'Question {id} prompt cannot be empty',
    errOptionRequired: 'Question {id} needs at least one option',
    errQuestionIdDuplicate: 'Duplicate question ID: {id}',
    confirmOverwrite: 'This will overwrite your current progress with the uploaded file. Are you sure?',
    confirmNoRequired: '"Required" question not found. Respondents can submit blank answers. Continue anyway?',
    errReadFileFailed: 'Failed to read file',
    errUploadParseFailed: 'Failed to parse uploaded file: {error}'
  }
}

export default function CreatePage() {
  const navigate = useNavigate()
  const { draftId } = useParams<{ draftId: string }>()
  const [data, setData] = useState<FullSurveyData>(makeBlankSurveyData)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { lang } = useLanguage()
  const t = content[lang]

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
          repeatReward: BigInt(data.repeatReward),
          repeatMaxTimes: data.repeatMaxTimes,
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
  }, [
    data.perResponse,
    data.repeatReward,
    data.repeatMaxTimes,
    data.maxResponses,
    totalSuiInvested,
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
    updateQuestion(index, {
      type: newType,
      options_json: needsOptions
        ? (data.questions[index].options_json ?? ['', ''])
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
    if (data.minTier < 0 || data.minTier > 2) return t.errMinTierInvalid
    if (data.questions.length === 0) return t.errQuestionRequired
    for (const q of data.questions) {
      if (!q.id.trim()) return t.errQuestionIdRequired
      if (!q.prompt.trim()) return t.errQuestionPromptRequired.replace('{id}', q.id)
      if (
        (q.type === 'single_choice' || q.type === 'multi_choice') &&
        (!q.options_json || q.options_json.length === 0)
      ) {
        return t.errOptionRequired.replace('{id}', q.id)
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
                    className="mt-1.5 form-input"
                    aria-label="deadline"
                  />
                </label>

                <label className="block">
                  <span className="form-label">{t.identityThreshold}</span>
                  <select
                    value={data.minTier}
                    onChange={(e) => updateField('minTier', Number(e.target.value))}
                    className="mt-1.5 form-input bg-white dark:bg-neutral-900"
                    aria-label="minTier"
                  >
                    <option value={0}>{t.tier0}</option>
                    <option value={1}>{t.tier1}</option>
                    <option value={2}>{t.tier2}</option>
                  </select>
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

              {/* 簡易試算卡片 */}
              {data.perResponse > 0 && data.maxResponses > 0 && costBreakdown && (
                <div className="bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-5 space-y-2 mt-2 transition-colors">
                  <div className="flex justify-between items-center text-sm border-b border-blue-100 dark:border-blue-900/20 pb-1.5">
                    <span className="font-medium text-blue-800 dark:text-blue-400 text-base">{t.costEstimation}</span>
                    <span className="text-sm text-blue-700 dark:text-blue-500 font-medium">{t.currentAmmCurve}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-neutral-400 font-medium">{t.ssrOffset}</span>
                      <span className="font-semibold text-slate-700 dark:text-neutral-300" title={`${formatFullPrecision(costBreakdown.offsetIn)} SSR`}>
                        {formatSsr(costBreakdown.offsetIn)} SSR
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-neutral-400 font-medium">{t.newMintSsr}</span>
                      <span className="font-semibold text-slate-700 dark:text-neutral-300" title={`${formatFullPrecision(costBreakdown.minted)} SSR`}>
                        {formatSsr(costBreakdown.minted)} SSR
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-555 dark:text-neutral-400 font-medium">{t.platformFee}</span>
                      <span className="font-bold text-slate-700 dark:text-neutral-300" title={`${formatFullPrecision((costBreakdown.grossSsrBase * costBreakdown.effectiveFeeBps) / 10000n)} SSR`}>
                        {formatSsr(
                          (costBreakdown.grossSsrBase * costBreakdown.effectiveFeeBps) / 10000n
                        )}{' '}
                        SSR
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 dark:border-neutral-800 pt-2 font-bold">
                      <span className="text-slate-700 dark:text-neutral-300">{t.suiConsumption}</span>
                      <span className="text-base text-blue-700 dark:text-blue-400 font-mono" title={`${formatFullPrecision(costBreakdown.suiToInvest)} SUI`}>
                        {formatSui(costBreakdown.suiToInvest)} SUI
                      </span>
                    </div>
                  </div>
                </div>
              )}
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
                          if (window.confirm(lang === 'ZH' ? '確定要刪除這道題目嗎？' : 'Are you sure you want to delete this question?')) {
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
                      <input
                        type="text"
                        value={q.prompt}
                        onChange={(e) => updateQuestion(idx, { prompt: e.target.value })}
                        className="mt-1.5 form-input"
                        placeholder={t.placeholderPrompt}
                        aria-label={`prompt ${q.id}`}
                      />
                    </label>

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
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => updateOption(idx, oi, e.target.value)}
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
                                  className="flex-1 form-input py-1 text-sm"
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
