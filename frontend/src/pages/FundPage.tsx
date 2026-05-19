import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { parseFrontmatter, parseFullSurveyMarkdown } from '../lib/frontmatter'
import { renderMarkdown } from '../lib/markdown'
import {
  buildCreateSurveyPtb,
  estimateFundCostV2,
  extractSurveyIdFromEffects,
  extractVaultIdFromEffects,
  SSSR_BASE_PER_UNIT,
} from '../lib/ptb'
import { formatSssr } from '../lib/format'
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
  const suiClient = useSuiClient()
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

  const { data: coinsData } = useSuiClientQuery(
    'getCoins',
    {
      owner: account?.address ?? '',
      coinType: `${PACKAGE_ID}::stacked_survey_reward::STACKED_SURVEY_REWARD`,
    },
    { enabled: !!account && !!PACKAGE_ID },
  )

  const sssrCoins = useMemo(() => {
    return coinsData?.data ?? []
  }, [coinsData])

  const creatorSssrBalance = useMemo(() => {
    return sssrCoins.reduce((sum, c) => sum + BigInt(c.balance), 0n)
  }, [sssrCoins])

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
    if (!feeFields) {
      return { totalFeeBps: 2000n, discountBps: 5000n }
    }
    return {
      totalFeeBps: BigInt(feeFields.total_fee_bps ?? '2000'),
      discountBps: BigInt(feeFields.discount_bps ?? '5000'),
    }
  }, [poolData])

  const cost = useMemo(() => {
    if (!frontmatter?.ok) return null
    return estimateFundCostV2({
      perResponse: BigInt(frontmatter.data.perResponse),
      maxResponses: frontmatter.data.maxResponses,
      totalSuiInvested,
      feeConfig,
      creatorSssrBalance,
    })
  }, [frontmatter, totalSuiInvested, feeConfig, creatorSssrBalance])

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
      console.error('E2E Debug: handleFund signature/encryption catch:', err)
      setErrorMsg(err instanceof Error ? err.message : '簽名或加密失敗')
      setStatus('error')
      return
    }

    const fullSurvey = parseFullSurveyMarkdown(draft.contentMd)
    if (!fullSurvey.ok) {
      setErrorMsg(fullSurvey.error)
      setStatus('error')
      return
    }

    const sha256 = async (text: string): Promise<Uint8Array> => {
      const data = new TextEncoder().encode(text)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      return new Uint8Array(hashBuffer)
    }

    let contentHash: Uint8Array
    let schemaHash: Uint8Array
    try {
      contentHash = await sha256(draft.contentMd)
      const schemaStr = JSON.stringify(fullSurvey.data.questions || [])
      schemaHash = await sha256(schemaStr)
    } catch (err) {
      console.error('E2E Debug: handleFund hash calculation catch:', err)
      setErrorMsg('Hash 計算失敗')
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
        contentHash,
        schemaHash,
        questions: fullSurvey.data.questions,
        offsetIn: cost.offsetIn,
        creatorSssrCoins: sssrCoins,
      })
    } catch (err) {
      console.error('E2E Debug: handleFund build PTB catch:', err)
      setErrorMsg(err instanceof Error ? err.message : 'PTB 建構失敗')
      setStatus('error')
      return
    }

    setStatus('submitting')
    signAndExecute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        transaction: tx as any,
        options: {
          showObjectChanges: true,
          showEffects: true,
        },
      },
      {
        onSuccess: async (result) => {
          console.log('E2E Debug: signAndExecute onSuccess result:', JSON.stringify(result))
          try {
            let txResult = (window as any).mockLastExecutedTransactionResult
            if (!txResult) {
              for (let attempt = 0; attempt < 5; attempt++) {
                try {
                  const res = await suiClient.getTransactionBlock({
                    digest: result.digest,
                    options: {
                      showObjectChanges: true,
                      showEffects: true,
                      showEvents: true,
                    },
                  })
                  if (res && ((res.events && res.events.length > 0) || (res.objectChanges && res.objectChanges.length > 0))) {
                    txResult = res
                    break
                  }
                } catch (e) {
                  console.warn(`[FundPage] Attempt ${attempt} to fetch tx block failed, retrying...`, e)
                }
                await new Promise((resolve) => setTimeout(resolve, 1000))
              }
            }

            if (!txResult) {
              throw new Error('無法從節點取得交易資訊')
            }

            if (txResult.effects && txResult.effects.status && txResult.effects.status.status === 'failure') {
              throw new Error(`交易鏈上執行失敗: ${txResult.effects.status.error || '未知 Move 錯誤'}`)
            }

            let vaultId = null
            let surveyId = null

            // 1. Try to extract from on-chain events (primary)
            if (txResult.events && txResult.events.length > 0) {
              const hit = txResult.events.find(
                (e: any) =>
                  e.type.endsWith('::survey_registry::SurveyRegistered') ||
                  e.type.includes('::survey_registry::SurveyRegistered')
              )
              if (hit && hit.parsedJson) {
                vaultId = (hit.parsedJson as any).vault_id
                surveyId = (hit.parsedJson as any).survey_id
                console.log('[FundPage] Successfully extracted vaultId and surveyId from events:', vaultId, surveyId)
              }
            }

            // 2. Fallback to objectChanges (secondary)
            if (!vaultId && txResult.objectChanges) {
              const changes = txResult.objectChanges
              console.log('E2E Debug: fetched changes fallback:', JSON.stringify(changes))
              vaultId = extractVaultIdFromEffects(changes)
              surveyId = extractSurveyIdFromEffects(changes)
            }

            if (!vaultId) {
              setErrorMsg('交易成功但無法抽出 vault_id')
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
          } catch (err: any) {
            console.error('E2E Debug: onSuccess query error:', err)
            setErrorMsg(err.message || '查詢交易結果失敗')
            setStatus('error')
          }
        },
        onError: (err) => {
          console.error('E2E Debug: handleFund signAndExecute onError:', err)
          setErrorMsg(err.message)
          setStatus('error')
        },
      },
    )
  }

  const sui = (mist: bigint) => (Number(mist) / 1e9).toFixed(4)
  const sssr = (base: bigint) => formatSssr(base)

  return (
    <main className="min-h-screen p-8 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">注資問卷金庫</h1>

      {/* 問卷內容預覽 */}
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-2 text-gray-800">問卷內容預覽</h2>
        <div
          aria-label="markdown 預覽"
          className="border rounded-xl p-4 max-h-60 overflow-y-auto bg-gray-50 prose max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.contentMd) }}
        />
      </div>

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
          <span className="font-semibold">平台手續費（fee）：</span>
          <span aria-label="platform-fee">
            {cost ? `${sssr(cost.grossSssrBase * cost.effectiveFeeBps / 10000n)} sSSR` : '計算中…'}
          </span>
        </p>
        <p>
          <span className="font-semibold">預估 SUI 消耗：</span>
          <span aria-label="estimated-sui-cost">
            {suiToSpend ? `${sui(suiToSpend)} SUI（含 1% 滑點緩衝）` : '計算中…'}
          </span>
        </p>
      </div>

      {cost && (
        <div className="bg-white border rounded-xl p-6 mb-6 shadow-sm space-y-4 text-sm">
          <h2 className="text-lg font-bold border-b pb-2 text-gray-800">資金分拆流向</h2>
          
          <div className="space-y-4">
            {/* Section 1: 既有 sSSR 折抵 */}
            <div className="space-y-1">
              <h3 className="font-semibold text-gray-700">1. 既有 sSSR 折抵</h3>
              <p className="text-gray-900 font-mono">抵扣數額: {sssr(cost.offsetIn)} sSSR</p>
              <p className="text-xs text-gray-500">
                優先扣除您錢包中已持有的 sSSR 憑證餘額。
              </p>
            </div>

            {/* Section 2: AMM 注資 */}
            <div className="space-y-1">
              <h3 className="font-semibold text-gray-700">2. AMM 注資</h3>
              <p className="text-gray-900 font-mono">新購數額: {sssr(cost.minted)} sSSR</p>
              <p className="text-xs text-gray-500">
                折抵後仍需通過 AMM 鑄造的 sSSR 數量。
              </p>
            </div>

            {/* Section 3: 費率分拆 */}
            <div className="space-y-1">
              <h3 className="font-semibold text-gray-700">3. 費率分拆</h3>
              <p className="text-red-600 font-mono">分拆手續費 (fee): {sssr(cost.grossSssrBase * cost.effectiveFeeBps / 10000n)} sSSR</p>
              <p className="text-xs text-gray-500">
                依據 Pool 平台費率 ({Number(cost.effectiveFeeBps) / 100}%) 自動提撥給管理庫。
              </p>
            </div>
          </div>
        </div>
      )}

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
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors w-full"
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
