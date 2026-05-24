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
import {
  KEY_DERIVE_MSG,
  base64urlToBytes,
  deriveCreatorKeyPair,
  decryptSurveyContent,
} from '../lib/crypto'
import { parseFullSurveyMarkdown, type Question } from '../lib/frontmatter'
import { normalizeBytes, bytesToHex } from '../lib/answerCodec'
import QRCode from 'qrcode'
import { useLanguage } from '../context/LanguageContext'

const SURVEY_KEY_PREFIX = 'surveysui:survey:'

const content = {
  ZH: {
    dashboardTitle: '我的儀表板',
    dashboardDescPrefix: '管理您發布的所有問卷調查。',
    dashboardDescStrong: '點擊列表中任何問卷卡片',
    dashboardDescSuffix: '，即可進入查看詳細數據與填答明細。',
    btnCreateSurvey: '＋ 建立問卷',
    walletRequired: '需要連接錢包',
    walletRequiredDesc: '請先連接您的 Sui 錢包，以讀取並管理您所發布的問卷。',
    loadingSurveys: '正在從 Sui 區塊鏈加載問卷清單及狀態...',
    noSurveys: '您尚未建立任何問卷',
    noSurveysDesc: '您可以使用 Markdown 輕易設計問卷內容,並存入 SSR 獎勵注資,受訪者即可在 Sui 上進行填答。',
    createFirstSurvey: '立即建立第一份問卷',
    colTitle: '問卷標題',
    colCreatedAt: '建立日期',
    colProgress: '填答進度',
    colStatus: '狀態',
    mobileCreatedAt: '建立日期:',
    mobileProgress: '填答進度:',
    mobileStatus: '狀態:',
    statusActive: '進行中',
    statusFull: '待結案',
    statusClosed: '已結束',
    loadingShort: '載入中…',
    surveyDefault: '問卷',
    backToList: '← 返回我的問卷列表',
    subtitle: '問卷儀表板',
    statusLabel: '狀態:',
    checking: '查詢中',
    closedAtLabel: '結束時間:',
    claimLink: '填答連結',
    claimLinkAria: '填答連結',
    copied: '已複製',
    copy: '複製',
    qrCodeAria: '顯示二維碼',
    statResponseCount: '回覆數',
    statResponseProgress: '回覆進度',
    statVaultBalance: 'Vault 餘額（鏈上）',
    checkingShort: '查詢中…',
    noResponses: '尚無回覆。請等待受訪者填答後再回來查看統計。',
    decryptBtn: '解密回覆並查看統計',
    signingMsg: '請於錢包中簽名以衍生解密金鑰…',
    decryptingMsg: '解密中…',
    responsesTitle: '答卷明文數據',
    displayCount: (n: number) => `顯示 ${n} 筆`,
    displayUniqueCount: (n: number, total: number) => `顯示 ${n} 位（共 ${total} 筆提交）`,
    viewModeLabel: '顯示模式',
    allSubmissions: '所有提交',
    latestPerPerson: '每位最新一次',
    csvTooltip: 'CSV 永遠匯出全部提交（不受顯示切換影響）',
    downloadCsv: '下載 CSV（全部）',
    hasRepeatsInfo: '此問卷存在重複填答;切換至「每位最新一次」可只看每位受訪者最後提交的版本。',
    respondentHeader: '受訪者（Respondent）',
    submittedTimeHeader: '填答時間（Submitted Time）',
    decryptFailedCount: (n: number) => `有 ${n} 筆回覆無法解密（金鑰不符或資料毀損）。`,
    closeSuccess: '活動已成功結束,剩餘 SSR 已退回您的錢包。',
    btnClosed: '已結束',
    btnClosing: '結束中…',
    btnClose: '結束活動',
    switchSurveys: '切換其他問卷',
    switchSurveysDescStrong: '點擊下方任何問卷卡片',
    switchSurveysDescSuffix: '，即可快速切換查看該問卷的數據儀表板。',
    currentlySelected: '目前選擇',
    switchArrow: '切換 ➔',
    qrModalTitle: '問卷填答 QR Code',
    qrModalDesc: '受訪者可以使用手機相機掃描上方二維碼直接進入問卷填答頁面。',
    downloadPng: '下載 PNG',
    close: '關閉',
    errEventsFailed: '事件載入失敗',
    errDecryptFailed: '解密失敗',
    errPtbBuildFailed: 'PTB 建構失敗',
    surveyTitlePrefix: '問卷 #',
  },
  EN: {
    dashboardTitle: 'My Dashboard',
    dashboardDescPrefix: 'Manage all the surveys you have published. ',
    dashboardDescStrong: 'Click any survey card in the list',
    dashboardDescSuffix: ' to view detailed statistics and response data.',
    btnCreateSurvey: '+ Create Survey',
    walletRequired: 'Wallet Connection Required',
    walletRequiredDesc: 'Please connect your Sui wallet first to read and manage the surveys you have published.',
    loadingSurveys: 'Loading survey list and status from the Sui blockchain...',
    noSurveys: 'You have not created any surveys yet',
    noSurveysDesc: 'You can easily design survey content using Markdown, deposit SSR rewards, and respondents can then fill them out on Sui.',
    createFirstSurvey: 'Create your first survey now',
    colTitle: 'Survey Title',
    colCreatedAt: 'Created',
    colProgress: 'Progress',
    colStatus: 'Status',
    mobileCreatedAt: 'Created:',
    mobileProgress: 'Progress:',
    mobileStatus: 'Status:',
    statusActive: 'Active',
    statusFull: 'Pending Close',
    statusClosed: 'Closed',
    loadingShort: 'Loading…',
    surveyDefault: 'Survey',
    backToList: '← Back to my survey list',
    subtitle: 'Survey Dashboard',
    statusLabel: 'Status:',
    checking: 'Loading',
    closedAtLabel: 'Closed at:',
    claimLink: 'Response Link',
    claimLinkAria: 'Response link',
    copied: 'Copied',
    copy: 'Copy',
    qrCodeAria: 'Show QR code',
    statResponseCount: 'Responses',
    statResponseProgress: 'Progress',
    statVaultBalance: 'Vault Balance (On-chain)',
    checkingShort: 'Loading…',
    noResponses: 'No responses yet. Please wait for respondents to fill the survey before checking statistics.',
    decryptBtn: 'Decrypt responses and view statistics',
    signingMsg: 'Please sign in your wallet to derive the decryption key…',
    decryptingMsg: 'Decrypting…',
    responsesTitle: 'Response Plaintext Data',
    displayCount: (n: number) => `Showing ${n} entries`,
    displayUniqueCount: (n: number, total: number) => `Showing ${n} respondents (out of ${total} submissions)`,
    viewModeLabel: 'View mode',
    allSubmissions: 'All submissions',
    latestPerPerson: 'Latest per respondent',
    csvTooltip: 'CSV always exports all submissions (regardless of view mode)',
    downloadCsv: 'Download CSV (All)',
    hasRepeatsInfo: 'This survey contains repeat responses; switch to "Latest per respondent" to see only each respondent\'s most recent submission.',
    respondentHeader: 'Respondent',
    submittedTimeHeader: 'Submitted Time',
    decryptFailedCount: (n: number) => `${n} responses could not be decrypted (key mismatch or data corruption).`,
    closeSuccess: 'Activity successfully closed. Remaining SSR has been returned to your wallet.',
    btnClosed: 'Closed',
    btnClosing: 'Closing…',
    btnClose: 'Close Activity',
    switchSurveys: 'Switch to other surveys',
    switchSurveysDescStrong: 'Click any survey card below',
    switchSurveysDescSuffix: ' to quickly switch and view that survey\'s dashboard.',
    currentlySelected: 'Selected',
    switchArrow: 'Switch ➔',
    qrModalTitle: 'Survey Response QR Code',
    qrModalDesc: 'Respondents can scan the QR code above with their phone camera to directly access the survey.',
    downloadPng: 'Download PNG',
    close: 'Close',
    errEventsFailed: 'Failed to load events',
    errDecryptFailed: 'Decryption failed',
    errPtbBuildFailed: 'PTB build failed',
    surveyTitlePrefix: 'Survey #',
  },
}

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

