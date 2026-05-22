import { useEffect, useMemo, useState, useRef } from 'react'
import { useLocation, useParams, Link, useNavigate } from 'react-router-dom'
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import type { SuiClient } from '@mysten/sui/client'
import {
  aggregateStats,
  decryptAllResponses,
  fetchClaimedEvents,
  type DashboardStats,
  type SurveyClaimedEvent,
  type DecryptedResponse,
} from '../lib/dashboardDecrypt'
import { buildClosePtb } from '../lib/ptb'
import { formatSsr } from '../lib/format'
import { KEY_DERIVE_MSG, base64urlToBytes, deriveCreatorKeyPair, decryptSurveyContent } from '../lib/crypto'
import { parseFullSurveyMarkdown, type Question } from '../lib/frontmatter'
import { normalizeBytes, bytesToHex } from '../lib/answerCodec'
import QRCode from 'qrcode'

const SURVEY_KEY_PREFIX = 'surveysui:survey:'

function normalizeSuiId(id: string): string {
  if (!id) return ''
  let cleaned = id.toLowerCase().trim()
  if (cleaned.startsWith('0x')) {
    cleaned = cleaned.slice(2)
  }
  return cleaned.padStart(64, '0')
}

function formatVaultId(id: string): string {
  if (!id) return ''
  const clean = id.startsWith('0x') ? id : `0x${id}`
  if (clean.length <= 16) return clean
  return `${clean.slice(0, 8)}...${clean.slice(-6)}`
}

function formatDateTime(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`
}

function getSavedContentKey(vId: string): string {
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k && k.startsWith(SURVEY_KEY_PREFIX)) {
      try {
        const val = JSON.parse(window.localStorage.getItem(k) || '{}')
        if (val.vaultId === vId && val.contentKeyB64) {
          return `#${val.contentKeyB64}`
        }
      } catch { }
    }
  }
  return ''
}

function getPackageId(): string {
  return import.meta.env.VITE_PACKAGE_ID ?? ''
}

interface VaultFields {
  creator: string
  balance: string
  status: number
  claimed_count: string
  max_responses: string
  closed_at_ms?: string
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

type EventsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; events: SurveyClaimedEvent[] }
  | { kind: 'error'; error: string }

