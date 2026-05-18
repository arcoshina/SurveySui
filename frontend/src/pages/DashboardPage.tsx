import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  aggregateStats,
  decryptAllResponses,
  fetchClaimedEvents,
  type DashboardStats,
  type SurveyClaimedEvent,
} from '../lib/dashboardDecrypt'
import { buildClosePtb, SSSR_BASE_PER_UNIT } from '../lib/ptb'
import { KEY_DERIVE_MSG, base64urlToBytes, deriveCreatorKeyPair } from '../lib/crypto'

function getPackageId(): string {
  return import.meta.env.VITE_PACKAGE_ID ?? ''
}

interface VaultFields {
  creator: string
  balance: string
  status: number
  claimed_count: string
  max_responses: string
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
  const location = useLocation()
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage()

  const contentKeyB64 = location.hash.startsWith('#') ? location.hash.slice(1) : ''

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

  // ── 解密 ──────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [decryptStatus, setDecryptStatus] = useState<
    'idle' | 'signing' | 'decrypting' | 'done' | 'error'
  >('idle')
  const [decryptError, setDecryptError] = useState<string | null>(null)

  const isCreator = !!account && !!vault && account.address === vault.creator
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
      const { responses } = await decryptAllResponses(events, kp.privateKey)
      const s = aggregateStats(responses, events.length)
      setStats(s)
      setDecryptStatus('done')
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : '解密失敗')
      setDecryptStatus('error')
    }
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
    isCreator &&
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
  const displayBalanceSssr = vault
    ? (Number(BigInt(vault.balance)) / Number(SSSR_BASE_PER_UNIT)).toFixed(4)
    : null

  const chartSections = useMemo(() => {
    if (!stats) return []
    return Object.entries(stats.questions).map(([qid, q]) => ({
      qid,
      data: Object.entries(q.counts).map(([label, count]) => ({ label, count })),
    }))
  }, [stats])

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">儀表板</h1>
      <p className="text-sm text-gray-500 mb-6 break-all">
        Vault: <span className="font-mono">{vaultId ?? '?'}</span>
      </p>

      <div className="mb-6">
        <ConnectButton />
      </div>

      {eventsState.kind === 'error' && (
        <p role="alert" className="text-red-600 mb-4 text-sm">
          {eventsState.error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 border rounded p-4">
          <p className="text-sm text-gray-500">回覆數</p>
          <p className="text-2xl font-bold" aria-label="response-count">
            {responseCount}
          </p>
        </div>
        <div className="bg-gray-50 border rounded p-4">
          <p className="text-sm text-gray-500">名額上限</p>
          <p className="text-2xl font-bold" aria-label="max-responses">
            {vault ? vault.max_responses : '—'}
          </p>
        </div>
        <div className="bg-gray-50 border rounded p-4">
          <p className="text-sm text-gray-500">Vault 餘額（鏈上）</p>
          <p className="text-2xl font-bold" aria-label="vault-balance">
            {displayBalanceSssr !== null
              ? `${displayBalanceSssr} sSSR`
              : '查詢中…'}
          </p>
        </div>
      </div>

      {/* ── 解密 + 統計圖表 ──────────────────────────────────────────────── */}
      {responseCount === 0 ? (
        <div className="bg-gray-50 border rounded p-6 text-center text-gray-500 mb-6">
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

          {stats &&
            chartSections.map(({ qid, data }) => (
              <div key={qid} className="mb-8">
                <h2 className="text-lg font-semibold mb-2">{qid}</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ))}

          {stats && stats.failed_count > 0 && (
            <p className="text-xs text-amber-600">
              有 {stats.failed_count} 筆回覆無法解密（金鑰不符或資料毀損）。
            </p>
          )}
        </section>
      )}

      {/* ── 結束活動 ─────────────────────────────────────────────────────── */}
      <div className="mt-6 border-t pt-6">
        <p className="text-sm text-gray-500 mb-3">
          狀態：
          <span
            className={
              isActive
                ? 'text-green-600 font-semibold'
                : 'text-gray-500 font-semibold'
            }
          >
            {vault ? (isActive ? '進行中' : '已結束') : '查詢中'}
          </span>
        </p>

        {closeStatus === 'success' && (
          <p role="status" className="text-green-700 mb-3 text-sm">
            活動已成功結束，剩餘 sSSR 已退回您的錢包。
          </p>
        )}
        {closeStatus === 'error' && closeError && (
          <p role="alert" className="text-red-600 mb-3 text-sm break-all">
            {closeError}
          </p>
        )}

        <button
          type="button"
          onClick={handleClose}
          disabled={!canClose}
          className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {closeStatus === 'signing' ? '結束中…' : '結束活動'}
        </button>

        {vault && !isCreator && (
          <p className="text-xs text-gray-400 mt-2">僅限問卷建立者可結束活動。</p>
        )}
      </div>
    </main>
  )
}