type SurveyState = 'active' | 'full' | 'closed'

function deriveSurveyState(status: number, claimed: number, max: number): SurveyState {
  if (status !== 0) return 'closed'
  if (max > 0 && claimed >= max) return 'full'
  return 'active'
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
  const { lang } = useLanguage()
  const t = content[lang]

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
    { enabled: !!vaultId }
  )

  const vault = useMemo<VaultFields | null>(() => {
    const content = (
      vaultData as { data?: { content?: { dataType: string; fields: VaultFields } } } | undefined
    )?.data?.content
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
            error: err instanceof Error ? err.message : t.errEventsFailed,
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
      if (
        !suiClient ||
        typeof suiClient.queryEvents !== 'function' ||
        typeof suiClient.getObject !== 'function'
      )
        return
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
          setSurveyId((prev) => (prev === sId ? prev : sId))
          const obj = await suiClient.getObject({
            id: sId,
            options: { showContent: true },
          })
          if (obj.data && !cancelled) {
            setSurveyData((prev: any) =>
              JSON.stringify(prev) === JSON.stringify(obj.data) ? prev : obj.data
            )
          }
        }
      } catch (err) {
        console.error('[DashboardPage] Failed to resolve survey:', err)
      }
    }
    void resolveSurvey()
    return () => {
      cancelled = true
    }
  }, [vaultId, suiClient])

  useEffect(() => {
    if (!account?.address || !getPackageId()) return
    if (!suiClient || typeof (suiClient as unknown as SuiClient).queryEvents !== 'function') return
    let cancelled = false
    async function loadCreatorSurveys() {
      try {
        let cursor: any = null
        let mine: Array<{
          vault_id: string
          survey_id: string
          question_count: number
          registered_at_ms: number
        }> = []
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
            .filter(
              (e: any) =>
                normalizeSuiId(e.parsedJson?.creator || '') ===
                normalizeSuiId(account?.address || '')
            )
            .map((e: any) => ({
              vault_id: e.parsedJson.vault_id as string,
              survey_id: e.parsedJson.survey_id as string,
              question_count: e.parsedJson.question_count ? Number(e.parsedJson.question_count) : 0,
              registered_at_ms: e.parsedJson.registered_at_ms
                ? Number(e.parsedJson.registered_at_ms)
                : 0,
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
          setCreatorSurveys((prev) => {
            const isIdentical =
              prev.length === mine.length &&
              prev.every((s, idx) => {
                const m = mine[idx]
                return (
                  s.vault_id === m.vault_id &&
                  s.survey_id === m.survey_id &&
                  s.question_count === m.question_count &&
                  s.registered_at_ms === m.registered_at_ms
                )
              })
            return isIdentical ? prev : mine
          })
        }
      } catch (err) {
        console.error('[DashboardPage] Failed to load creator surveys:', err)
      }
    }
    void loadCreatorSurveys()
    return () => {
      cancelled = true
    }
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
        const surveyIds = creatorSurveys.map((s) => s.survey_id)
        const vaultIds = creatorSurveys.map((s) => s.vault_id)

        const surveyObjs = await suiClient.multiGetObjects({
          ids: surveyIds,
          options: { showContent: true },
        })

        const vaultObjs = await suiClient.multiGetObjects({
          ids: vaultIds,
          options: { showContent: true },
        })

        const details: CreatorSurveyDetail[] = []

        for (let i = 0; i < creatorSurveys.length; i++) {
          const s = creatorSurveys[i]
          const surveyObj = surveyObjs[i]
          const vaultObj = vaultObjs[i]

          let title = `${t.surveyTitlePrefix}${s.survey_id.slice(0, 6)}`
          let status = 0
          let claimed_count = 0
          let max_responses = 0

          const sFields = (surveyObj?.data?.content as any)?.fields
          if (sFields) {
            status = sFields.status !== undefined ? Number(sFields.status) : 0
            const encContent = sFields.encrypted_content
              ? normalizeBytes(sFields.encrypted_content)
              : null
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
            max_responses,
          })
        }

        if (!cancelled) {
          setSurveyDetails((prev) => {
            const isIdentical =
              prev.length === details.length &&
              prev.every((s, idx) => {
                const d = details[idx]
                return (
                  s.vault_id === d.vault_id &&
                  s.survey_id === d.survey_id &&
                  s.title === d.title &&
                  s.question_count === d.question_count &&
                  s.registered_at_ms === d.registered_at_ms &&
                  s.status === d.status &&
                  s.claimed_count === d.claimed_count &&
                  s.max_responses === d.max_responses
                )
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
    return () => {
      cancelled = true
    }
  }, [creatorSurveys, suiClient])

  useEffect(() => {
    if (!surveyData) return
    const fields = surveyData.content?.fields as any
    if (!fields) return

    let hashBytes = fields.schema_hash ? normalizeBytes(fields.schema_hash) : new Uint8Array(0)
    const newHash = bytesToHex(hashBytes)
    setSchemaHashStr((prev) => (prev === newHash ? prev : newHash))

    // Determine contentKey (already computed via useMemo at the top)

    let rawContent = normalizeBytes(fields.encrypted_content)

    async function loadQuestions() {
      try {
        if (contentKeyB64) {
          const keyBytes = base64urlToBytes(contentKeyB64)
          const dec = await decryptSurveyContent(rawContent, keyBytes)
          const parsed = parseFullSurveyMarkdown(dec.markdown)
          if (parsed.ok) {
            setQuestions((prev) =>
              JSON.stringify(prev) === JSON.stringify(parsed.data.questions)
                ? prev
                : parsed.data.questions
            )
          }
        } else {
          if (rawContent.length >= 32) {
            const md = new TextDecoder().decode(rawContent.slice(32))
            const parsed = parseFullSurveyMarkdown(md)
            if (parsed.ok) {
              setQuestions((prev) =>
                JSON.stringify(prev) === JSON.stringify(parsed.data.questions)
                  ? prev
                  : parsed.data.questions
              )
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
  /** 'all' = 顯示所有提交（含同地址多筆）；'latest' = 同地址僅顯示最新一次。CSV 永遠匯出全部。 */
  const [responseViewMode, setResponseViewMode] = useState<'all' | 'latest'>('all')
  const [decryptStatus, setDecryptStatus] = useState<
    'idle' | 'signing' | 'decrypting' | 'done' | 'error'
  >('idle')
  const [decryptError, setDecryptError] = useState<string | null>(null)

  const isCreator =
    !!account && !!vault && normalizeSuiId(account.address) === normalizeSuiId(vault.creator)
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
      const { responses } = await decryptAllResponses(
        events,
        kp.privateKey,
        questions || [],
        schemaHashStr || ''
      )
      const s = aggregateStats(responses, events.length)
      setStats(s)
      setDecryptedResponses(responses)
      setDecryptStatus('done')
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : t.errDecryptFailed)
      setDecryptStatus('error')
    }
  }

  function handleDownloadCsv() {
    if (!decryptedResponses || !questions) return

    // Prepare headers
    const headers = [
      'Respondent',
      'Submitted Time',
      ...questions.map((q) => (q.prompt ? `${q.id}: ${q.prompt}` : q.id)),
    ]

    // Prepare rows
    const rows = decryptedResponses.map((resp) => {
      const timeStr = new Date(resp.claimed_at_ms).toLocaleString('zh-TW')
      const rowAnswers = questions.map((q) => {
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
      if (
        escaped.includes(',') ||
        escaped.includes('"') ||
        escaped.includes('\n') ||
        escaped.includes('\r')
      ) {
        return `"${escaped}"`
      }
      return escaped
    }

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\r\n')

    // Download file with UTF-8 BOM
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
      type: 'text/csv;charset=utf-8;',
    })
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
  const [closeStatus, setCloseStatus] = useState<'idle' | 'signing' | 'success' | 'error'>('idle')
  const [closeError, setCloseError] = useState<string | null>(null)

  const canClose = isActive && closeStatus !== 'signing' && closeStatus !== 'success'

  function handleClose() {
    if (!vaultId || !canClose) return
    setCloseError(null)
    setCloseStatus('signing')
    let tx
    try {
      tx = buildClosePtb({ packageId: getPackageId(), vaultId })
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : t.errPtbBuildFailed)
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
      }
    )
  }

  // ── 顯示 ──────────────────────────────────────────────────────────────────
  const displayBalanceSsr = vault ? formatSsr(vault.balance) : null

  if (!vaultId) {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto text-neutral-850 dark:text-neutral-200">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex-1">
            <h1 className="text-h1">
              {t.dashboardTitle}
            </h1>
            <p className="text-muted mt-1">
              {t.dashboardDescPrefix}<strong>{t.dashboardDescStrong}</strong>{t.dashboardDescSuffix}
            </p>
          </div>
          {account && (
            <Link
              to="/create"
              className="self-start sm:self-auto whitespace-nowrap btn-primary"
            >
              {t.btnCreateSurvey}
            </Link>
          )}
        </div>

        {!account ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 text-center shadow-sm max-w-md mx-auto my-12 transition-colors">
            <h2 className="text-h2 mb-2">
              {t.walletRequired}
            </h2>
            <p className="text-muted mb-6 leading-relaxed">
              {t.walletRequiredDesc}
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : loadingDetails ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-700 border-t-transparent mb-4"></div>
            <p className="text-sm text-neutral-500 dark:text-neutral-450">
              {t.loadingSurveys}
            </p>
          </div>
        ) : surveyDetails.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-150 dark:border-neutral-800 rounded-3xl p-10 text-center shadow-sm max-w-lg mx-auto my-8 transition-colors">
            <h3 className="text-h3 mb-2">
              {t.noSurveys}
            </h3>
            <p className="text-muted mb-6 leading-relaxed">
              {t.noSurveysDesc}
            </p>
            <Link
              to="/create"
              className="btn-primary inline-flex items-center gap-1"
            >
              {t.createFirstSurvey}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-[3px]">
            {/* 標頭卡片 */}
            <div
              className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3.5 bg-neutral-100 dark:bg-neutral-800 rounded-xs 
            text-sm font-normal text-neutral-700 dark:text-neutral-300 uppercase tracking-wider transition-colors"
            >
              <div className="col-span-5">{t.colTitle}</div>
              <div className="col-span-3">{t.colCreatedAt}</div>
              <div className="col-span-2">{t.colProgress}</div>
              <div className="col-span-2 text-right">{t.colStatus}</div>
            </div>

            {/* 問卷卡片列表 */}
            {sortedSurveyDetails.map((s) => (
              <div
                key={s.vault_id}
                onClick={() =>
                  navigate(`/dashboard/${s.vault_id}${getSavedContentKey(s.vault_id)}`)
                }
                className="cursor-pointer bg-white dark:bg-neutral-900 rounded-sm px-6 py-4 flex flex-col 
                gap-3 sm:grid sm:grid-cols-12 sm:gap-4 sm:items-center 
                hover:bg-neutral-100/90 dark:hover:bg-neutral-800/60 transition-colors duration-150"
              >
                {/* 欄位 1: 問卷標題 */}
                <div className="sm:col-span-5 break-words" title={s.title}>
                  <span className="font-mono text-neutral-900 dark:text-neutral-100 block">
                    {s.title}
                  </span>
                  <div className="font-mono text-xxs text-neutral-400 mt-1" title={s.vault_id}>
                    Vault: {formatVaultId(s.vault_id)}
                  </div>
                </div>

                {/* 欄位 2: 建立日期 */}
                <div className="sm:col-span-3 text-sm text-neutral-500 dark:text-neutral-400 flex items-center justify-between sm:block">
                  <span className="sm:hidden text-xs font-bold text-neutral-400 uppercase">
                    {t.mobileCreatedAt}
                  </span>
                  <span>{s.registered_at_ms ? formatDateTime(s.registered_at_ms) : '—'}</span>
                </div>

                {/* 欄位 3: 填答進度 */}
                <div className="sm:col-span-2 flex items-center justify-between sm:justify-start gap-2">
                  <span className="sm:hidden text-xs font-bold text-neutral-400 uppercase">
                    {t.mobileProgress}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                      {s.claimed_count} / {s.max_responses}
                    </span>
                    <div className="w-16 bg-neutral-100 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden flex-shrink-0">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full"
                        style={{
                          width: `${Math.min(100, (s.claimed_count / (s.max_responses || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 欄位 4: 狀態 */}
                <div className="sm:col-span-2 sm:text-right flex items-center justify-between sm:justify-end gap-2">
                  <span className="sm:hidden text-xs font-bold text-neutral-400 uppercase">
                    {t.mobileStatus}
                  </span>
                  {(() => {
                    const state = deriveSurveyState(s.status, s.claimed_count, s.max_responses)
                    const styles =
                      state === 'active'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/30'
                        : state === 'full'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 border-neutral-200/50 dark:border-neutral-700/30'
                    const label =
                      state === 'active' ? t.statusActive : state === 'full' ? t.statusFull : t.statusClosed
                    return (
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-normal border ${styles}`}
                      >
                        {label}
                      </span>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    )
  }

  const currentSurvey = surveyDetails.find((s) => s.vault_id === vaultId)
  const surveyTitle = currentSurvey ? currentSurvey.title : loadingDetails ? t.loadingShort : t.surveyDefault
  const fullUrl = surveyId
    ? `${window.location.origin}/s/${surveyId}${contentKeyB64 ? `#${contentKeyB64}` : ''}`
    : ''

  useEffect(() => {
    if (showQrModal && qrCanvasRef.current && fullUrl) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        fullUrl,
        {
          width: 240,
          margin: 2,
          color: {
            dark: '#4671d3',
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
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-blue-705 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-normal"
        >
          {t.backToList}
        </Link>
      </div>

      <h1 className="text-h1 mb-1">{surveyTitle}</h1>
      <h2 className="text-h3 text-neutral-500 dark:text-neutral-450 mb-2">
        {t.subtitle}
      </h2>
      <p className="text-sm text-neutral-500 mb-2 break-all font-mono">
        Vault: <span className="font-semibold">{vaultId}</span>
      </p>
      <p className="text-sm text-neutral-500 mb-2">
        {t.statusLabel}
        <span
          className={isActive ? 'text-green-600 font-normal' : 'text-neutral-550 font-normal'}
        >
          {vault ? (isActive ? t.statusActive : t.statusClosed) : t.checking}
        </span>
      </p>
      {vault && !isActive && (
        <p className="text-sm text-neutral-500 mb-6">
          {t.closedAtLabel}
          <span className="font-normal">
            {vault.closed_at_ms && Number(vault.closed_at_ms) > 0
              ? formatDateTime(Number(vault.closed_at_ms))
              : '—'}
          </span>
        </p>
      )}
      {(!vault || isActive) && <div className="mb-6" />}

      {surveyId && (
        <section className="mb-6 bg-blue-100 dark:bg-blue-900/20 border border-transparent dark:border-blue-900/30 rounded-xl p-4 flex items-center gap-3">
          <a
            href={`/s/${surveyId}${contentKeyB64 ? `#${contentKeyB64}` : ''}`}
            className="text-sm text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-305 hover:underline font-normal cursor-pointer"
            aria-label={t.claimLinkAria}
          >
            {t.claimLink}
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(fullUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className={`px-3 py-1.5 text-sm rounded-xl font-normal transition-all ${copied ? 'bg-emerald-700 text-white' : 'bg-blue-700 hover:bg-blue-800 text-white dark:bg-blue-800 dark:hover:bg-blue-600'
              }`}
          >
            {copied ? t.copied : t.copy}
          </button>
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="btn-secondary px-3 py-1.5 text-sm"
            aria-label={t.qrCodeAria}
          >
            QR Code
          </button>
        </section>
      )}

      {eventsState.kind === 'error' && (
        <div role="alert" className="alert-error mb-4">
          <span>{eventsState.error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-sm text-gray-500 dark:text-neutral-400">{t.statResponseCount}</p>
          <p className="text-2xl font-bold dark:text-neutral-100" aria-label="response-count">
            {responseCount}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-sm text-gray-500 dark:text-neutral-400">{t.statResponseProgress}</p>
          <p className="text-2xl font-bold dark:text-neutral-100" aria-label="received-over-max">
            {responseCount} / {vault ? vault.max_responses : '—'}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-sm text-gray-500 dark:text-neutral-400">{t.statVaultBalance}</p>
          <p className="text-2xl font-bold dark:text-neutral-100" aria-label="vault-balance">
            {displayBalanceSsr !== null ? `${displayBalanceSsr} SSR` : t.checkingShort}
          </p>
        </div>
      </div>

      {/* ── 解密 + 統計圖表 ──────────────────────────────────────────────── */}
      {responseCount === 0 ? (
        <div className="bg-gray-50 dark:bg-neutral-900 rounded p-6 text-center text-gray-500 dark:text-neutral-400 mb-6 transition-colors">
          {t.noResponses}
        </div>
      ) : (
        <section className="mb-6">
          {decryptStatus === 'idle' && isCreator && (
            <button
              type="button"
              onClick={() => void handleDecrypt()}
              className="btn-primary"
            >
              {t.decryptBtn}
            </button>
          )}
          {(decryptStatus === 'signing' || decryptStatus === 'decrypting') && (
            <p className="text-sm text-gray-500">
              {decryptStatus === 'signing' ? t.signingMsg : t.decryptingMsg}
            </p>
          )}
          {decryptStatus === 'error' && decryptError && (
            <div role="alert" className="alert-error">
              <span>{decryptError}</span>
            </div>
          )}

          {decryptedResponses &&
            questions &&
            (() => {
              // viewMode 切換：'latest' 同地址僅保留 max(claimed_at_ms) 那筆。
              const displayedResponses = (() => {
                if (responseViewMode === 'all') return decryptedResponses
                const latestByRespondent = new Map<string, DecryptedResponse>()
                for (const resp of decryptedResponses) {
                  const prev = latestByRespondent.get(resp.respondent)
                  if (!prev || resp.claimed_at_ms > prev.claimed_at_ms) {
                    latestByRespondent.set(resp.respondent, resp)
                  }
                }
                return [...latestByRespondent.values()].sort(
                  (a, b) => a.claimed_at_ms - b.claimed_at_ms
                )
              })()
              const hasRepeats =
                decryptedResponses.length !== displayedResponses.length ||
                decryptedResponses.length >
                new Set(decryptedResponses.map((r) => r.respondent)).size

              return (
                <div className="mt-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-h3">{t.responsesTitle}</h3>
                      <span className="text-xs text-gray-500 dark:text-neutral-400">
                        {responseViewMode === 'all'
                          ? t.displayCount(displayedResponses.length)
                          : t.displayUniqueCount(displayedResponses.length, decryptedResponses.length)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div
                        role="radiogroup"
                        aria-label={t.viewModeLabel}
                        className="inline-flex items-center bg-gray-100 dark:bg-neutral-800 rounded-lg p-0.5 text-xs transition-colors"
                      >
                        <label
                          className={`px-3 py-1.5 rounded-md cursor-pointer font-medium ${responseViewMode === 'all' ? 'bg-white shadow-sm text-gray-800 dark:bg-neutral-700 dark:text-neutral-100' : 'text-gray-500 dark:text-neutral-400'}`}
                        >
                          <input
                            type="radio"
                            name="responseViewMode"
                            value="all"
                            checked={responseViewMode === 'all'}
                            onChange={() => setResponseViewMode('all')}
                            className="sr-only"
                          />
                          {t.allSubmissions}
                        </label>
                        <label
                          className={`px-3 py-1.5 rounded-md cursor-pointer font-medium ${responseViewMode === 'latest' ? 'bg-white shadow-sm text-gray-800 dark:bg-neutral-700 dark:text-neutral-100' : 'text-gray-500 dark:text-neutral-400'}`}
                        >
                          <input
                            type="radio"
                            name="responseViewMode"
                            value="latest"
                            checked={responseViewMode === 'latest'}
                            onChange={() => setResponseViewMode('latest')}
                            className="sr-only"
                          />
                          {t.latestPerPerson}
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={handleDownloadCsv}
                        title={t.csvTooltip}
                        className="bg-emerald-700 hover:bg-emerald-800 text-neutral-100 font-normal px-5 py-2 rounded-xl transition-all text-base flex items-center justify-center gap-1.5 shadow-sm dark:bg-emerald-800 dark:hover:bg-emerald-650"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          ></path>
                        </svg>
                        {t.downloadCsv}
                      </button>
                    </div>
                  </div>
                  {hasRepeats && responseViewMode === 'all' && (
                    <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">
                      {t.hasRepeatsInfo}
                    </p>
                  )}

                  <div className="overflow-x-auto rounded-xl bg-white dark:bg-neutral-900 shadow-sm max-w-full transition-colors">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-800 text-sm">
                      <thead className="bg-gray-50 dark:bg-neutral-800">
                        <tr>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap"
                          >
                            #
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap"
                          >
                            {t.respondentHeader}
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap"
                          >
                            {t.submittedTimeHeader}
                          </th>
                          {questions.map((q) => (
                            <th
                              key={q.id}
                              scope="col"
                              className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap max-w-xs truncate"
                              title={q.prompt}
                            >
                              {q.id}: {q.prompt}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-100 dark:divide-neutral-800">
                        {displayedResponses.map((resp, idx) => (
                          <tr
                            key={resp.respondent + idx}
                            className="hover:bg-gray-50/50 dark:hover:bg-neutral-800/40 transition-colors"
                          >
                            <td className="px-4 py-3 text-gray-400 dark:text-neutral-500 font-mono whitespace-nowrap">
                              {idx + 1}
                            </td>
                            <td
                              className="px-4 py-3 text-gray-600 dark:text-neutral-300 font-mono whitespace-nowrap"
                              title={resp.respondent}
                            >
                              {resp.respondent.slice(0, 8)}...{resp.respondent.slice(-8)}
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-neutral-400 whitespace-nowrap">
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
                                <td
                                  key={q.id}
                                  className="px-4 py-3 text-gray-800 dark:text-neutral-200 whitespace-nowrap max-w-xs truncate"
                                  title={displayVal}
                                >
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
              )
            })()}

          {stats && stats.failed_count > 0 && (
            <p className="text-xs text-amber-600">
              {t.decryptFailedCount(stats.failed_count)}
            </p>
          )}
        </section>
      )}

      {/* ── 結束活動 ─────────────────────────────────────────────────────── */}
      {(closeStatus !== 'idle' || isCreator) && (
        <div className="mt-6 border-t pt-6">
          {closeStatus === 'success' && (
            <div role="status" className="alert-success mb-3">
              <span>{t.closeSuccess}</span>
            </div>
          )}
          {closeStatus === 'error' && closeError && (
            <div role="alert" className="alert-error mb-3 break-all">
              <span>{closeError}</span>
            </div>
          )}

          {isCreator && (
            <button
              type="button"
              onClick={handleClose}
              disabled={!canClose}
              className={
                isActive
                  ? 'btn-danger'
                  : 'btn-secondary text-neutral-400 dark:text-neutral-500 cursor-default shadow-none'
              }
            >
              {!isActive ? t.btnClosed : closeStatus === 'signing' ? t.btnClosing : t.btnClose}
            </button>
          )}
        </div>
      )}

      {/* ── 我的問卷列表 (Bottom Switcher) ────────────────────────────────── */}
      {creatorSurveys.length > 0 && (
        <section className="mt-8 border-t pt-6">
          <div className="mb-3">
            <h2 className="text-h2">
              {t.switchSurveys}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-450 mt-1">
              <strong>{t.switchSurveysDescStrong}</strong>{t.switchSurveysDescSuffix}
            </p>
          </div>
          <div className="flex flex-col gap-[3px] text-sm">
            {sortedSurveyDetails.map((s) => (
              <div
                key={s.vault_id}
                role="row"
                onClick={() =>
                  s.vault_id !== vaultId &&
                  navigate(`/dashboard/${s.vault_id}${getSavedContentKey(s.vault_id)}`)
                }
                className={`flex items-center justify-between px-4 py-2 rounded-xs transition-colors duration-150 group ${s.vault_id === vaultId
                    ? 'bg-neutral-50/50 dark:bg-neutral-800/30 cursor-default'
                    : 'bg-white dark:bg-neutral-900 cursor-pointer hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60'
                  }`}
              >
                <div className="text-neutral-900 dark:text-white font-semibold">{s.title}</div>
                <div className="flex items-center gap-4">
                  {deriveSurveyState(s.status, s.claimed_count, s.max_responses) === 'full' && (
                    <span
                      className="inline-flex items-center gap-1 text-xxs font-normal text-amber-700 dark:text-amber-400"
                      title={t.statusFull}
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                      {t.statusFull}
                    </span>
                  )}
                  <div className="text-neutral-500 dark:text-neutral-400 font-mono whitespace-nowrap">
                    {s.claimed_count} / {s.max_responses}
                  </div>
                  <div className="w-24 text-right">
                    {s.vault_id === vaultId ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        {t.currentlySelected}
                      </span>
                    ) : (
                      <span className="text-neutral-400 group-hover:text-blue-500 transition-colors text-xs font-bold opacity-0 group-hover:opacity-100 mr-2">
                        {t.switchArrow}
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
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{t.qrModalTitle}</h3>

            <div className="bg-white p-2 rounded border border-neutral-100 dark:border-neutral-800">
              <canvas ref={qrCanvasRef} className="max-w-full h-auto" />
            </div>

            <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
              {t.qrModalDesc}
            </p>

            <div className="flex gap-2 w-full mt-2">
              <button
                type="button"
                onClick={handleDownloadQr}
                className="flex-1 btn-primary text-sm flex items-center justify-center"
              >
                {t.downloadPng}
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="flex-1 btn-secondary text-sm flex items-center justify-center"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