export default function DashboardPage() {
  const { vaultId } = useParams<{ vaultId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage()

  const contentKeyB64 = useMemo(() => {
    let key = location.hash.startsWith('#') ? location.hash.slice(1) : ''
    if (!key && vaultId) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith(SURVEY_KEY_PREFIX)) {
          try {
            const val = JSON.parse(window.localStorage.getItem(k) || '{}')
            if (val.vaultId === vaultId) {
              key = val.contentKeyB64
              break
            }
          } catch { }
        }
      }
    }
    return key
  }, [vaultId, location.hash])

  // ── 鏈上 vault 物件 ────────────────────────────────────────────────────────
  const { data: vaultData, refetch: refetchVault } = useSuiClientQuery(
    'getObject',
    { id: vaultId ?? '', options: { showContent: true } },
    { enabled: !!vaultId },
  )

  const vault = useMemo<VaultFields | null>(() => {
    const content = (vaultData as { data?: { content?: { dataType: string; fields: VaultFields } } } | undefined)?.data?.content
    if (!content || content.dataType !== 'moveObject') return null
    return content.fields
  }, [vaultData])

  // ── SurveyClaimed events ───────────────────────────────────────────────────
  const [eventsState, setEventsState] = useState<EventsState>({ kind: 'idle' })

  useEffect(() => {
    if (!vaultId || !getPackageId()) return
    let cancelled = false
    setEventsState({ kind: 'loading' })
    fetchClaimedEvents(suiClient as unknown as SuiClient, vaultId, getPackageId())
      .then((events) => {
        if (!cancelled) setEventsState({ kind: 'loaded', events })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setEventsState({
            kind: 'error',
            error: err instanceof Error ? err.message : '事件載入失敗',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [vaultId, suiClient])

  const events = eventsState.kind === 'loaded' ? eventsState.events : []
  const responseCount = events.length

  const [copied, setCopied] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // ── 鏈上 survey 物件 ────────────────────────────────────────────────────────
  const [surveyId, setSurveyId] = useState<string | null>(null)
  const [surveyData, setSurveyData] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [schemaHashStr, setSchemaHashStr] = useState<string>('')
  const [creatorSurveys, setCreatorSurveys] = useState<
    Array<{ vault_id: string; survey_id: string; question_count: number; registered_at_ms: number }>
  >([])

  interface CreatorSurveyDetail {
    vault_id: string
    survey_id: string
    title: string
    question_count: number
    registered_at_ms: number
    status: number
    claimed_count: number
    max_responses: number
  }

  const [surveyDetails, setSurveyDetails] = useState<CreatorSurveyDetail[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

  const sortedSurveyDetails = useMemo(() => {
    return [...surveyDetails].sort((a, b) => {
      const aActive = a.status === 0 ? 0 : 1
      const bActive = b.status === 0 ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      return b.registered_at_ms - a.registered_at_ms
    })
  }, [surveyDetails])

  useEffect(() => {
    if (!vaultId) return
    let cancelled = false
    async function resolveSurvey() {
      if (!suiClient || typeof suiClient.queryEvents !== 'function' || typeof suiClient.getObject !== 'function') return
      try {
        console.log('[DashboardPage] Querying on-chain registry events to resolve survey_id...')
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
          setSurveyId(prev => prev === sId ? prev : sId)
          const obj = await suiClient.getObject({
            id: sId,
            options: { showContent: true }
          })
          if (obj.data && !cancelled) {
            setSurveyData(prev => JSON.stringify(prev) === JSON.stringify(obj.data) ? prev : obj.data)
          }
        }
      } catch (err) {
        console.error('[DashboardPage] Failed to resolve survey:', err)
      }
    }
    void resolveSurvey()
    return () => { cancelled = true }
  }, [vaultId, suiClient])

  useEffect(() => {
    if (!account?.address || !getPackageId()) return
    if (!suiClient || typeof (suiClient as unknown as SuiClient).queryEvents !== 'function') return
    let cancelled = false
    async function loadCreatorSurveys() {
      try {
        let cursor: any = null
        let mine: Array<{ vault_id: string; survey_id: string; question_count: number; registered_at_ms: number }> = []
        let pageCount = 0
        do {
          const res = await (suiClient as unknown as SuiClient).queryEvents({
            query: {
              MoveEventType: `${getPackageId()}::survey_registry::SurveyRegistered`,
            },
            cursor,
            limit: 50,
            order: 'descending',
          })
          const pageMine = (res.data as any[])
            .filter((e: any) => normalizeSuiId(e.parsedJson?.creator || '') === normalizeSuiId(account?.address || ''))
            .map((e: any) => ({
              vault_id: e.parsedJson.vault_id as string,
              survey_id: e.parsedJson.survey_id as string,
              question_count: e.parsedJson.question_count ? Number(e.parsedJson.question_count) : 0,
              registered_at_ms: e.parsedJson.registered_at_ms ? Number(e.parsedJson.registered_at_ms) : 0,
            }))
          mine = [...mine, ...pageMine]
          cursor = res.hasNextPage ? res.nextCursor : null
          pageCount++
        } while (cursor && pageCount < 10)

        // Deduplicate surveys by vault_id to prevent redundant requests and displays
        const seen = new Set<string>()
        const uniqueMine: typeof mine = []
        for (const item of mine) {
          const normId = normalizeSuiId(item.vault_id)
          if (!seen.has(normId)) {
            seen.add(normId)
            uniqueMine.push(item)
          }
        }
        mine = uniqueMine

        if (!cancelled) {
          setCreatorSurveys(prev => {
            const isIdentical = prev.length === mine.length &&
              prev.every((s, idx) => {
                const m = mine[idx]
                return s.vault_id === m.vault_id &&
                  s.survey_id === m.survey_id &&
                  s.question_count === m.question_count &&
                  s.registered_at_ms === m.registered_at_ms
              })
            return isIdentical ? prev : mine
          })
        }
      } catch (err) {
        console.error('[DashboardPage] Failed to load creator surveys:', err)
      }
    }
    void loadCreatorSurveys()
    return () => { cancelled = true }
  }, [account?.address, suiClient])

  useEffect(() => {
    if (creatorSurveys.length === 0 || !suiClient) {
      setSurveyDetails([])
      return
    }
    let cancelled = false
    setLoadingDetails(true)

    async function fetchDetails() {
      try {
        const surveyIds = creatorSurveys.map(s => s.survey_id)
        const vaultIds = creatorSurveys.map(s => s.vault_id)

        const surveyObjs = await suiClient.multiGetObjects({
          ids: surveyIds,
          options: { showContent: true }
        })

        const vaultObjs = await suiClient.multiGetObjects({
          ids: vaultIds,
          options: { showContent: true }
        })

        const details: CreatorSurveyDetail[] = []

        for (let i = 0; i < creatorSurveys.length; i++) {
          const s = creatorSurveys[i]
          const surveyObj = surveyObjs[i]
          const vaultObj = vaultObjs[i]

          let title = `問卷 #${s.survey_id.slice(0, 6)}`
          let status = 0
          let claimed_count = 0
          let max_responses = 0

          const sFields = (surveyObj?.data?.content as any)?.fields
          if (sFields) {
            status = sFields.status !== undefined ? Number(sFields.status) : 0
            const encContent = sFields.encrypted_content ? normalizeBytes(sFields.encrypted_content) : null
            if (encContent) {
              try {
                const savedKey = getSavedContentKey(s.vault_id)
                if (savedKey) {
                  const keyBytes = base64urlToBytes(savedKey.slice(1))
                  const dec = await decryptSurveyContent(encContent, keyBytes)
                  const parsed = parseFullSurveyMarkdown(dec.markdown)
                  if (parsed.ok && parsed.data.title) {
                    title = parsed.data.title
                  }
                } else if (encContent.length >= 32) {
                  const md = new TextDecoder().decode(encContent.slice(32))
                  const parsed = parseFullSurveyMarkdown(md)
                  if (parsed.ok && parsed.data.title) {
                    title = parsed.data.title
                  }
                }
              } catch (e) {
                console.warn('Failed to decrypt title for list item:', s.survey_id, e)
              }
            }
          }

          const vFields = (vaultObj?.data?.content as any)?.fields
          if (vFields) {
            claimed_count = vFields.claimed_count !== undefined ? Number(vFields.claimed_count) : 0
            max_responses = vFields.max_responses !== undefined ? Number(vFields.max_responses) : 0
            if (vFields.status !== undefined) {
              status = Number(vFields.status)
            }
          }

          details.push({
            vault_id: s.vault_id,
            survey_id: s.survey_id,
            title,
            question_count: s.question_count,
            registered_at_ms: s.registered_at_ms,
            status,
            claimed_count,
            max_responses
          })
        }

        if (!cancelled) {
          setSurveyDetails(prev => {
            const isIdentical = prev.length === details.length &&
              prev.every((s, idx) => {
                const d = details[idx]
                return s.vault_id === d.vault_id &&
                  s.survey_id === d.survey_id &&
                  s.title === d.title &&
                  s.question_count === d.question_count &&
                  s.registered_at_ms === d.registered_at_ms &&
                  s.status === d.status &&
                  s.claimed_count === d.claimed_count &&
                  s.max_responses === d.max_responses
              })
            return isIdentical ? prev : details
          })
          setLoadingDetails(false)
        }
      } catch (err) {
        console.error('[DashboardPage] Failed to fetch survey details:', err)
        if (!cancelled) {
          setLoadingDetails(false)
        }
      }
    }

    void fetchDetails()
    return () => { cancelled = true }
  }, [creatorSurveys, suiClient])

  useEffect(() => {
    if (!surveyData) return
    const fields = surveyData.content?.fields as any
    if (!fields) return

    let hashBytes = fields.schema_hash ? normalizeBytes(fields.schema_hash) : new Uint8Array(0)
    const newHash = bytesToHex(hashBytes)
    setSchemaHashStr(prev => prev === newHash ? prev : newHash)

    // Determine contentKey (already computed via useMemo at the top)

    let rawContent = normalizeBytes(fields.encrypted_content)

    async function loadQuestions() {
      try {
        if (contentKeyB64) {
          const keyBytes = base64urlToBytes(contentKeyB64)
          const dec = await decryptSurveyContent(rawContent, keyBytes)
          const parsed = parseFullSurveyMarkdown(dec.markdown)
          if (parsed.ok) {
            setQuestions(prev => JSON.stringify(prev) === JSON.stringify(parsed.data.questions) ? prev : parsed.data.questions)
          }
        } else {
          if (rawContent.length >= 32) {
            const md = new TextDecoder().decode(rawContent.slice(32))
            const parsed = parseFullSurveyMarkdown(md)
            if (parsed.ok) {
              setQuestions(prev => JSON.stringify(prev) === JSON.stringify(parsed.data.questions) ? prev : parsed.data.questions)
            }
          }
        }
      } catch (err) {
        console.error('[DashboardPage] Failed to decrypt/parse survey questions:', err)
      }
    }

    void loadQuestions()
  }, [surveyData, vaultId, location.hash])

  // ── 解密 ──────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [decryptedResponses, setDecryptedResponses] = useState<DecryptedResponse[] | null>(null)
  const [decryptStatus, setDecryptStatus] = useState<
    'idle' | 'signing' | 'decrypting' | 'done' | 'error'
  >('idle')
  const [decryptError, setDecryptError] = useState<string | null>(null)

  const isCreator = !!account && !!vault && normalizeSuiId(account.address) === normalizeSuiId(vault.creator)
  const isActive = vault?.status === 0

  async function handleDecrypt() {
    if (!isCreator || decryptStatus === 'signing' || decryptStatus === 'decrypting') return
    setDecryptError(null)
    setDecryptStatus('signing')
    try {
      const message = new TextEncoder().encode(KEY_DERIVE_MSG)
      const { signature } = await signPersonalMessageAsync({ message })
      const sigBytes = base64ToBytes(signature)
      const kp = await deriveCreatorKeyPair(sigBytes)
      setDecryptStatus('decrypting')
      const { responses } = await decryptAllResponses(events, kp.privateKey, questions || [], schemaHashStr || '')
      const s = aggregateStats(responses, events.length)
      setStats(s)
      setDecryptedResponses(responses)
      setDecryptStatus('done')
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : '解密失敗')
      setDecryptStatus('error')
    }
  }

  function handleDownloadCsv() {
    if (!decryptedResponses || !questions) return

    // Prepare headers
    const headers = ['Respondent', 'Submitted Time', ...questions.map(q => q.prompt ? `${q.id}: ${q.prompt}` : q.id)]

    // Prepare rows
    const rows = decryptedResponses.map(resp => {
      const timeStr = new Date(resp.claimed_at_ms).toLocaleString('zh-TW')
      const rowAnswers = questions.map(q => {
        const val = resp.answers[q.id]
        if (val === undefined || val === null) return ''
        if (Array.isArray(val)) {
          return val.join('; ')
        }
        return String(val)
      })
      return [resp.respondent, timeStr, ...rowAnswers]
    })

    // Convert to CSV string, handling quotes and escaping
    const escapeCsv = (str: string) => {
      const escaped = str.replace(/"/g, '""')
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') || escaped.includes('\r')) {
        return `"${escaped}"`
      }
      return escaped
    }

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map(row => row.map(escapeCsv).join(','))
    ].join('\r\n')

    // Download file with UTF-8 BOM
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `survey_responses_${vaultId || 'export'}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function handleDownloadQr() {
    if (!qrCanvasRef.current) return
    const url = qrCanvasRef.current.toDataURL('image/png')
    const link = document.createElement('a')
    link.href = url
    link.download = `survey_qrcode_${vaultId || 'export'}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // contentKey hash 是給受訪者用的；creator 自己用簽名衍生金鑰
  // 但保留 base64urlToBytes import 以利 v2 收件人模式擴充
  void contentKeyB64
  void base64urlToBytes

  // ── 結束活動 ──────────────────────────────────────────────────────────────
  const [closeStatus, setCloseStatus] = useState<
    'idle' | 'signing' | 'success' | 'error'
  >('idle')
  const [closeError, setCloseError] = useState<string | null>(null)

  const canClose =
    isActive &&
    closeStatus !== 'signing' &&
    closeStatus !== 'success'

  function handleClose() {
    if (!vaultId || !canClose) return
    setCloseError(null)
    setCloseStatus('signing')
    let tx
    try {
      tx = buildClosePtb({ packageId: getPackageId(), vaultId })
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'PTB 建構失敗')
      setCloseStatus('error')
      return
    }
    signAndExecute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { transaction: tx as any },
      {
        onSuccess: () => {
          setCloseStatus('success')
          void refetchVault()
        },
        onError: (err) => {
          setCloseError(err.message)
          setCloseStatus('error')
        },
      },
    )
  }

  // ── 顯示 ──────────────────────────────────────────────────────────────────
  const displayBalanceSsr = vault
    ? formatSsr(vault.balance)
    : null


  if (!vaultId) {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto text-neutral-850 dark:text-neutral-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">我的儀表板</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-450 mt-1">
              管理您發布的所有問卷調查。💡 <strong>點擊列表中任何問卷卡片</strong>，即可進入查看詳細數據與填答明細。
            </p>
          </div>
          {account && (
            <Link
              to="/create"
              className="self-start sm:self-auto whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl transition-all shadow-sm text-sm"
            >
              ＋ 建立問卷
            </Link>
          )}
        </div>

        {!account ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 text-center shadow-sm max-w-md mx-auto my-12 transition-colors">
            <div className="text-4xl mb-4">🔑</div>
            <h2 className="text-xl font-bold mb-2 text-neutral-900 dark:text-white">需要連接錢包</h2>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-6 leading-relaxed">
              請先連接您的 Sui 錢包，以讀取並管理您所發布的問卷。
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : loadingDetails ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mb-4"></div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">正在從 Sui 區塊鏈加載問卷清單及狀態...</p>
          </div>
        ) : surveyDetails.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-150 dark:border-neutral-800 rounded-2xl p-10 text-center shadow-sm max-w-lg mx-auto my-8 transition-colors">
            <div className="text-5xl mb-4">📋</div>
            <h3 className="text-lg font-bold text-neutral-800 dark:text-white mb-2">您尚未建立任何問卷</h3>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-6 leading-relaxed">
              您可以使用 Markdown 輕易設計問卷內容，並存入 SSR 獎勵注資，受訪者即可在 Sui 上進行填答。
            </p>
            <Link
              to="/create"
              className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-md text-sm"
            >
              立即建立第一份問卷
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-[3px]">
            {/* 標頭卡片 */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3.5 bg-neutral-100 dark:bg-neutral-800 rounded-xs 
            text-sm font-normal text-neutral-700 dark:text-neutral-300 uppercase tracking-wider transition-colors">
              <div className="col-span-5">問卷標題</div>
              <div className="col-span-3">建立日期</div>
              <div className="col-span-2">填答進度</div>
              <div className="col-span-2 text-right">狀態</div>
            </div>

            {/* 問卷卡片列表 */}
            {sortedSurveyDetails.map((s) => (
              <div
                key={s.vault_id}
                onClick={() => navigate(`/dashboard/${s.vault_id}${getSavedContentKey(s.vault_id)}`)}
                className="cursor-pointer bg-white dark:bg-neutral-900 rounded-sm px-6 py-4 flex flex-col 
                gap-3 sm:grid sm:grid-cols-12 sm:gap-4 sm:items-center 
                hover:bg-neutral-100/90 dark:hover:bg-neutral-800/60 transition-colors duration-150"
              >
                {/* 欄位 1: 問卷標題 */}
                <div className="sm:col-span-5 break-words" title={s.title}>
                  <span className="font-mono text-neutral-900 dark:text-neutral-100 block">{s.title}</span>
                  <div className="font-mono text-xxs text-neutral-400 mt-1" title={s.vault_id}>Vault: {formatVaultId(s.vault_id)}</div>
                </div>

                {/* 欄位 2: 建立日期 */}
                <div className="sm:col-span-3 text-sm text-neutral-500 dark:text-neutral-400 flex items-center justify-between sm:block">
                  <span className="sm:hidden text-xs font-bold text-neutral-400 uppercase">建立日期:</span>
                  <span>{s.registered_at_ms ? formatDateTime(s.registered_at_ms) : '—'}</span>
                </div>

                {/* 欄位 3: 填答進度 */}
                <div className="sm:col-span-2 flex items-center justify-between sm:justify-start gap-2">
                  <span className="sm:hidden text-xs font-bold text-neutral-400 uppercase">填答進度:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-neutral-800 dark:text-neutral-200 whitespace-nowrap">{s.claimed_count} / {s.max_responses}</span>
                    <div className="w-16 bg-neutral-100 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden flex-shrink-0">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (s.claimed_count / (s.max_responses || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 欄位 4: 狀態 */}
                <div className="sm:col-span-2 sm:text-right flex items-center justify-between sm:justify-end gap-2">
                  <span className="sm:hidden text-xs font-bold text-neutral-400 uppercase">狀態:</span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${s.status === 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/30'
                    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 border-neutral-200/50 dark:border-neutral-700/30'
                    }`}>
                    {s.status === 0 ? '進行中' : '已結束'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    )
  }

  const currentSurvey = surveyDetails.find((s) => s.vault_id === vaultId)
  const surveyTitle = currentSurvey ? currentSurvey.title : (loadingDetails ? '載入中…' : '問卷')
  const fullUrl = surveyId ? `${window.location.origin}/s/${surveyId}${contentKeyB64 ? `#${contentKeyB64}` : ''}` : ''

  useEffect(() => {
    if (showQrModal && qrCanvasRef.current && fullUrl) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        fullUrl,
        {
          width: 240,
          margin: 2,
          color: {
            dark: '#1d4ed8',
            light: '#ffffff',
          },
        },
        (error) => {
          if (error) console.error('[DashboardPage] Failed to generate QR Code:', error)
        }
      )
    }
  }, [showQrModal, fullUrl])

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto text-neutral-850 dark:text-neutral-200">
      <div className="mb-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-semibold">
          ← 返回我的問卷列表
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-1 text-neutral-900 dark:text-white">{surveyTitle}</h1>
      <h2 className="text-lg font-semibold text-neutral-500 dark:text-neutral-450 mb-2">問卷儀表板</h2>
      <p className="text-sm text-neutral-500 mb-2 break-all font-mono">
        Vault: <span className="font-semibold">{vaultId}</span>
      </p>
      <p className="text-sm text-neutral-500 mb-2">
        狀態：
        <span
          className={
            isActive
              ? 'text-green-600 font-semibold'
              : 'text-neutral-500 font-semibold'
          }
        >
          {vault ? (isActive ? '進行中' : '已結束') : '查詢中'}
        </span>
      </p>
      {vault && !isActive && (
        <p className="text-sm text-neutral-500 mb-6">
          結束時間：
          <span className="font-semibold">
            {vault.closed_at_ms && Number(vault.closed_at_ms) > 0
              ? formatDateTime(Number(vault.closed_at_ms))
              : '—'}
          </span>
        </p>
      )}
      {(!vault || isActive) && <div className="mb-6" />}

      {surveyId && (
        <section className="mb-6 bg-blue-50 rounded p-4 flex items-center gap-3">
          <a
            href={`/s/${surveyId}${contentKeyB64 ? `#${contentKeyB64}` : ''}`}
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-semibold cursor-pointer"
            aria-label="填答連結"
          >
            填答連結
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(fullUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className={`px-3 py-1 text-sm rounded font-medium transition-colors ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {copied ? '已複製' : '複製'}
          </button>
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="px-3 py-1 text-sm rounded font-medium bg-neutral-600 text-white hover:bg-neutral-700 transition-colors"
            aria-label="顯示二維碼"
          >
            QR Code
          </button>
        </section>
      )}

      {eventsState.kind === 'error' && (
        <p role="alert" className="text-red-600 mb-4 text-sm">
          {eventsState.error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded p-4">
          <p className="text-sm text-gray-500">回覆數</p>
          <p className="text-2xl font-bold" aria-label="response-count">
            {responseCount}
          </p>
        </div>
        <div className="bg-gray-50 rounded p-4">
          <p className="text-sm text-gray-500">回覆進度</p>
          <p className="text-2xl font-bold" aria-label="received-over-max">
            {responseCount} / {vault ? vault.max_responses : '—'}
          </p>
        </div>
        <div className="bg-gray-50 rounded p-4">
          <p className="text-sm text-gray-500">Vault 餘額（鏈上）</p>
          <p className="text-2xl font-bold" aria-label="vault-balance">
            {displayBalanceSsr !== null
              ? `${displayBalanceSsr} SSR`
              : '查詢中…'}
          </p>
        </div>
      </div>

      {/* ── 解密 + 統計圖表 ──────────────────────────────────────────────── */}
      {responseCount === 0 ? (
        <div className="bg-gray-50 rounded p-6 text-center text-gray-500 mb-6">
          尚無回覆。請等待受訪者填答後再回來查看統計。
        </div>
      ) : (
        <section className="mb-6">
          {decryptStatus === 'idle' && isCreator && (
            <button
              type="button"
              onClick={() => void handleDecrypt()}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              解密回覆並查看統計
            </button>
          )}
          {(decryptStatus === 'signing' || decryptStatus === 'decrypting') && (
            <p className="text-sm text-gray-500">
              {decryptStatus === 'signing' ? '請於錢包中簽名以衍生解密金鑰…' : '解密中…'}
            </p>
          )}
          {decryptStatus === 'error' && decryptError && (
            <p role="alert" className="text-red-600 text-sm">
              {decryptError}
            </p>
          )}

          {decryptedResponses && questions && (
            <div className="mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h3 className="text-xl font-bold text-gray-800">答卷明文數據</h3>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg transition-colors text-sm flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
                  下載 CSV 檔案
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl bg-white shadow-sm max-w-full">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">#</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">受訪者（Respondent）</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">填答時間（Submitted Time）</th>
                      {questions.map((q) => (
                        <th key={q.id} scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap max-w-xs truncate" title={q.prompt}>
                          {q.id}: {q.prompt}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {decryptedResponses.map((resp, idx) => (
                      <tr key={resp.respondent + idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 text-gray-400 font-mono whitespace-nowrap">{idx + 1}</td>
                        <td className="px-4 py-3 text-gray-600 font-mono whitespace-nowrap" title={resp.respondent}>
                          {resp.respondent.slice(0, 8)}...{resp.respondent.slice(-8)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(resp.claimed_at_ms).toLocaleString('zh-TW')}
                        </td>
                        {questions.map((q) => {
                          const val = resp.answers[q.id]
                          let displayVal = '—'
                          if (val !== undefined && val !== null) {
                            if (Array.isArray(val)) {
                              displayVal = val.join(', ')
                            } else {
                              displayVal = String(val)
                            }
                          }
                          return (
                            <td key={q.id} className="px-4 py-3 text-gray-800 whitespace-nowrap max-w-xs truncate" title={displayVal}>
                              {displayVal}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats && stats.failed_count > 0 && (
            <p className="text-xs text-amber-600">
              有 {stats.failed_count} 筆回覆無法解密（金鑰不符或資料毀損）。
            </p>
          )}
        </section>
      )}

      {/* ── 結束活動 ─────────────────────────────────────────────────────── */}
      {((closeStatus !== 'idle') || (isCreator)) && (
        <div className="mt-6 border-t pt-6">
          {closeStatus === 'success' && (
            <p role="status" className="text-green-700 mb-3 text-sm">
              活動已成功結束，剩餘 SSR 已退回您的錢包。
            </p>
          )}
          {closeStatus === 'error' && closeError && (
            <p role="alert" className="text-red-600 mb-3 text-sm break-all">
              {closeError}
            </p>
          )}

          {isCreator && (
            <button
              type="button"
              onClick={handleClose}
              disabled={!canClose}
              className={
                isActive
                  ? 'bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50 transition-colors'
                  : 'bg-neutral-400 text-white px-6 py-2 rounded cursor-default'
              }
            >
              {!isActive ? '已結束' : closeStatus === 'signing' ? '結束中…' : '結束活動'}
            </button>
          )}
        </div>
      )}

      {/* ── 我的問卷列表 (Bottom Switcher) ────────────────────────────────── */}
      {creatorSurveys.length > 0 && (
        <section className="mt-8 border-t pt-6">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-neutral-850 dark:text-neutral-200">切換其他問卷</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-450 mt-1">
              💡 <strong>點擊下方任何問卷卡片</strong>，即可快速切換查看該問卷的數據儀表板。
            </p>
          </div>
          <div className="flex flex-col gap-[3px] text-sm">
            {sortedSurveyDetails.map((s) => (
              <div
                key={s.vault_id}
                role="row"
                onClick={() => s.vault_id !== vaultId && navigate(`/dashboard/${s.vault_id}${getSavedContentKey(s.vault_id)}`)}
                className={`flex items-center justify-between px-4 py-2 rounded-xs transition-colors duration-150 group ${s.vault_id === vaultId
                  ? 'bg-neutral-50/50 dark:bg-neutral-800/30 cursor-default'
                  : 'bg-white dark:bg-neutral-900 cursor-pointer hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60'
                  }`}
              >
                <div className="text-neutral-900 dark:text-white font-semibold">
                  {s.title}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-neutral-500 dark:text-neutral-400 font-mono whitespace-nowrap">
                    {s.claimed_count} / {s.max_responses}
                  </div>
                  <div className="w-24 text-right">
                    {s.vault_id === vaultId ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        目前選擇
                      </span>
                    ) : (
                      <span className="text-neutral-400 group-hover:text-blue-500 transition-colors text-xs font-bold opacity-0 group-hover:opacity-100 mr-2">
                        切換 ➔
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showQrModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 transition-opacity duration-300"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="bg-white dark:bg-neutral-900 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl border border-neutral-200 dark:border-neutral-800 flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">問卷填答 QR Code</h3>
            
            <div className="bg-white p-2 rounded border border-neutral-100 dark:border-neutral-800">
              <canvas ref={qrCanvasRef} className="max-w-full h-auto" />
            </div>
            
            <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
              受訪者可以使用手機相機掃描上方二維碼直接進入問卷填答頁面。
            </p>

            <div className="flex gap-2 w-full mt-2">
              <button
                type="button"
                onClick={handleDownloadQr}
                className="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              >
                下載 PNG
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="flex-1 py-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
