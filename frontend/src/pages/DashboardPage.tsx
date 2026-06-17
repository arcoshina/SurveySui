import { useEffect, useMemo, useState, useRef } from 'react'
import { useLocation, useParams, Link, useNavigate } from 'react-router-dom'
import {
  ConnectButton,
  useCurrentAccount,
  useCurrentWallet,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import type { SuiClient } from '@mysten/sui/client'
import {
  aggregateStats,
  decryptAllResponses,
  decodeAllPlainResponses,
  fetchClaimedEvents,
  type DashboardStats,
  type SurveyClaimedEvent,
  type DecryptedResponse,
} from '../lib/dashboardDecrypt'
import { buildClosePtb, buildPurgePtb, PURGE_GRACE_MS } from '../lib/ptb'
import { buildExtendWalrusBlobTx } from '../lib/walrusExtend'
import { formatSui, formatFullPrecision, formatSuiFullPrecision, formatCompactInt, formatCompactCoin, formatCompactSui } from '../lib/format'
import {
  KEY_DERIVE_MSG,
  base64urlToBytes,
  deriveCreatorKeyPair,
  decryptSurveyContent,
  parseCreatorPubKey,
  parseContentBlob,
} from '../lib/crypto'
import { parseFullSurveyMarkdown, type Question, type FullSurveyData, sanitizeQuestionIds } from '../lib/frontmatter'
import { normalizeBytes, bytesToHex } from '../lib/answerCodec'
import QRCode from 'qrcode'
import { useT } from '../i18n'
import { downloadFromDecentralizedStorage } from '../lib/storage'

const SURVEY_KEY_PREFIX = 'surveysui:survey:'
const PROTOCOL_CONFIG_ID = import.meta.env.VITE_PROTOCOL_CONFIG_ID ?? ''

function getOptionId(opt: unknown): string | null {
  if (!opt) return null
  if (typeof opt === 'string') return opt
  const rec = opt as { fields?: { vec?: unknown }; vec?: unknown }
  const vec = rec.fields?.vec ?? rec.vec
  if (typeof vec === 'string') return vec
  if (Array.isArray(vec) && vec.length > 0) return String(vec[0])
  return null
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

type SurveyState = 'active' | 'pending_close' | 'closed' | 'purged'

/**
 * 鏈上不主動 close；過期或額滿（status 仍為 OPEN）以 `pending_close` 表「待關閉」，
 * 實際銷毀等 purge（deadline + grace）。deadlineMs 省略時跳過過期判斷（資料未載入）。
 */
function deriveSurveyState(
  status: number,
  claimed: number,
  max: number,
  deadlineMs?: number,
  nowMs: number = Date.now()
): SurveyState {
  if (status === 2) return 'purged'
  if (status !== 0) return 'closed'
  if (max > 0 && claimed >= max) return 'pending_close'
  if (deadlineMs && deadlineMs > 0 && nowMs > deadlineMs) return 'pending_close'
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

/** Configured purge grace period, rendered as whole days for user notices. */
const PURGE_GRACE_DAYS = Math.max(1, Math.round(Number(PURGE_GRACE_MS) / 86_400_000))

interface VaultFields {
  creator: string
  balance: string
  status: number
  claimed_count: string
  max_responses: string
  closed_at_ms?: string
  gas_balance: string
  gas_compensation_amount: string
  sponsor_address: string
  purge_grace_ms?: string
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
  const { connectionStatus } = useCurrentWallet()
  const isWalletResolving = connectionStatus === 'connecting'
  const suiClient = useSuiClient()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage()
  const t = useT('dashboard')

  const [refreshCounter, setRefreshCounter] = useState(0)
  const triggerRefresh = () => setRefreshCounter((prev) => prev + 1)


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
  const { data: vaultData, refetch: refetchVault, isPending: isPendingVault } = useSuiClientQuery(
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
  const [surveyResolveFailed, setSurveyResolveFailed] = useState(false)
  const [surveyData, setSurveyData] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [detailSurveyTitle, setDetailSurveyTitle] = useState<string | null>(null)
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
    deadlineMs: number
  }

  const [surveyDetails, setSurveyDetails] = useState<CreatorSurveyDetail[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)

function getAnswerText(q: any, val: any, separator: string = ', '): string {
  if (val === undefined || val === null) return ''
  if (q.type === 'single_choice' && q.options_json) {
    const idx = Number(val)
    if (!isNaN(idx) && idx >= 0 && idx < q.options_json.length) {
      return q.options_json[idx]
    }
  }
  if (q.type === 'multi_choice' && q.options_json && Array.isArray(val)) {
    return val
      .map((item) => {
        const idx = Number(item)
        return idx >= 0 && idx < q.options_json!.length ? q.options_json![idx] : ''
      })
      .filter((t: string) => t !== '')
      .join(separator)
  }
  return String(val)
}

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
    setSurveyResolveFailed(false)
    setDetailSurveyTitle(null)
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
        } else if (!cancelled) {
          setSurveyResolveFailed(true)
        }
      } catch (err) {
        console.error('[DashboardPage] Failed to resolve survey:', err)
        if (!cancelled) setSurveyResolveFailed(true)
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
  }, [account?.address, suiClient, refreshCounter])

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

        const details = await Promise.all(
          creatorSurveys.map(async (s, i) => {
            const surveyObj = surveyObjs[i]
            const vaultObj = vaultObjs[i]

            let title = `${t.surveyTitlePrefix}${s.survey_id.slice(0, 6)}`
            let status = 0
            let claimed_count = 0
            let max_responses = 0
            let deadlineMs = 0

            const isSurveyDeleted = !surveyObj || !surveyObj.data || !!surveyObj.error
            const isVaultDeleted = !vaultObj || !vaultObj.data || !!vaultObj.error

            if (isSurveyDeleted && isVaultDeleted) {
              status = 2 // 已銷毀
            } else {
              const sFields = (surveyObj?.data?.content as any)?.fields
              if (sFields) {
                status = sFields.status !== undefined ? Number(sFields.status) : 0

                const surveyBlobIdBytes = getOptionVec(sFields.survey_blob_id)
                let rawContent: Uint8Array | null = null

                if (surveyBlobIdBytes) {
                  try {
                    const blobId = new TextDecoder().decode(surveyBlobIdBytes)
                    rawContent = await downloadFromDecentralizedStorage(blobId)
                  } catch (e) {
                    console.warn('Failed to download decentralized storage title for list item:', s.survey_id, e)
                  }
                } else {
                  rawContent = sFields.encrypted_content
                    ? normalizeBytes(sFields.encrypted_content)
                    : null
                }

                if (rawContent) {
                  try {
                    const parsedBlob = parseContentBlob(rawContent)
                    if (parsedBlob.version === 0x00) {
                      const parsed = parseFullSurveyMarkdown(parsedBlob.markdown || '')
                      if (parsed.ok && parsed.data.title) {
                        title = parsed.data.title
                      }
                    } else {
                      const savedKey = getSavedContentKey(s.vault_id)
                      if (savedKey) {
                        const keyBytes = base64urlToBytes(savedKey.slice(1))
                        const dec = await decryptSurveyContent(rawContent, keyBytes)
                        const parsed = parseFullSurveyMarkdown(dec.markdown)
                        if (parsed.ok && parsed.data.title) {
                          title = parsed.data.title
                        }
                      } else if (parsedBlob.version === -1 && rawContent.length >= 32) {
                        const md = new TextDecoder().decode(rawContent.slice(32))
                        const parsed = parseFullSurveyMarkdown(md)
                        if (parsed.ok && parsed.data.title) {
                          title = parsed.data.title
                        }
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
                deadlineMs = vFields.deadline_ms !== undefined ? Number(vFields.deadline_ms) : 0
                if (vFields.status !== undefined) {
                  status = Number(vFields.status)
                }
              }
            }

            return {
              vault_id: s.vault_id,
              survey_id: s.survey_id,
              title,
              question_count: s.question_count,
              registered_at_ms: s.registered_at_ms,
              status,
              claimed_count,
              max_responses,
              deadlineMs,
            }
          })
        )

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
                  s.max_responses === d.max_responses &&
                  s.deadlineMs === d.deadlineMs
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
  }, [creatorSurveys, suiClient, refreshCounter])

  useEffect(() => {
    if (!surveyData) return
    const fields = surveyData.content?.fields as any
    if (!fields) return

    let hashBytes = fields.schema_hash ? normalizeBytes(fields.schema_hash) : new Uint8Array(0)
    const newHash = bytesToHex(hashBytes)
    setSchemaHashStr((prev) => (prev === newHash ? prev : newHash))

    // Determine contentKey (already computed via useMemo at the top)

    function applyMeta(data: FullSurveyData) {
      const next = {
        allowedSources: data.allowedSources,
        allowedNftType: data.allowedNftType || null,
        repeatReward: data.repeatReward,
        repeatMaxTimes: data.repeatMaxTimes,
        perResponse: data.perResponse,
        deadlineMs: data.deadlineMs,
        encryptAnswers: data.encryptAnswers,
      }
      setSurveyMeta((prev) =>
        prev &&
          JSON.stringify(prev.allowedSources) === JSON.stringify(next.allowedSources) &&
          prev.allowedNftType === next.allowedNftType &&
          prev.repeatReward === next.repeatReward &&
          prev.repeatMaxTimes === next.repeatMaxTimes &&
          prev.perResponse === next.perResponse &&
          prev.deadlineMs === next.deadlineMs &&
          prev.encryptAnswers === next.encryptAnswers
          ? prev
          : next
      )
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
          const parsed = parseFullSurveyMarkdown(parsedBlob.markdown || '')
          if (parsed.ok) {
            setQuestions((prev) => {
              const sanitized = sanitizeQuestionIds(parsed.data.questions)
              return JSON.stringify(prev) === JSON.stringify(sanitized)
                ? prev
                : sanitized
            })
            applyMeta(parsed.data)
            if (parsed.data.title) {
              setDetailSurveyTitle(parsed.data.title)
            }
          }
        } else if (parsedBlob.version === 0x01 || (parsedBlob.version === -1 && contentKeyB64)) {
          if (contentKeyB64) {
            const keyBytes = base64urlToBytes(contentKeyB64)
            const dec = await decryptSurveyContent(rawContent, keyBytes)
            const parsed = parseFullSurveyMarkdown(dec.markdown)
            if (parsed.ok) {
              setQuestions((prev) => {
                const sanitized = sanitizeQuestionIds(parsed.data.questions)
                return JSON.stringify(prev) === JSON.stringify(sanitized)
                  ? prev
                  : sanitized
              })
              applyMeta(parsed.data)
              if (parsed.data.title) {
                setDetailSurveyTitle(parsed.data.title)
              }
            }
          }
        } else if (parsedBlob.version === -1 && rawContent.length >= 32) {
          const md = new TextDecoder().decode(rawContent.slice(32))
          const parsed = parseFullSurveyMarkdown(md)
          if (parsed.ok) {
            setQuestions((prev) => {
              const sanitized = sanitizeQuestionIds(parsed.data.questions)
              return JSON.stringify(prev) === JSON.stringify(sanitized)
                ? prev
                : sanitized
            })
            applyMeta(parsed.data)
            if (parsed.data.title) {
              setDetailSurveyTitle(parsed.data.title)
            }
          }
        }
      } catch (err) {
        console.error('[DashboardPage] Failed to decrypt/parse survey questions:', err)
      }
    }

    void loadQuestions()
  }, [surveyData, vaultId, location.hash])

  // ── 公開問卷自動解析 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (surveyMeta?.encryptAnswers === false && questions && events && schemaHashStr) {
      try {
        const { responses } = decodeAllPlainResponses(
          events,
          questions,
          schemaHashStr
        )
        const s = aggregateStats(responses, events.length)
        setStats(s)
        setDecryptedResponses(responses)
        setDecryptStatus('done')
      } catch (err) {
        console.error('[DashboardPage] Failed to decode plain responses:', err)
        setDecryptError(err instanceof Error ? err.message : 'Failed to decode responses')
        setDecryptStatus('error')
      }
    }
  }, [surveyMeta?.encryptAnswers, questions, events, schemaHashStr])

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

  const isAccessDenied = useMemo(() => {
    if (!vaultId || isWalletResolving || !vault) return false
    return !isCreator
  }, [vaultId, isWalletResolving, vault, isCreator])

  useEffect(() => {
    if (!isAccessDenied) return
    if (surveyId) {
      const hash = contentKeyB64 ? `#${contentKeyB64}` : ''
      navigate(`/s/${surveyId}${hash}`, { replace: true })
      return
    }
    if (surveyResolveFailed) {
      navigate('/', { replace: true })
    }
  }, [isAccessDenied, surveyId, surveyResolveFailed, contentKeyB64, navigate])

  async function handleDecrypt() {
    if (!isCreator || decryptStatus === 'signing' || decryptStatus === 'decrypting') return
    setDecryptError(null)
    setDecryptStatus('signing')
    try {
      const message = new TextEncoder().encode(KEY_DERIVE_MSG)
      const { signature } = await signPersonalMessageAsync({ message })
      const sigBytes = base64ToBytes(signature)
      
      const fields = surveyData?.content?.fields
      let salt: Uint8Array | null = null
      if (fields?.creator_pub_key) {
        const creatorPubKeyBytes = normalizeBytes(fields.creator_pub_key)
        try {
          const parsed = parseCreatorPubKey(creatorPubKeyBytes)
          salt = parsed.salt
        } catch (e) {
          console.warn('[DashboardPage] Failed to parse creator_pub_key for salt:', e)
        }
      }

      const kp = await deriveCreatorKeyPair(sigBytes, salt)
      setDecryptStatus('decrypting')
      const { responses } = await decryptAllResponses(
        events,
        kp,
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
        return getAnswerText(q, val, '; ')
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
  const [purgeStatus, setPurgeStatus] = useState<'idle' | 'confirm' | 'signing' | 'success' | 'error'>('idle')
  const [purgeError, setPurgeError] = useState<string | null>(null)
  const [extendStatus, setExtendStatus] = useState<'idle' | 'signing' | 'success' | 'error'>('idle')
  const [extendError, setExtendError] = useState<string | null>(null)

  const walrusBlobObjectId = useMemo(() => {
    const fields = surveyData?.content?.fields as Record<string, unknown> | undefined
    if (!fields) return null
    return getOptionId(fields.survey_blob_object_id)
  }, [surveyData])

  const isWalrusSurvey = useMemo(() => {
    const fields = surveyData?.content?.fields as Record<string, unknown> | undefined
    if (!fields) return false
    return !!getOptionVec(fields.survey_blob_id)
  }, [surveyData])

  const walrusCoverageTargetMs = useMemo(() => {
    if (!surveyMeta) return 0
    const closedAt = vault?.closed_at_ms ? Number(vault.closed_at_ms) : 0
    if (closedAt > 0) {
      const grace = vault?.purge_grace_ms ? Number(vault.purge_grace_ms) : Number(PURGE_GRACE_MS)
      return closedAt + grace
    }
    return surveyMeta.deadlineMs + Number(PURGE_GRACE_MS)
  }, [surveyMeta, vault])

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
        onSuccess: async (result) => {
          setCloseStatus('success')
          try {
            await suiClient.waitForTransaction({ digest: result.digest })
          } catch (e) {
            console.warn('[DashboardPage] waitForTransaction failed:', e)
          }
          void refetchVault()
          triggerRefresh()
        },
        onError: (err) => {
          setCloseError(err.message)
          setCloseStatus('error')
        },
      }
    )
  }

  // Creator-initiated immediate purge of a closed survey (bypasses the grace
  // window — the contract permits this only for the creator on a closed vault).
  async function handleExtendWalrus() {
    if (!walrusBlobObjectId || !account?.address || extendStatus === 'signing') return
    setExtendError(null)
    setExtendStatus('signing')
    try {
      const tx = await buildExtendWalrusBlobTx(suiClient as unknown as SuiClient, {
        blobObjectId: walrusBlobObjectId,
        coverageTargetMs: walrusCoverageTargetMs,
        sender: account.address,
      })
      signAndExecute(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { transaction: tx as any },
        {
          onSuccess: async (result) => {
            setExtendStatus('success')
            try {
              await suiClient.waitForTransaction({ digest: result.digest })
            } catch (e) {
              console.warn('[DashboardPage] waitForTransaction failed:', e)
            }
            void refetchVault()
            triggerRefresh()
          },
          onError: (err) => {
            setExtendError(err.message)
            setExtendStatus('error')
          },
        }
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.errPtbBuildFailed
      if (msg === 'walrus_extend_no_wal') {
        setExtendError(t.walrusExtendNoWal)
      } else if (msg === 'walrus_extend_insufficient_wal') {
        setExtendError(t.walrusExtendInsufficientWal)
      } else if (msg === 'walrus_extend_not_needed') {
        setExtendError(t.walrusExtendNotNeeded)
      } else {
        setExtendError(msg)
      }
      setExtendStatus('error')
    }
  }

  function handlePurge() {
    if (!vaultId || !surveyId || isActive) return
    const registryId = import.meta.env.VITE_SURVEY_REGISTRY_ID as string | undefined
    if (!registryId) {
      setPurgeError(t.errNoRegistry)
      setPurgeStatus('error')
      return
    }
    if (!PROTOCOL_CONFIG_ID) {
      setPurgeError(t.errNoRegistry)
      setPurgeStatus('error')
      return
    }
    setPurgeError(null)
    setPurgeStatus('signing')
    let tx
    try {
      tx = buildPurgePtb({
        packageId: getPackageId(),
        registryId,
        protocolConfigId: PROTOCOL_CONFIG_ID,
        surveyId,
        vaultId,
      })
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : t.errPtbBuildFailed)
      setPurgeStatus('error')
      return
    }
    signAndExecute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { transaction: tx as any },
      {
        onSuccess: async (result) => {
          setPurgeStatus('success')
          try {
            await suiClient.waitForTransaction({ digest: result.digest })
          } catch (e) {
            console.warn('[DashboardPage] waitForTransaction failed:', e)
          }
          triggerRefresh()
          setTimeout(() => navigate('/dashboard'), 1200)
        },
        onError: (err) => {
          setPurgeError(err.message)
          setPurgeStatus('error')
        },
      }
    )
  }

  // ── 顯示 ──────────────────────────────────────────────────────────────────
  const displayBalanceSsr = vault ? formatCompactCoin(vault.balance) : null
  const displayGasBalance = vault ? formatCompactSui(vault.gas_balance) : null

  // QR Code 用的 fullUrl 與繪製 effect 必須宣告在任何 early return 之前，
  // 否則 isAccessDenied 在同一 mount 內由 false 翻 true 時會違反 Rules of Hooks。
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
            dark: '#30305f',
            light: '#ffffff',
          },
        },
        (error) => {
          if (error) console.error('[DashboardPage] Failed to generate QR Code:', error)
        }
      )
    }
  }, [showQrModal, fullUrl])

  if (vaultId && isAccessDenied) {
    return (
      <main className="w-full flex-1 p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl p-8 text-center space-y-4 animate-fadeIn w-full">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p aria-live="polite" className="text-sm text-slate-500 dark:text-neutral-400 font-medium">
            {t.redirectingToSurvey}
          </p>
        </div>
      </main>
    )
  }

  if (!vaultId) {
    return (
      <main className="w-full flex-1 p-4 sm:p-8 max-w-4xl mx-auto text-slate-800 dark:text-neutral-300">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex-1">
            <h1 className="text-h1">
              {t.dashboardTitle}
            </h1>
            <p className="text-muted mt-1">
              {t.dashboardDescPrefix}<strong>{t.dashboardDescStrong}</strong>{t.dashboardDescSuffix}
            </p>
            <p className="text-muted mt-2">{t.listPurgeReminder(PURGE_GRACE_DAYS)}</p>
          </div>
          {account && !loadingDetails && surveyDetails.length > 0 && (
            <div className="flex gap-3 self-start sm:self-auto items-center">
              <Link
                to="/create"
                className="whitespace-nowrap btn-primary"
              >
                {t.btnCreateSurvey}
              </Link>
            </div>
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
            <p className="text-muted">
              {t.loadingSurveys}
            </p>
          </div>
        ) : surveyDetails.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-3xl p-10 text-center shadow-sm max-w-lg mx-auto my-8 transition-colors">
            <h3 className="text-h3 mb-2">
              {t.noSurveys}
            </h3>
            <p className="text-muted mb-6 leading-relaxed">
              {t.noSurveysDesc}
            </p>
            <div className="flex gap-3 justify-center items-center">
              <Link
                to="/create"
                className="btn-primary inline-flex items-center gap-1"
              >
                {t.createFirstSurvey}
              </Link>
            </div>
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
                <div className="sm:col-span-5 min-w-0" title={s.title}>
                  <span className="font-mono text-slate-900 dark:text-neutral-100 block truncate">
                    {s.title}
                  </span>
                  <div className="font-mono text-xxs text-slate-500 dark:text-neutral-500 mt-1 truncate" title={s.vault_id}>
                    Vault: {formatVaultId(s.vault_id)}
                  </div>
                </div>

                {/* 欄位 2: 建立日期 */}
                <div className="sm:col-span-3 text-sm text-slate-600 dark:text-neutral-400 flex items-center justify-between sm:block">
                  <span className="sm:hidden text-xs font-normal text-slate-600 dark:text-neutral-400 uppercase">
                    {t.mobileCreatedAt}
                  </span>
                  <span>{s.registered_at_ms ? formatDateTime(s.registered_at_ms) : '—'}</span>
                </div>

                {/* 欄位 3: 填答進度 */}
                <div className="sm:col-span-2 flex items-center justify-between sm:justify-start gap-2">
                  <span className="sm:hidden text-xs font-normal text-slate-600 dark:text-neutral-400 uppercase">
                    {t.mobileProgress}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-slate-800 dark:text-neutral-300 whitespace-nowrap">
                      {s.claimed_count} / {s.max_responses}
                    </span>
                    <div className="w-16 bg-slate-100 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden flex-shrink-0">
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
                  <span className="sm:hidden text-xs font-normal text-slate-600 dark:text-neutral-400 uppercase">
                    {t.mobileStatus}
                  </span>
                  {(() => {
                    const state = deriveSurveyState(s.status, s.claimed_count, s.max_responses, s.deadlineMs)
                    const styles =
                      state === 'active'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/30'
                        : state === 'pending_close'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30'
                          : state === 'purged'
                            ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 border-neutral-200/50 dark:border-neutral-700/30'
                            : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200/50 dark:border-red-800/30'
                    const label =
                      state === 'active'
                        ? t.statusActive
                        : state === 'pending_close'
                          ? t.statusFull
                          : state === 'purged'
                            ? t.statusPurged
                            : t.statusClosed
                    return (
                      <span
                        className={`inline-flex items-center shrink-0 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-normal border ${styles}`}
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
  const surveyTitle = detailSurveyTitle || (currentSurvey ? currentSurvey.title : loadingDetails ? t.loadingShort : t.surveyDefault)

  return (
    <main className="w-full flex-1 p-4 sm:p-8 max-w-4xl mx-auto text-slate-800 dark:text-neutral-300">
      <div className="mb-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-normal"
        >
          {t.backToList}
        </Link>
      </div>

      <h1 className="text-h1 mb-1 pb-1.5">{surveyTitle}</h1>
      <h2 className="text-h3 text-muted mb-6">
        {t.subtitle}
      </h2>

      {surveyId && vault && (
        <section className="mb-6 bg-blue-100 dark:bg-blue-900/20 border border-transparent dark:border-blue-900/30 rounded-xl p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <a
              href={`/s/${surveyId}${contentKeyB64 ? `#${contentKeyB64}` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline font-normal cursor-pointer"
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
          </div>
          {surveyMeta?.encryptAnswers === false && (
            <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l pt-3 sm:pt-0 sm:pl-3 border-slate-200 dark:border-neutral-800 sm:ml-auto">
              <Link
                to={`/results/${vaultId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-sm rounded-xl font-normal transition-all bg-emerald-700 hover:bg-emerald-800 text-white dark:bg-emerald-800 dark:hover:bg-emerald-700 cursor-pointer"
              >
                {t.publicResultsLink}
              </Link>
            </div>
          )}
        </section>
      )}

      {eventsState.kind === 'error' && (
        <div role="alert" className="alert-error mb-4">
          <span>{eventsState.error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-100 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-sm text-slate-600 dark:text-neutral-400">{t.statResponseCount}</p>
          <p className="text-2xl font-mono font-normal text-slate-900 dark:text-neutral-100 text-right mt-1 truncate" aria-label="response-count" title={String(responseCount)}>
            {formatCompactInt(responseCount)}
          </p>
        </div>
        <div className="bg-slate-100 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-sm text-slate-600 dark:text-neutral-400">{t.statResponseProgress}</p>
          <p className="text-2xl font-mono font-normal text-slate-900 dark:text-neutral-100 text-right mt-1 truncate" aria-label="received-over-max" title={vault ? `${responseCount} / ${vault.max_responses}` : undefined}>
            {formatCompactInt(responseCount)} / {vault ? formatCompactInt(vault.max_responses) : '—'}
          </p>
        </div>
        <div className="bg-slate-100 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-sm text-slate-600 dark:text-neutral-400">{t.statVaultBalance}</p>
          <p className="text-2xl font-mono font-normal text-slate-900 dark:text-neutral-100 text-right mt-1 truncate" aria-label="vault-balance" title={vault ? `${formatFullPrecision(vault.balance)} SSR` : undefined}>
            {displayBalanceSsr !== null ? displayBalanceSsr : isPendingVault ? t.checkingShort : '—'}
          </p>
        </div>
        <div className="bg-slate-100 dark:bg-neutral-900 rounded p-4 transition-colors">
          <p className="text-sm text-slate-600 dark:text-neutral-400">{t.statGasBalance}</p>
          <p className="text-2xl font-mono font-normal text-slate-900 dark:text-neutral-100 text-right mt-1 truncate" aria-label="gas-balance" title={vault ? `${formatSuiFullPrecision(vault.gas_balance)} SUI` : undefined}>
            {displayGasBalance !== null ? displayGasBalance : isPendingVault ? t.checkingShort : '—'}
          </p>
        </div>
      </div>

      {/* ── 問卷資訊整合區塊 ────────────────────────────────────────────── */}
      <section className="mb-6 bg-slate-100 border border-slate-300 dark:bg-neutral-950 dark:border-neutral-800 rounded-xl p-4">
        <dl className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-y-3 md:gap-y-2 gap-x-4 text-sm">
          <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.vaultLabel}</dt>
          <dd className="font-mono break-all text-body">{vaultId}</dd>

          <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.statusLabel.replace(':', '')}</dt>
          <dd className="text-body">
            {isPendingVault ? (
              t.checking
            ) : !vault ? (
              <span className="text-slate-600 dark:text-neutral-400">{t.statusPurged}</span>
            ) : (() => {
              const state = deriveSurveyState(
                vault.status,
                Number(vault.claimed_count),
                Number(vault.max_responses),
                surveyMeta?.deadlineMs
              )
              if (state === 'active') {
                return <span className="text-emerald-700 dark:text-emerald-400">{t.statusActive}</span>
              }
              if (state === 'pending_close') {
                return <span className="text-amber-700 dark:text-amber-400">{t.statusFull}</span>
              }
              if (state === 'purged') {
                return <span className="text-slate-600 dark:text-neutral-400">{t.statusPurged}</span>
              }
              return (
                <span className="text-red-700 dark:text-red-400">
                  {t.statusClosedAt(
                    vault.closed_at_ms && Number(vault.closed_at_ms) > 0
                      ? formatDateTime(Number(vault.closed_at_ms))
                      : '—'
                  )}
                </span>
              )
            })()}
          </dd>

          {vault?.closed_at_ms && Number(vault.closed_at_ms) > 0 && (
            <>
              <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.purgeLabel}</dt>
              <dd className="text-muted">
                {t.purgeNoticeAt(
                  formatDateTime(
                    Number(vault.closed_at_ms) +
                      (vault.purge_grace_ms ? Number(vault.purge_grace_ms) : Number(PURGE_GRACE_MS))
                  )
                )}
              </dd>
            </>
          )}

          <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.storageLocationLabel}</dt>
          <dd className="text-body flex items-center gap-1.5">
            {surveyData ? (
              (() => {
                const fields = surveyData.content?.fields as any
                const surveyBlobIdBytes = getOptionVec(fields?.survey_blob_id)
                return surveyBlobIdBytes ? (
                  <span className="badge-decentralized shrink-0 inline-flex items-center gap-1">
                    {t.storageDecentralized}
                  </span>
                ) : (
                  <span className="badge-direct shrink-0 inline-flex items-center gap-1">
                    {t.storageDirect}
                  </span>
                )
              })()
            ) : isPendingVault ? (
              t.checkingShort
            ) : (
              '—'
            )}
          </dd>

          <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.deadlineLabel}</dt>
          <dd className="text-body">{surveyMeta ? formatDateTime(surveyMeta.deadlineMs) : '—'}</dd>

          <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.identityThresholdLabel}</dt>
          <dd className="text-body flex flex-col gap-1.5 py-1">
            {surveyMeta ? (
              <>
                {surveyMeta.allowedSources && surveyMeta.allowedSources.length > 0 && (
                  <div>
                    <span className="font-semibold text-slate-500 dark:text-neutral-450 mr-1">憑證：</span>
                    <span>
                      {surveyMeta.allowedSources.map((s: number) => {
                        switch (s) {
                          case 1: return t.sourceSelfReport || '自我宣告'
                          case 2: return t.sourceEmail || 'Email 驗證'
                          case 3: return t.sourceSocial || '社群驗證'
                          case 4: return t.sourceSelfProtocol || '自我協定'
                          case 5: return t.sourceWorldId || 'World ID'
                          case 6: return t.sourceGoogle || 'Google'
                          case 7: return t.sourceGithub || 'GitHub'
                          default: return `Source ${s}`
                        }
                      }).join(', ')}
                    </span>
                  </div>
                )}
                {surveyMeta.allowedNftType && (
                  <div className="flex items-start gap-1 flex-wrap">
                    <span className="font-semibold text-slate-500 dark:text-neutral-450 shrink-0">NFT：</span>
                    <span className="font-mono text-xs bg-slate-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 break-all select-all max-w-full">
                      {surveyMeta.allowedNftType}
                    </span>
                  </div>
                )}
                {!surveyMeta.allowedSources?.length && !surveyMeta.allowedNftType && '—'}
              </>
            ) : '—'}
          </dd>

          <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.perResponseLabel}</dt>
          <dd className="text-body">{surveyMeta ? `${surveyMeta.perResponse} SSR` : '—'}</dd>

          <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.repeatLabel}</dt>
          <dd className="text-body">
            {surveyMeta
              ? surveyMeta.repeatReward === 0
                ? t.repeatDisabled
                : t.repeatEnabled(surveyMeta.repeatReward, surveyMeta.repeatMaxTimes)
              : '—'}
          </dd>

          <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.gasCompensationLabel}</dt>
          <dd className="text-body">
            {vault ? `${formatSui(vault.gas_compensation_amount)} SUI` : '—'}
          </dd>

          <dt className="text-sm font-normal text-slate-600 dark:text-neutral-300 md:self-center break-words">{t.sponsorAddressLabel}</dt>
          <dd className="font-mono break-all text-body">
            {vault ? vault.sponsor_address : '—'}
          </dd>
        </dl>
        {!surveyMeta && (
          <p className="text-muted mt-3">{t.metaUnavailable}</p>
        )}

        {isWalrusSurvey && walrusBlobObjectId && vault?.status !== 2 && (
          <div className="alert-info mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-normal">{t.walrusExtendHint}</p>
            <button
              type="button"
              className="btn-outline shrink-0 disabled:opacity-50"
              disabled={extendStatus === 'signing' || extendStatus === 'success'}
              onClick={() => void handleExtendWalrus()}
            >
              {extendStatus === 'signing'
                ? t.walrusExtending
                : extendStatus === 'success'
                  ? t.walrusExtendSuccess
                  : t.walrusExtendBtn}
            </button>
          </div>
        )}
        {extendError && (
          <p className="text-sm font-normal text-rose-700 dark:text-rose-400 mt-2">{extendError}</p>
        )}
      </section>

      {/* ── 解密 + 統計圖表 ──────────────────────────────────────────────── */}
      {responseCount === 0 ? (
        <div className="bg-slate-100 dark:bg-neutral-900 rounded p-6 text-center text-slate-600 dark:text-neutral-400 mb-6 transition-colors">
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
            <p className="text-sm text-slate-600 dark:text-neutral-400">
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
              const isPublicSurvey = surveyMeta?.encryptAnswers === false

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
                      <h3 className="text-h3">
                        {isPublicSurvey ? t.responsesTitlePublic : t.responsesTitle}
                      </h3>
                      <span className="text-xs text-slate-600 dark:text-neutral-400">
                        {isPublicSurvey
                          ? t.displayCount(decryptedResponses.length)
                          : responseViewMode === 'all'
                            ? t.displayCount(displayedResponses.length)
                            : t.displayUniqueCount(displayedResponses.length, decryptedResponses.length)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {!isPublicSurvey && (
                        <div
                          role="radiogroup"
                          aria-label={t.viewModeLabel}
                          className="inline-flex items-center bg-slate-100 dark:bg-neutral-800 rounded-lg p-0.5 text-xs transition-colors"
                        >
                          <label
                            className={`px-3 py-1.5 rounded-md cursor-pointer font-normal ${responseViewMode === 'all' ? 'bg-white shadow-sm text-slate-800 dark:bg-neutral-700 dark:text-neutral-100' : 'text-slate-600 dark:text-neutral-400'}`}
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
                            className={`px-3 py-1.5 rounded-md cursor-pointer font-normal ${responseViewMode === 'latest' ? 'bg-white shadow-sm text-slate-800 dark:bg-neutral-700 dark:text-neutral-100' : 'text-slate-600 dark:text-neutral-400'}`}
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
                      )}
                      <button
                        type="button"
                        onClick={handleDownloadCsv}
                        title={isPublicSurvey ? t.csvTooltipPublic : t.csvTooltip}
                 className="bg-emerald-700 hover:bg-emerald-800 text-neutral-100 font-normal px-5 py-2 rounded-xl transition-all text-base flex items-center justify-center gap-1.5 shadow-sm dark:bg-emerald-800 dark:hover:bg-emerald-700"
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
                        {isPublicSurvey ? t.downloadCsvPublic : t.downloadCsv}
                      </button>
                    </div>
                  </div>
                  {hasRepeats && responseViewMode === 'all' && !isPublicSurvey && (
                    <p className="text-xs text-slate-600 dark:text-neutral-400 mb-3">
                      {t.hasRepeatsInfo}
                    </p>
                  )}

                  {isPublicSurvey ? (
                    <div className="space-y-6">
                      {questions.map((q) => {
                        const questionStats = stats?.questions?.[q.id]
                        const totalAnswers = stats?.decrypted_count || 0

                        if (q.type === 'text') {
                          return (
                            <div
                              key={q.id}
                              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 transition-colors shadow-xs"
                            >
                              <div className="flex items-center gap-2 mb-3">
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                                  {t.questionTypeText}
                                </span>
                                <h4 className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                                  {q.prompt}
                                </h4>
                              </div>
                              <div className="p-4 bg-slate-50 dark:bg-neutral-950/50 rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 text-sm text-slate-500 dark:text-neutral-400 flex items-start gap-2.5">
                                <svg
                                  className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                  ></path>
                                </svg>
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

                        const badgeStyle =
                          q.type === 'single_choice'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200/30'
                            : q.type === 'multi_choice'
                              ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 border-purple-200/30'
                              : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border-indigo-200/30'

                        return (
                          <div
                            key={q.id}
                            className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 transition-colors shadow-xs"
                          >
                            <div className="flex items-center gap-2 mb-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeStyle}`}>
                                {typeLabel}
                              </span>
                              <h4 className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                                {q.prompt}
                              </h4>
                            </div>

                            <div className="space-y-4">
                              {q.options_json?.map((opt, optIdx) => {
                                const count = counts[String(optIdx)] || counts[optIdx] || 0
                                const pct = totalAnswers > 0 ? (count / totalAnswers) * 100 : 0
                                const displayPct = pct.toFixed(1)

                                return (
                                  <div key={opt} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-slate-800 dark:text-neutral-200 font-medium break-all pr-4">
                                        {opt}
                                      </span>
                                      <span className="text-slate-500 dark:text-neutral-400 text-xs font-mono whitespace-nowrap">
                                        {count} 次 ({displayPct}%)
                                      </span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-neutral-800/80 rounded-full h-3 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all duration-500 ${q.type === 'single_choice'
                                          ? 'bg-blue-600 dark:bg-blue-500'
                                          : q.type === 'multi_choice'
                                            ? 'bg-purple-600 dark:bg-purple-500'
                                            : 'bg-indigo-600 dark:bg-indigo-500'
                                          }`}
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
                  ) : (
                    <div className="overflow-x-auto rounded-xl bg-white dark:bg-neutral-900 shadow-sm max-w-full transition-colors">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-800 text-sm">
                        <thead className="bg-slate-100 dark:bg-neutral-800">
                          <tr>
                            <th
                              scope="col"
                              className="px-4 py-3 text-left text-xs font-normal text-slate-600 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap"
                            >
                              #
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-3 text-left text-xs font-normal text-slate-600 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap"
                            >
                              {t.respondentHeader}
                            </th>
                            <th
                              scope="col"
                              className="px-4 py-3 text-left text-xs font-normal text-slate-600 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap"
                            >
                              {t.submittedTimeHeader}
                            </th>
                            {questions.map((q) => (
                              <th
                                key={q.id}
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-normal text-slate-600 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap max-w-xs truncate"
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
                              className="hover:bg-slate-100/50 dark:hover:bg-neutral-800/40 transition-colors"
                            >
                              <td className="px-4 py-3 text-slate-500 dark:text-neutral-500 font-mono whitespace-nowrap">
                                {idx + 1}
                              </td>
                              <td
                                className="px-4 py-3 text-slate-700 dark:text-neutral-300 font-mono whitespace-nowrap"
                                title={resp.respondent}
                              >
                                {resp.respondent.slice(0, 8)}...{resp.respondent.slice(-8)}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-neutral-400 whitespace-nowrap">
                                {new Date(resp.claimed_at_ms).toLocaleString('zh-TW')}
                              </td>
                              {questions.map((q) => {
                                const val = resp.answers[q.id]
                                const displayVal = getAnswerText(q, val) || '—'
                                return (
                                  <td
                                    key={q.id}
                                    className="px-4 py-3 text-slate-800 dark:text-neutral-300 whitespace-nowrap max-w-xs truncate"
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
                  )}
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
            <div className="flex flex-wrap items-center gap-3">
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

              {!isActive && (
                <>
                  {purgeStatus === 'success' && (
                    <div role="status" className="alert-success py-1.5 px-3 text-sm">
                      <span>{t.purgeSuccess}</span>
                    </div>
                  )}

                  {purgeStatus === 'confirm' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPurgeStatus('idle')}
                        className="btn-secondary w-24 sm:w-28 flex-shrink-0 text-center"
                      >
                        {t.purgeCancel}
                      </button>
                      <button type="button" onClick={handlePurge} className="btn-danger">
                        {t.purgeConfirmBtn}
                      </button>
                      <span className="text-muted flex-1 min-w-[250px]">
                        {t.purgeConfirm}
                      </span>
                    </>
                  )}

                  {purgeStatus !== 'success' && purgeStatus !== 'confirm' && (
                    <button
                      type="button"
                      onClick={() => setPurgeStatus('confirm')}
                      disabled={purgeStatus === 'signing'}
                      className="btn-danger w-24 sm:w-28"
                    >
                      {purgeStatus === 'signing' ? t.purging : t.btnPurge}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {isCreator && (
            <p className="text-muted mt-2">{t.closeAndPurgeNotice(PURGE_GRACE_DAYS)}</p>
          )}

          {isCreator && !isActive && purgeStatus === 'error' && purgeError && (
            <div role="alert" className="alert-error mt-3 break-all">
              <span>{purgeError}</span>
            </div>
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
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
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
                <div className="text-slate-900 dark:text-white font-normal flex-1 min-w-0 truncate mr-4" title={s.title}>
                  {s.title}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-slate-600 dark:text-neutral-400 font-mono whitespace-nowrap">
                    {s.claimed_count} / {s.max_responses}
                  </div>
                  <div className="w-24 text-right">
                    {s.vault_id === vaultId ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-normal bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        {t.currentlySelected}
                      </span>
                    ) : (() => {
                      const state = deriveSurveyState(s.status, s.claimed_count, s.max_responses, s.deadlineMs)
                      const styles =
                        state === 'active'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/30'
                          : state === 'pending_close'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30'
                            : state === 'purged'
                              ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 border-neutral-200/50 dark:border-neutral-700/30'
                              : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200/50 dark:border-red-800/30'
                      const label =
                        state === 'active'
                          ? t.statusActive
                          : state === 'pending_close'
                            ? t.statusFull
                            : state === 'purged'
                              ? t.statusPurged
                              : t.statusClosed
                      return (
                        <span
                          className={`inline-flex items-center shrink-0 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-normal border ${styles}`}
                        >
                          {label}
                        </span>
                      )
                    })()}
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
