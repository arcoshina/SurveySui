import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { parseFrontmatter, parseFullSurveyMarkdown, type QuestionType } from '../lib/frontmatter'
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
import { useLanguage } from '../context/LanguageContext'

const content = {
  ZH: {
    typeSingleChoice: '單選',
    typeMultiChoice: '複選',
    typeText: '簡答',
    typeScale: '量表',
    pageTitle: '注資',
    draftNotFound: (id: string) => `找不到問卷草稿（draftId=${id}）。請從 /create 重新建立。`,
    frontmatterParseFailed: (err: string) => `Frontmatter 解析失敗：${err}`,
    unknownError: '未知錯誤',
    errKeySetupFailed: '金鑰設定失敗',
    errEncryptFailed: '加密失敗',
    errHashCalcFailed: 'Hash 計算失敗',
    errDryRunFailed: (raw: string) => `預檢失敗：${raw}`,
    errUnknownMoveError: '未知 Move 錯誤',
    errTxOnchainFailed: (raw: string) => `交易鏈上執行失敗：${raw}`,
    errCannotFetchTx: '無法從節點取得交易資訊',
    errCannotExtractVaultId: '交易成功但無法抽出 vault_id',
    errQueryTxFailed: '查詢交易結果失敗',
    title: '預覽並發布問卷',
    desc: '請在此確認問卷填答介面並完成鏈上注資與發布。',
    previewTitle: '問卷預覽',
    readOnly: '唯讀模式',
    questionNum: (n: number) => `第 ${n} 題`,
    required: '必填',
    textPlaceholder: '填答者簡答輸入框預覽...',
    rewardSettings: '獎勵與發佈設定',
    perResponseLabel: '首次填答獎勵:',
    maxResponsesLabel: '名額上限:',
    unitCopies: '份',
    repeatRewardLabel: '重複填答獎勵:',
    timesPerPerson: '次/人',
    totalRewardLabel: '總獎勵:',
    platformFeeLabel: (pct: string) => `平台手續費 (${pct}):`,
    calculating: '計算中...',
    estimatedTotal: '預估總計',
    withSlippage: '含 1% 滑點',
    fundFlow: '資金分拆流向',
    flow1Title: '1. SSR 折抵',
    flow1Desc: '優先扣除已持有的 SSR',
    flow2Title: '2. 平台手續費',
    flow2Desc: '外加於總獎勵的最大值',
    flow3Title: '3. 鑄造 SSR 差額',
    flow3Desc: '花費 SUI 從 AMM 鑄造',
    encryptSurvey: '加密空白問卷',
    encryptSurveyDesc: '加密問卷中的問題,避免過早揭露商業策略。',
    btnBack: '← 返回:修改問卷',
    keySigningBtn: '設定加密金鑰中...',
    keyReadyBtn: '加密金鑰已就緒',
    setupKeyBtn: '產生答卷加密金鑰',
    submittingBtn: '發布中,請在錢包簽名...',
    successBtn: '發布成功!',
    publishBtn: '注資並發布問卷',
    connectWalletPrompt: '請先點擊右上角按鈕連接您的 Sui 錢包,以開始設定金鑰與發布交易。',
  },
  EN: {
    typeSingleChoice: 'Single Choice',
    typeMultiChoice: 'Multi Choice',
    typeText: 'Text',
    typeScale: 'Scale',
    pageTitle: 'Fund',
    draftNotFound: (id: string) => `Survey draft not found (draftId=${id}). Please recreate from /create.`,
    frontmatterParseFailed: (err: string) => `Failed to parse frontmatter: ${err}`,
    unknownError: 'Unknown error',
    errKeySetupFailed: 'Key setup failed',
    errEncryptFailed: 'Encryption failed',
    errHashCalcFailed: 'Hash calculation failed',
    errDryRunFailed: (raw: string) => `Pre-flight check failed: ${raw}`,
    errUnknownMoveError: 'Unknown Move error',
    errTxOnchainFailed: (raw: string) => `Transaction failed on-chain: ${raw}`,
    errCannotFetchTx: 'Cannot retrieve transaction information from node',
    errCannotExtractVaultId: 'Transaction succeeded but vault_id could not be extracted',
    errQueryTxFailed: 'Failed to query transaction result',
    title: 'Preview and Publish Survey',
    desc: 'Please confirm the survey response interface here and complete on-chain funding and publishing.',
    previewTitle: 'Survey Preview',
    readOnly: 'Read-only',
    questionNum: (n: number) => `Question ${n}`,
    required: 'Required',
    textPlaceholder: 'Respondent text input preview...',
    rewardSettings: 'Reward and Publishing Settings',
    perResponseLabel: 'First-time reward:',
    maxResponsesLabel: 'Max responses:',
    unitCopies: 'entries',
    repeatRewardLabel: 'Repeat reward:',
    timesPerPerson: 'times/person',
    totalRewardLabel: 'Total reward:',
    platformFeeLabel: (pct: string) => `Platform fee (${pct}):`,
    calculating: 'Calculating...',
    estimatedTotal: 'Estimated Total',
    withSlippage: 'Includes 1% slippage',
    fundFlow: 'Fund Distribution',
    flow1Title: '1. SSR Offset',
    flow1Desc: 'Prioritize SSR already held',
    flow2Title: '2. Platform Fee',
    flow2Desc: 'Added on top of the max total reward',
    flow3Title: '3. Mint SSR Difference',
    flow3Desc: 'Mint from AMM using SUI',
    encryptSurvey: 'Encrypt Blank Survey',
    encryptSurveyDesc: 'Encrypt questions in the survey to avoid prematurely revealing business strategies.',
    btnBack: '← Back: Edit Survey',
    keySigningBtn: 'Setting up encryption key...',
    keyReadyBtn: 'Encryption key ready',
    setupKeyBtn: 'Generate response encryption key',
    submittingBtn: 'Publishing, please sign in wallet...',
    successBtn: 'Published successfully!',
    publishBtn: 'Fund and Publish Survey',
    connectWalletPrompt: 'Please click the button in the top-right to connect your Sui wallet to begin key setup and transaction publishing.',
  },
}

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
  const { lang } = useLanguage()
  const t = content[lang]

  const typeLabel = (type: QuestionType): string => {
    switch (type) {
      case 'single_choice': return t.typeSingleChoice
      case 'multi_choice': return t.typeMultiChoice
      case 'text': return t.typeText
      case 'scale': return t.typeScale
      default: return type
    }
  }

  const [draft, setDraft] = useState<DraftEntry | null>(() => readDraft(draftId))

  useEffect(() => {
    setDraft(readDraft(draftId))
  }, [draftId])

  const frontmatter = useMemo(() => (draft ? parseFrontmatter(draft.contentMd) : null), [draft])

  const { data: poolData } = useSuiClientQuery(
    'getObject',
    { id: POOL_ID, options: { showContent: true } },
    { enabled: !!POOL_ID }
  )

  const { data: coinsData } = useSuiClientQuery(
    'getCoins',
    {
      owner: account?.address ?? '',
      coinType: `${PACKAGE_ID}::stacked_survey_reward::STACKED_SURVEY_REWARD`,
    },
    { enabled: !!account && !!PACKAGE_ID }
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
      repeatReward: BigInt(frontmatter.data.repeatReward),
      repeatMaxTimes: frontmatter.data.repeatMaxTimes,
      maxResponses: frontmatter.data.maxResponses,
      totalSuiInvested,
      feeConfig,
      creatorSsrBalance,
    })
  }, [frontmatter, totalSuiInvested, feeConfig, creatorSsrBalance])

  const suiToSpend = cost ? (cost.suiToInvest * SLIPPAGE_NUMER) / SLIPPAGE_DENOM : null

  const [keypair, setKeypair] = useState<CreatorKeyPair | null>(null)
  const [status, setStatus] = useState<
    'idle' | 'key-signing' | 'key-ready' | 'tx-signing' | 'submitting' | 'success' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [encrypt, setEncrypt] = useState(false)

  useEffect(() => {
    if (draft) {
      setEncrypt(!!draft.encrypt)
    }
  }, [draft])

  const fullSurvey = useMemo(() => {
    if (!draft) return null
    const parsed = parseFullSurveyMarkdown(draft.contentMd)
    return parsed.ok ? parsed.data : null
  }, [draft])

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
        <h1 className="text-3xl font-bold mb-4">{t.pageTitle}</h1>
        <p className="text-red-600">
          {t.draftNotFound(draftId ?? '?')}
        </p>
      </main>
    )
  }

  if (!frontmatter?.ok) {
    return (
      <main className="min-h-screen p-8 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">{t.pageTitle}</h1>
        <p className="text-red-600">{t.frontmatterParseFailed(frontmatter?.error ?? t.unknownError)}</p>
      </main>
    )
  }

  const params = frontmatter.data
  const baseSsr = params.perResponse * params.maxResponses
  const repeatSsr = params.repeatReward * params.maxResponses * params.repeatMaxTimes
  const totalSsr = baseSsr + repeatSsr

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
      setErrorMsg(err instanceof Error ? err.message : t.errKeySetupFailed)
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
      setErrorMsg(err instanceof Error ? err.message : t.errEncryptFailed)
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
      setErrorMsg(t.errHashCalcFailed)
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
        repeatReward: BigInt(params.repeatReward),
        repeatMaxTimes: params.repeatMaxTimes,
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
        ; (dryRunTx as any).setSender(account.address)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dryRunBytes = await (dryRunTx as any).build({ client: suiClient })
      const dryRunResult = await suiClient.dryRunTransactionBlock({
        transactionBlock: dryRunBytes,
      })
      if (dryRunResult.effects.status.status === 'failure') {
        const rawErr = dryRunResult.effects.status.error ?? t.unknownError
        const friendly = translateMoveAbort(rawErr)
        setErrorMsg(friendly ?? t.errDryRunFailed(rawErr))
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
                console.warn(
                  '[FundPage] waitForTransaction timed out, falling back to getTransactionBlock',
                  e
                )
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
              throw new Error(t.errCannotFetchTx)
            }

            if (
              txResult.effects &&
              txResult.effects.status &&
              txResult.effects.status.status === 'failure'
            ) {
              const rawErr = txResult.effects.status.error || t.errUnknownMoveError
              const friendly = translateMoveAbort(rawErr)
              throw new Error(friendly ?? t.errTxOnchainFailed(rawErr))
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
                console.log(
                  '[FundPage] Successfully extracted vaultId and surveyId from events:',
                  vaultId,
                  surveyId
                )
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
              setErrorMsg(t.errCannotExtractVaultId)
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
                })
              )
            }
            window.localStorage.removeItem(`${DRAFT_KEY_PREFIX}${draftId}`)

            const fragment = contentKey.length > 0 ? bytesToBase64url(contentKey) : ''
            setStatus('success')
            navigate(`/dashboard/${vaultId}${fragment ? `#${fragment}` : ''}`)
          } catch (err: any) {
            console.error('E2E Debug: onSuccess query error:', err)
            setErrorMsg(err.message || t.errQueryTxFailed)
            setStatus('error')
          }
        },
        onError: (err) => {
          console.error('E2E Debug: handleFund signAndExecute onError:', err)
          const friendly = translateMoveAbort(err.message)
          setErrorMsg(friendly ?? err.message)
          setStatus('error')
        },
      }
    )
  }

  const sui = (mist: bigint) => (Number(mist) / 1e9).toFixed(4)
  const ssr = (base: bigint) => formatSsr(base)

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800/80 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn transition-colors">
        {/* 頂部標題 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-slate-100 dark:border-neutral-800">
          <div className="space-y-1">
            <h1 className="text-h1 flex items-center gap-2">
              {t.title}
            </h1>
            <p className="text-muted text-base">
              {t.desc}
            </p>
          </div>
        </div>

        {/* 1. 仿真填答者視角預覽 */}
        {fullSurvey && fullSurvey.questions && (
          <section className="border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 bg-slate-50/50 dark:bg-neutral-900/20 shadow-sm space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-neutral-800 pb-2.5">
              <h2 className="text-h3 flex items-center gap-1.5">
                {t.previewTitle}
              </h2>
              <span className="text-sm font-normal px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                {t.readOnly}
              </span>
            </div>

            <div className="space-y-5 max-h-[400px] overflow-y-auto pr-2">
              <div className="space-y-3 bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-slate-100 dark:border-neutral-800/80 shadow-sm">
                <h3 className="text-h2 text-slate-800 dark:text-white">{fullSurvey.title}</h3>
                {fullSurvey.description && (
                  <div
                    className="prose max-w-none text-sm text-slate-600 dark:text-neutral-350 leading-relaxed border-t border-slate-100 dark:border-neutral-800/80 pt-3 mt-1 font-normal"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(fullSurvey.description) }}
                  />
                )}
              </div>

              {fullSurvey.questions.map((q: any, i: number) => (
                <div
                  key={q.id}
                  className="bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800/80 rounded-2xl p-5 space-y-4 shadow-sm hover:bg-slate-50/30 dark:hover:bg-neutral-850/30 transition-colors"
                >
                  <div className="flex items-center justify-between border-b pb-2 border-slate-200/60 dark:border-neutral-800/80">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-normal transition-colors ${q.required ? 'text-rose-800 dark:text-rose-400' : 'text-slate-700 dark:text-neutral-300'}`}>
                        {t.questionNum(i + 1)}
                      </span>
                      {q.required && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-normal bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400">
                          {t.required}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-normal px-2 py-0.5 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 rounded-full">
                      {typeLabel(q.type as QuestionType)}
                    </span>
                  </div>

                  <p className="text-base font-normal text-slate-800 dark:text-white">{q.prompt}</p>

                  {/* 題型渲染 */}
                  {q.type === 'single_choice' && q.options_json && (
                    <div className="space-y-2 pt-1">
                      {q.options_json.map((opt: string, oi: number) => (
                        <label
                          key={oi}
                          className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-neutral-300 font-normal cursor-not-allowed bg-slate-50/50 dark:bg-neutral-950/20 border border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-950/30 rounded-xl px-3.5 py-2 transition-colors w-full"
                        >
                          <input
                            type="radio"
                            name={`preview-single-${q.id}`}
                            disabled
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-neutral-800 dark:border-neutral-700 transition-colors"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === 'multi_choice' && q.options_json && (
                    <div className="space-y-2 pt-1">
                      {q.options_json.map((opt: string, oi: number) => (
                        <label
                          key={oi}
                          className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-neutral-300 font-normal cursor-not-allowed bg-slate-50/50 dark:bg-neutral-950/20 border border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-950/30 rounded-xl px-3.5 py-2 transition-colors w-full"
                        >
                          <input
                            type="checkbox"
                            disabled
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-neutral-800 dark:border-neutral-700 rounded transition-colors"
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
                      className="form-input bg-slate-50/50 dark:bg-neutral-950/20 cursor-not-allowed font-mono"
                      placeholder={t.textPlaceholder}
                    />
                  )}

                  {q.type === 'scale' && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <label
                          key={val}
                          className="flex flex-col items-center justify-center gap-1.5 cursor-not-allowed bg-slate-50/50 dark:bg-neutral-950/20 border border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-950/30 rounded-xl p-3 w-12 h-14 transition-colors"
                        >
                          <span className="text-xs font-normal text-slate-400 dark:text-neutral-450">{val}</span>
                          <input
                            type="radio"
                            name={`preview-scale-${q.id}`}
                            disabled
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-neutral-800 dark:border-neutral-700 transition-colors"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. 費用估計與資金明細 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 左：預估與手續費摘要 */}
          <section className="bg-slate-50/50 dark:bg-neutral-950/30 border border-slate-100 dark:border-neutral-850 rounded-2xl p-5 space-y-2 shadow-sm transition-colors">
            <h2 className="text-h3 border-b pb-2 border-slate-100 dark:border-neutral-800">
              {t.rewardSettings}
            </h2>
            <div className="space-y-2 text-base">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-neutral-400 font-normal">{t.perResponseLabel}</span>
                <span className="font-normal text-slate-700 dark:text-neutral-200">{params.perResponse} SSR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-neutral-400 font-normal">{t.maxResponsesLabel}</span>
                <span className="font-normal text-slate-700 dark:text-neutral-200">{params.maxResponses} {t.unitCopies}</span>
              </div>
              {params.repeatReward > 0 && (
                <>
                  <div className="flex justify-between border-t border-slate-100 dark:border-neutral-800 mt-1 pt-1">
                    <span className="text-slate-600 dark:text-neutral-400 font-normal">{t.repeatRewardLabel}</span>
                    <span className="font-normal text-slate-700 dark:text-neutral-200">
                      {params.repeatReward} SSR × {params.repeatMaxTimes} {t.timesPerPerson}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-slate-200 dark:border-neutral-800 pt-2.5">
                <span className="text-slate-600 dark:text-neutral-350 font-normal">{t.totalRewardLabel}</span>
                <span className="font-normal text-slate-800 dark:text-neutral-100">{totalSsr} SSR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-neutral-400 font-normal">
                  {t.platformFeeLabel(cost ? `${Number(cost.effectiveFeeBps) / 100}%` : t.calculating)}
                </span>
                <span className="font-normal text-slate-800 dark:text-white" aria-label="platform-fee">
                  {cost
                    ? `${ssr((cost.grossSsrBase * cost.effectiveFeeBps) / 10000n)} SSR`
                    : t.calculating}
                </span>
              </div>

              {/* 大字突出：最終估算 SUI 消耗 */}
              <div className="bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl p-3 mt-4 flex justify-between items-center shadow-md">
                <div className="flex flex-col">
                  <span className="text-base font-normal opacity-90">{t.estimatedTotal}</span>
                  <span className="text-sm opacity-70">{t.withSlippage}</span>
                </div>
                <span className="text-xl font-normal font-mono" aria-label="estimated-sui-cost">
                  {suiToSpend ? `${sui(suiToSpend)} SUI` : t.calculating}
                </span>
              </div>
            </div>
          </section>

          {/* 右：詳細資金分拆流向 */}
          {cost && (
            <section className="bg-white dark:bg-neutral-950/20 border border-slate-100 dark:border-neutral-850 rounded-2xl p-5 space-y-4 shadow-sm text-sm transition-colors">
              <h2 className="text-h3 border-b pb-2 border-slate-100 dark:border-neutral-800">
                {t.fundFlow}
              </h2>
              <div className="space-y-2 pt-1">
                <div className="flex flex-col gap-1">
                  <div className="text-base flex justify-between font-normal text-slate-800 dark:text-neutral-200">
                    <span>{t.flow1Title}</span>
                    <span className="font-mono text-slate-900 dark:text-white font-normal">{ssr(cost.offsetIn)} SSR</span>
                  </div>
                  <span className="text-sm text-slate-500 dark:text-neutral-450">
                    {t.flow1Desc}
                  </span>
                </div>

                <div className="text-base flex justify-between font-normal text-slate-800 dark:text-neutral-200 border-t border-slate-100 dark:border-neutral-800 pt-3">
                  <div className="flex flex-col gap-1">
                    <span>{t.flow2Title}</span>
                    <span className="text-sm text-slate-500 dark:text-neutral-455 font-normal">
                      {t.flow2Desc}
                    </span>
                  </div>
                  <span className="font-mono text-slate-900 dark:text-white font-normal">
                    {ssr((cost.grossSsrBase * cost.effectiveFeeBps) / 10000n)} SSR
                  </span>
                </div>

                <div className="text-base flex justify-between font-normal text-slate-800 dark:text-neutral-200 border-t border-slate-100 dark:border-neutral-800 pt-3">
                  <div className="flex flex-col gap-1">
                    <span>{t.flow3Title}</span>
                    <span className="text-sm text-slate-500 dark:text-neutral-455 font-normal">
                      {t.flow3Desc}
                    </span>
                  </div>
                  <span className="font-mono text-slate-900 dark:text-white font-normal">{ssr(cost.minted)} SSR</span>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* 3. 加密安全開關 */}
        <section className="bg-slate-50/50 dark:bg-neutral-950/30 border border-slate-100 dark:border-neutral-850 rounded-2xl p-5 flex items-start gap-3.5 animate-fadeIn transition-colors">
          <input
            id="encrypt-survey"
            type="checkbox"
            checked={encrypt}
            onChange={(e) => setEncrypt(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600 dark:bg-neutral-800 dark:border-neutral-700 transition-colors"
          />
          <div
            className="flex flex-col cursor-pointer select-none gap-0.5"
            onClick={() => setEncrypt(!encrypt)}
          >
            <label
              htmlFor="encrypt-survey"
              className="text-base font-normal text-slate-800 dark:text-neutral-200 cursor-pointer"
            >
              {t.encryptSurvey}
            </label>
            <span className="text-sm text-slate-500 dark:text-neutral-400 font-normal">
              {t.encryptSurveyDesc}
            </span>
          </div>
        </section>

        {/* 4. 發布操作 */}
        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-neutral-800 animate-fadeIn">
          {errorMsg && (
            <div
              role="alert"
              className="alert-error break-all flex items-center gap-1.5"
            >
              <AlertTriangle size={14} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {account ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => navigate(`/create/${draftId}`)}
                className="btn-outline w-full sm:w-1/3 flex items-center justify-center gap-2 py-3"
              >
                {t.btnBack}
              </button>
              <div className="w-full sm:w-2/3 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleSetupKey}
                  disabled={!!keypair || status === 'key-signing'}
                  className="btn-secondary w-full flex items-center justify-center gap-2 py-3"
                >
                  {status === 'key-signing'
                    ? t.keySigningBtn
                    : keypair
                      ? t.keyReadyBtn
                      : t.setupKeyBtn}
                </button>
                <button
                  type="button"
                  onClick={handleFund}
                  disabled={
                    !keypair ||
                    !suiToSpend ||
                    status === 'tx-signing' ||
                    status === 'submitting' ||
                    status === 'success'
                  }
                  className="btn-primary w-full flex items-center justify-center gap-1.5 py-3"
                >
                  {status === 'tx-signing' || status === 'submitting'
                    ? t.submittingBtn
                    : status === 'success'
                      ? t.successBtn
                      : t.publishBtn}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl shadow-inner transition-colors">
              <p className="text-sm font-normal text-amber-800 dark:text-amber-400">
                {t.connectWalletPrompt}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
