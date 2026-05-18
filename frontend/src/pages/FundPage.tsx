import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { parseFrontmatter } from '../lib/frontmatter'
import {
  buildCreateSurveyPtb,
  estimateFundCost,
  extractSurveyIdFromEffects,
  extractVaultIdFromEffects,
  SSSR_BASE_PER_UNIT,
} from '../lib/ptb'
import {
  KEY_DERIVE_MSG,
  bytesToBase64url,
  deriveCreatorKeyPair,
  encryptSurveyContent,
} from '../lib/crypto'

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID ?? ''
const POOL_ID = import.meta.env.VITE_AMM_POOL_ID ?? ''
const SSR_TREASURY_ID = import.meta.env.VITE_SSR_TREASURY_ID ?? ''
const SSSR_TREASURY_ID = import.meta.env.VITE_SSSR_TREASURY_ID ?? ''
const SURVEY_REGISTRY_ID = import.meta.env.VITE_SURVEY_REGISTRY_ID ?? ''
const ADMIN_TREASURY = import.meta.env.VITE_ADMIN_ADDRESS ?? ''

const DRAFT_KEY_PREFIX = 'surveysui:draft:'
const SURVEY_KEY_PREFIX = 'surveysui:survey:'

/** Slippage buffer: invest 1% more SUI than the curve says, in case `total_sui_invested` shifts. */
const SLIPPAGE_NUMER = 101n
const SLIPPAGE_DENOM = 100n

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
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

