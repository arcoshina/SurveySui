import { useEffect, useMemo, useRef, useState } from 'react'
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
} from '../lib/ptb'
import { formatSsr } from '../lib/format'
import {
  KEY_DERIVE_MSG,
  bytesToBase64url,
  deriveCreatorKeyPair,
  encryptSurveyContent,
  type CreatorKeyPair,
} from '../lib/crypto'
import { translateMoveAbort } from '../lib/moveAbort'

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID ?? ''
const POOL_ID = import.meta.env.VITE_AMM_POOL_ID ?? ''
const SR_TREASURY_ID = import.meta.env.VITE_SR_TREASURY_ID ?? ''
const SSR_TREASURY_ID = import.meta.env.VITE_SSR_TREASURY_ID ?? ''
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

  const ssrCoins = useMemo(() => {
    return coinsData?.data ?? []
  }, [coinsData])

  const creatorSsrBalance = useMemo(() => {
    return ssrCoins.reduce((sum, c) => sum + BigInt(c.balance), 0n)
  }, [ssrCoins])

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
      creatorSsrBalance,
    })
  }, [frontmatter, totalSuiInvested, feeConfig, creatorSsrBalance])

  const suiToSpend = cost ? (cost.suiToInvest * SLIPPAGE_NUMER) / SLIPPAGE_DENOM : null

  const [keypair, setKeypair] = useState<CreatorKeyPair | null>(null)
  const [status, setStatus] = useState<'idle' | 'key-signing' | 'key-ready' | 'tx-signing' | 'submitting' | 'success' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [encrypt, setEncrypt] = useState(true)

  useEffect(() => {
    if (draft) {
      setEncrypt(draft.encrypt !== false)
    }
  }, [draft])

  const fullSurvey = useMemo(() => {
    if (!draft) return null
    const parsed = parseFullSurveyMarkdown(draft.contentMd)
    return parsed.ok ? parsed.data : null
  }, [draft])

  function handleDownloadDraft() {
    if (!draft) return
    const blob = new Blob([draft.contentMd], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const slug = frontmatter?.ok ? frontmatter.data.title.replace(/[^\w一-龥-]+/g, '-').slice(0, 40) : 'survey'
    const date = new Date().toISOString().slice(0, 10)
    a.download = `survey-${slug}-${date}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 切換錢包時清除 keypair
  const prevAddressRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (prevAddressRef.current && prevAddressRef.current !== account?.address) {
      setKeypair(null)
      setStatus('idle')
    }
    prevAddressRef.current = account?.address
  }, [account?.address])

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
  const totalSsr = params.perResponse * params.maxResponses

  async function handleSetupKey() {
    if (!account) return
    setStatus('key-signing')
    setErrorMsg(null)
    try {
      const message = new TextEncoder().encode(KEY_DERIVE_MSG)
      const { signature } = await signPersonalMessageAsync({ message })
      const kp = await deriveCreatorKeyPair(base64ToBytes(signature))
      setKeypair(kp)
      setStatus('key-ready')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '金鑰設定失敗')
      setStatus('error')
    }
  }

  async function handleFund() {
    if (!account || !cost || !suiToSpend || !draft || !keypair) return
    setStatus('tx-signing')
    setErrorMsg(null)

    const creatorPublicKeyBytes = keypair.publicKeyBytes
    let contentKey: Uint8Array
    let encryptedBlob: Uint8Array
    try {

      const shouldEncrypt = encrypt
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
      console.error('E2E Debug: handleFund encryption catch:', err)
      setErrorMsg(err instanceof Error ? err.message : '加密失敗')
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

    const buildTx = () => {
      return buildCreateSurveyPtb({
        packageId: PACKAGE_ID,
        poolId: POOL_ID,
        srTreasuryId: SR_TREASURY_ID,
        ssrTreasuryId: SSR_TREASURY_ID,
        registryId: SURVEY_REGISTRY_ID,
        adminTreasury: ADMIN_TREASURY,
        perResponse: BigInt(params.perResponse),
        maxResponses: params.maxResponses,
        deadlineMs: BigInt(params.deadlineMs),
        encryptedContent: encryptedBlob,
        suiToSpend,
        contentHash,
        schemaHash,
        creatorPubKey: creatorPublicKeyBytes,
        questions: fullSurvey.data.questions,
        minTier: fullSurvey.data.minTier,
        offsetIn: cost.offsetIn,
        creatorSsrCoins: ssrCoins,
      })
    }

    // Dry-run pre-flight (best-effort)：抓到合約 abort 就攔在錢包簽名前；
    // 但 build / RPC 自己出錯時降級放行，讓後續 signAndExecute 的 onError 處理。
    try {
      const dryRunTx = buildTx()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(dryRunTx as any).setSender(account.address)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dryRunBytes = await (dryRunTx as any).build({ client: suiClient })
      const dryRunResult = await suiClient.dryRunTransactionBlock({
        transactionBlock: dryRunBytes,
      })
      if (dryRunResult.effects.status.status === 'failure') {
        const rawErr = dryRunResult.effects.status.error ?? '未知錯誤'
        const friendly = translateMoveAbort(rawErr)
        setErrorMsg(friendly ?? `預檢失敗：${rawErr}`)
        setStatus('error')
        return
      }
    } catch (err) {
      console.warn('[FundPage] dry-run pre-flight skipped:', err)
    }

    setStatus('submitting')
    const actualTx = buildTx()
    signAndExecute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        transaction: actualTx as any,
      },
      {
        onSuccess: async (result) => {
          console.log('E2E Debug: signAndExecute onSuccess result:', JSON.stringify(result))
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let txResult = (window as any).mockLastExecutedTransactionResult
            if (!txResult) {
              try {
                await suiClient.waitForTransaction({
                  digest: result.digest,
                  timeout: 30_000,
                  pollInterval: 1_000,
                })
              } catch (e) {
                console.warn('[FundPage] waitForTransaction timed out, falling back to getTransactionBlock', e)
              }
              txResult = await suiClient.getTransactionBlock({
                digest: result.digest,
                options: {
                  showObjectChanges: true,
                  showEffects: true,
                  showEvents: true,
                },
              })
            }

            if (!txResult) {
              throw new Error('無法從節點取得交易資訊')
            }

            if (txResult.effects && txResult.effects.status && txResult.effects.status.status === 'failure') {
              const rawErr = txResult.effects.status.error || '未知 Move 錯誤'
              const friendly = translateMoveAbort(rawErr)
              throw new Error(friendly ?? `交易鏈上執行失敗：${rawErr}`)
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
          const friendly = translateMoveAbort(err.message)
          setErrorMsg(friendly ?? err.message)
          setStatus('error')
        },
      },
    )
  }

  const sui = (mist: bigint) => (Number(mist) / 1e9).toFixed(4)
  const ssr = (base: bigint) => formatSsr(base)

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6">
        
        {/* 頂部標題 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-slate-100 animate-fadeIn">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              🚀 預覽並發布問卷
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              請在此確認問卷填答介面、下載備份草稿並完成鏈上注資與發布。
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadDraft}
            className="px-4 py-2 border border-slate-200 bg-white text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
          >
            💾 下載備份草稿 (.md)
          </button>
        </div>

        {/* 1. 仿真填答者視角預覽 */}
        {fullSurvey && fullSurvey.questions && (
          <div className="border border-slate-200/80 rounded-2xl p-5 bg-slate-50/50 shadow-sm space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-200/65 pb-2">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                👁️ 填答者介面即時預覽 (Live Preview)
              </h3>
              <span className="text-[10px] font-black px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                唯讀模式
              </span>
            </div>
            
            <div className="space-y-5 max-h-[350px] overflow-y-auto pr-2">
              <div className="space-y-1 bg-white p-4 rounded-xl border border-slate-100">
                <h4 className="text-lg font-black text-slate-800">{fullSurvey.title}</h4>
                {fullSurvey.description && (
                  <p className="text-xs text-slate-500 leading-relaxed font-mono whitespace-pre-wrap pt-1">
                    {fullSurvey.description}
                  </p>
                )}
              </div>

              {fullSurvey.questions.map((q: any, i: number) => (
                <div key={q.id} className="bg-white border border-slate-100 rounded-xl p-4 space-y-2">
                  <p className="text-xs text-slate-400 font-bold">
                    第 {i + 1} 題 {q.required && <span className="text-red-500">（必填）</span>}
                  </p>
                  <p className="text-sm font-bold text-slate-700">{q.prompt}</p>

                  {/* 題型渲染 */}
                  {q.type === 'single_choice' && q.options_json && (
                    <div className="space-y-1.5 pt-1.5">
                      {q.options_json.map((opt: string, oi: number) => (
                        <label key={oi} className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-not-allowed">
                          <input
                            type="radio"
                            name={`preview-single-${q.id}`}
                            disabled
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 border-slate-300"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === 'multi_choice' && q.options_json && (
                    <div className="space-y-1.5 pt-1.5">
                      {q.options_json.map((opt: string, oi: number) => (
                        <label key={oi} className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-not-allowed">
                          <input
                            type="checkbox"
                            disabled
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === 'text' && (
                    <textarea
                      disabled
                      rows={2}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-400 bg-slate-50 cursor-not-allowed"
                      placeholder="填答者簡答輸入框預覽..."
                    />
                  )}

                  {q.type === 'scale' && (
                    <div className="flex gap-4 pt-2">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <label key={val} className="flex flex-col items-center gap-1 cursor-not-allowed">
                          <span className="text-[10px] text-slate-400 font-bold">{val}</span>
                          <input
                            type="radio"
                            name={`preview-scale-${q.id}`}
                            disabled
                            className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 border-slate-300"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. 費用估計與資金明細 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
          {/* 左：預估與手續費摘要 */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3.5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 border-b pb-1.5">📊 獎勵與發佈設定</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">每份填答獎勵：</span>
                <span className="font-bold text-slate-800">{params.perResponse} SSR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">名額限制上限：</span>
                <span className="font-bold text-slate-800">{params.maxResponses} 份</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-500 font-medium">獎勵總額 (Net)：</span>
                <span className="font-bold text-slate-800">{totalSsr} SSR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">平台手續費 ({cost ? `${Number(cost.effectiveFeeBps) / 100}%` : '計算中...'})：</span>
                <span className="font-bold text-slate-800" aria-label="platform-fee">
                  {cost ? `${ssr(cost.grossSsrBase * cost.effectiveFeeBps / 10000n)} SSR` : '計算中...'}
                </span>
              </div>
              
              {/* 大字突出：最終估算 SUI 消耗 */}
              <div className="bg-blue-600 text-white rounded-xl p-3 mt-3 flex justify-between items-center shadow-md">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold opacity-80">預估 SUI 消耗總計</span>
                  <span className="text-[9px] opacity-60">已包含 1% 滑點緩衝</span>
                </div>
                <span className="text-lg font-black font-mono" aria-label="estimated-sui-cost">
                  {suiToSpend ? `${sui(suiToSpend)} SUI` : '計算中...'}
                </span>
              </div>
            </div>
          </div>

          {/* 右：詳細資金分拆流向 */}
          {cost && (
            <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3 shadow-sm text-xs">
              <h3 className="text-sm font-bold text-slate-800 border-b pb-1.5">⛓️ 資金分拆流向</h3>
              <div className="space-y-3">
                <div className="flex flex-col">
                  <div className="flex justify-between font-bold text-slate-700">
                    <span>1. 既有 SSR 折抵</span>
                    <span className="font-mono text-slate-900">{ssr(cost.offsetIn)} SSR</span>
                  </div>
                  <span className="text-[10px] text-slate-400">優先扣除您錢包中已持有的 SSR 餘額。</span>
                </div>
                
                <div className="flex justify-between font-bold text-slate-700 border-t border-slate-100 pt-1.5">
                  <div className="flex flex-col">
                    <span>2. AMM 鑄造 (Sui 新購)</span>
                    <span className="text-[10px] text-slate-400 font-normal">扣除折抵後需要由 SUI 自動加值鑄造。</span>
                  </div>
                  <span className="font-mono text-slate-900">{ssr(cost.minted)} SSR</span>
                </div>

                <div className="flex justify-between font-bold text-slate-700 border-t border-slate-100 pt-1.5">
                  <div className="flex flex-col">
                    <span>3. 平台費率提撥</span>
                    <span className="text-[10px] text-slate-400 font-normal">依據平台機制提撥給管理金庫。</span>
                  </div>
                  <span className="font-mono text-rose-600">{ssr(cost.grossSsrBase * cost.effectiveFeeBps / 10000n)} SSR</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. 加密安全開關 */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center gap-3 animate-fadeIn">
          <input
            id="encrypt-survey"
            type="checkbox"
            checked={encrypt}
            onChange={(e) => setEncrypt(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
          />
          <div className="flex flex-col cursor-pointer select-none" onClick={() => setEncrypt(!encrypt)}>
            <label htmlFor="encrypt-survey" className="text-xs font-bold text-slate-700 cursor-pointer">
              加密問卷題目（極力推薦）
            </label>
            <span className="text-[10px] text-slate-400">
              啟用加密以防範鏈上數據窺探，全方位保護問卷問題與填答隱私。
            </span>
          </div>
        </div>

        {/* 4. 錢包連結與發布操作 */}
        <div className="space-y-3 pt-2 border-t border-slate-100 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">發佈人錢包帳號</span>
            <ConnectButton />
          </div>

          {errorMsg && (
            <div role="alert" className="text-rose-500 text-xs font-bold bg-rose-50 border border-rose-100 rounded-xl p-3 break-all">
              ⚠️ {errorMsg}
            </div>
          )}

          {account ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => navigate(`/create/${draftId}`)}
                className="w-full sm:w-1/3 border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-sm px-6 py-3.5 rounded-2xl transition-all"
              >
                ⬅ 返回修改問卷
              </button>
              <div className="w-full sm:w-2/3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSetupKey}
                  disabled={!!keypair || status === 'key-signing'}
                  className="bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-6 py-3.5 rounded-2xl disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  {status === 'key-signing'
                    ? '⚙️ 設定加密金鑰中...'
                    : keypair
                      ? '✓ 步驟一：加密金鑰已就緒'
                      : '🔑 步驟一：設定加密金鑰'}
                </button>
                <button
                  type="button"
                  onClick={handleFund}
                  disabled={!keypair || !suiToSpend || status === 'tx-signing' || status === 'submitting' || status === 'success'}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-bold text-xs px-6 py-3.5 rounded-2xl disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {status === 'tx-signing' || status === 'submitting'
                    ? '🚀 發布中，請在錢包簽名...'
                    : status === 'success'
                      ? '✓ 發布成功！'
                      : '發布問卷 (注資並發佈至鏈上) ➔'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <p className="text-xs font-bold text-amber-700">請先點擊上方按鈕連接您的 Sui 錢包，以開始設定金鑰與發布交易。</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