export default function FundPage() {
  const { id: draftId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage()

  const [draft, setDraft] = useState<DraftEntry | null>(() => readDraft(draftId))

  useEffect(() => {
    setDraft(readDraft(draftId))
  }, [draftId])

  const frontmatter = useMemo(
    () => (draft ? parseFrontmatter(draft.contentMd) : null),
    [draft],
  )

  const { data: poolData } = useSuiClientQuery(
    'getObject',
    { id: POOL_ID, options: { showContent: true } },
    { enabled: !!POOL_ID },
  )

  const totalSuiInvested = useMemo<bigint>(() => {
    if (poolData?.data?.content?.dataType !== 'moveObject') return 0n
    const fields = (poolData.data.content as { fields: Record<string, string> }).fields
    return BigInt(fields.total_sui_invested ?? '0')
  }, [poolData])

  const cost = useMemo(() => {
    if (!frontmatter?.ok) return null
    return estimateFundCost({
      perResponse: BigInt(frontmatter.data.perResponse),
      maxResponses: frontmatter.data.maxResponses,
      totalSuiInvested,
    })
  }, [frontmatter, totalSuiInvested])

  const suiToSpend = cost ? (cost.suiToInvest * SLIPPAGE_NUMER) / SLIPPAGE_DENOM : null

  const [status, setStatus] = useState<'idle' | 'signing' | 'submitting' | 'success' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!draftId || !draft) {
    return (
      <main className="min-h-screen p-8 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">注資</h1>
        <p className="text-red-600">找不到問卷草稿（draftId={draftId ?? '?'}）。請從 /create 重新建立。</p>
      </main>
    )
  }

  if (!frontmatter?.ok) {
    return (
      <main className="min-h-screen p-8 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">注資</h1>
        <p className="text-red-600">Frontmatter 解析失敗：{frontmatter?.error ?? '未知錯誤'}</p>
      </main>
    )
  }

  const params = frontmatter.data
  const totalSssr = params.perResponse * params.maxResponses

  async function handleFund() {
    if (!account || !cost || !suiToSpend || !draft) return
    setStatus('signing')
    setErrorMsg(null)

    let creatorPublicKeyBytes: Uint8Array
    let contentKey: Uint8Array
    let encryptedBlob: Uint8Array
    try {
      const message = new TextEncoder().encode(KEY_DERIVE_MSG)
      const { signature } = await signPersonalMessageAsync({ message })
      const sigBytes = base64ToBytes(signature)
      const kp = await deriveCreatorKeyPair(sigBytes)
      creatorPublicKeyBytes = kp.publicKeyBytes

      const shouldEncrypt = draft.encrypt !== false
      if (shouldEncrypt) {
        const enc = await encryptSurveyContent(draft.contentMd, creatorPublicKeyBytes)
        encryptedBlob = enc.encryptedBlob
        contentKey = enc.contentKey
      } else {
        const mdBytes = new TextEncoder().encode(draft.contentMd)
        encryptedBlob = new Uint8Array(creatorPublicKeyBytes.length + mdBytes.length)
        encryptedBlob.set(creatorPublicKeyBytes, 0)
        encryptedBlob.set(mdBytes, creatorPublicKeyBytes.length)
        contentKey = new Uint8Array(0)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '簽名或加密失敗')
      setStatus('error')
      return
    }

    let tx
    try {
      tx = buildCreateSurveyPtb({
        packageId: PACKAGE_ID,
        poolId: POOL_ID,
        ssrTreasuryId: SSR_TREASURY_ID,
        sssrTreasuryId: SSSR_TREASURY_ID,
        registryId: SURVEY_REGISTRY_ID,
        adminTreasury: ADMIN_TREASURY,
        perResponse: BigInt(params.perResponse),
        maxResponses: params.maxResponses,
        deadlineMs: BigInt(params.deadlineMs),
        encryptedContent: encryptedBlob,
        suiToSpend,
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PTB 建構失敗')
      setStatus('error')
      return
    }

    setStatus('submitting')
    signAndExecute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { transaction: tx as any },
      {
        onSuccess: (result) => {
          const changes = (
            result as {
              objectChanges?: Array<{
                type: string
                objectId?: string
                objectType?: string
              }>
            }
          ).objectChanges
          const vaultId = extractVaultIdFromEffects(changes)
          const surveyId = extractSurveyIdFromEffects(changes)

          if (!vaultId) {
            setErrorMsg('交易成功但無法從 effects 抽出 vault_id')
            setStatus('error')
            return
          }

          if (surveyId) {
            window.localStorage.setItem(
              `${SURVEY_KEY_PREFIX}${surveyId}`,
              JSON.stringify({
                vaultId,
                contentKeyB64: contentKey.length > 0 ? bytesToBase64url(contentKey) : '',
                createdAt: Date.now(),
              }),
            )
          }
          window.localStorage.removeItem(`${DRAFT_KEY_PREFIX}${draftId}`)

          const fragment = contentKey.length > 0 ? bytesToBase64url(contentKey) : ''
          setStatus('success')
          navigate(`/dashboard/${vaultId}${fragment ? `#${fragment}` : ''}`)
        },
        onError: (err) => {
          setErrorMsg(err.message)
          setStatus('error')
        },
      },
    )
  }

  const sui = (mist: bigint) => (Number(mist) / 1e9).toFixed(4)
  const sssr = (base: bigint) => (Number(base) / Number(SSSR_BASE_PER_UNIT)).toFixed(4)

  return (
    <main className="min-h-screen p-8 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">注資問卷金庫</h1>

      <div className="bg-gray-50 border rounded p-4 mb-6 space-y-2 text-sm">
        <p>
          <span className="font-semibold">每份獎勵：</span>
          {params.perResponse} sSSR
        </p>
        <p>
          <span className="font-semibold">名額上限：</span>
          {params.maxResponses}
        </p>
        <p>
          <span className="font-semibold">獎勵總額（vault 內 net）：</span>
          {totalSssr} sSSR
        </p>
        <p>
          <span className="font-semibold">平台手續費（0.3%）：</span>
          <span aria-label="platform-fee">
            {cost ? `${sssr(cost.vaultFeeBase)} sSSR` : '計算中…'}
          </span>
        </p>
        <p>
          <span className="font-semibold">預估 SUI 消耗：</span>
          <span aria-label="estimated-sui-cost">
            {suiToSpend ? `${sui(suiToSpend)} SUI（含 1% 滑點緩衝）` : '計算中…'}
          </span>
        </p>
      </div>

      <div className="mb-4">
        <ConnectButton />
      </div>

      {errorMsg && (
        <p role="alert" className="text-red-600 mb-4 text-sm break-all">
          {errorMsg}
        </p>
      )}

      <button
        type="button"
        onClick={handleFund}
        disabled={!account || !suiToSpend || status === 'signing' || status === 'submitting' || status === 'success'}
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {status === 'signing'
          ? '簽名中…'
          : status === 'submitting'
            ? '送出中…'
            : '一鍵注資'}
      </button>
    </main>
  )
}
