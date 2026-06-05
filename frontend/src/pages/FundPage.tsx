import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Info } from 'lucide-react'
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { parseFrontmatter, parseFullSurveyMarkdown, serializeFullSurveyToMarkdown, type QuestionType } from '../lib/frontmatter'
import { renderMarkdown } from '../lib/markdown'
import {
  buildCreateSurveyPtb,
  estimateFundCostV2,
  extractSurveyIdFromEffects,
  extractVaultIdFromEffects,
} from '../lib/ptb'
import { formatSsr, formatSui, formatFullPrecision } from '../lib/format'
import {
  KEY_DERIVE_MSG,
  buildCreatorPubKey,
  bytesToBase64url,
  deriveCreatorKeyPair,
  encryptSurveyContent,
  buildPublicContentBlob,
  type CreatorKeyPair,
} from '../lib/crypto'
import { translateMoveAbort } from '../lib/moveAbort'
import { useT } from '../i18n'
import { probeGasSponsorHealth, type GasHealth } from '../lib/sponsoredTx'
import { uploadToDecentralizedStorage } from '../lib/storage'

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
  const t = useT('fund')

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

  const currentRate = useMemo(() => {
    const decay = 1_000_000_000_000n
    const initialSsrPerSui = 1000n
    const numer = Number(initialSsrPerSui * decay)
    const denom = Number(decay + totalSuiInvested)
    return numer / denom
  }, [totalSuiInvested])

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

  const [gasHealth, setGasHealth] = useState<GasHealth | null>(null)

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BFF_URL ?? ''
    void probeGasSponsorHealth({ backendUrl }).then((res) => {
      setGasHealth(res)
    })
  }, [])

  const gasCompensationAmount = useMemo(() => {
    if (!gasHealth?.available) return 0n
    return BigInt(gasHealth.gasCompensationAmount ?? '0')
  }, [gasHealth])

  const storageCompensationAmountMIST = useMemo(() => {
    if (!frontmatter?.ok) return 0n
    const amount = frontmatter.data.storageCompensationAmount ?? 0.01
    return BigInt(Math.round(amount * 1_000_000_000))
  }, [frontmatter])

  const requiredGas = useMemo(() => {
    if (!frontmatter?.ok) return 0n
    const params = frontmatter.data
    const premiumFeeMIST = BigInt(params.premiumFee ?? 0)
    const perResponseSui = gasCompensationAmount + storageCompensationAmountMIST + premiumFeeMIST
    if (perResponseSui === 0n) return 0n
    const repeatMaxTimes = BigInt(params.repeatMaxTimes ?? 1)
    if (params.repeatReward > 0) {
      return BigInt(params.maxResponses) * (1n + repeatMaxTimes) * perResponseSui
    } else {
      return BigInt(params.maxResponses) * perResponseSui
    }
  }, [frontmatter, gasCompensationAmount, storageCompensationAmountMIST])

  const SURVEY_SIZE_THRESHOLD_KB = Number(import.meta.env.VITE_SURVEY_SIZE_THRESHOLD_KB || '10')

  const requiredStorageFund = 0n

  const totalSuiToSpend = suiToSpend != null ? suiToSpend + requiredGas : null

  const [keypair, setKeypair] = useState<CreatorKeyPair | null>(null)
  const [surveySalt] = useState(() => crypto.getRandomValues(new Uint8Array(32)))
  const [status, setStatus] = useState<
    'idle' | 'key-signing' | 'key-ready' | 'uploading' | 'tx-signing' | 'submitting' | 'success' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [encrypt, setEncrypt] = useState(false)
  const [encryptAnswers, setEncryptAnswers] = useState(true)

  useEffect(() => {
    if (draft) {
      setEncrypt(!!draft.encrypt)
      const parsed = parseFullSurveyMarkdown(draft.contentMd)
      if (parsed.ok) {
        setEncryptAnswers(parsed.data.encryptAnswers !== false)
      }
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
        <h1 className="text-h1 mb-4">{t.pageTitle}</h1>
        <p className="text-red-600">
          {t.draftNotFound(draftId ?? '?')}
        </p>
      </main>
    )
  }

  if (!frontmatter?.ok) {
    return (
      <main className="min-h-screen p-8 max-w-xl mx-auto">
        <h1 className="text-h1 mb-4">{t.pageTitle}</h1>
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
      const kp = await deriveCreatorKeyPair(base64ToBytes(signature), surveySalt)
      setKeypair(kp)
      setStatus('key-ready')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.errKeySetupFailed)
      setStatus('error')
    }
  }

  async function handleFund() {
    const actualEncryptAnswers = encrypt ? true : encryptAnswers
    const isKeyRequired = encrypt || actualEncryptAnswers

    if (!account || !cost || suiToSpend == null || !draft) return
    if (isKeyRequired && !keypair) return

    setStatus('tx-signing')
    setErrorMsg(null)

    // 32B X25519 pubkey embedded in the content blob header (identification only).
    const creatorPublicKeyBytes = isKeyRequired && keypair
      ? keypair.x25519PublicKeyBytes
      : new Uint8Array(32) // 32-byte dummy key for non-encrypted surveys
    // Hybrid (X25519 + ML-KEM-768) pubkey published on-chain for answer encryption.
    const creatorPubKeyForChain = isKeyRequired && keypair
      ? buildCreatorPubKey(keypair, surveySalt)
      : new Uint8Array(32) // dummy for non-encrypted surveys (answers never encrypted)
    let contentKey: Uint8Array
    let encryptedBlob: Uint8Array

    // 1. 解析 draft.contentMd，更新 encryptAnswers 並重新序列化
    let contentMdUpdated = draft.contentMd
    try {
      const parsed = parseFullSurveyMarkdown(draft.contentMd)
      if (!parsed.ok) {
        setErrorMsg(parsed.error)
        setStatus('error')
        return
      }
      parsed.data.encryptAnswers = actualEncryptAnswers
      contentMdUpdated = serializeFullSurveyToMarkdown(parsed.data, {
        draftStamp: new Date().toISOString()
      })
    } catch (err) {
      console.error('Failed to update draft markdown frontmatter:', err)
      setErrorMsg('更新問卷 frontmatter 失敗')
      setStatus('error')
      return
    }

    try {
      const shouldEncrypt = encrypt
      if (shouldEncrypt) {
        const enc = await encryptSurveyContent(contentMdUpdated, creatorPublicKeyBytes)
        encryptedBlob = enc.encryptedBlob
        contentKey = enc.contentKey
      } else {
        // 公開問卷：使用 buildPublicContentBlob 產生首 Byte 為 0x00 的明文 Blob
        encryptedBlob = buildPublicContentBlob(contentMdUpdated)
        contentKey = new Uint8Array(0)
      }
    } catch (err) {
      console.error('E2E Debug: handleFund encryption catch:', err)
      setErrorMsg(err instanceof Error ? err.message : t.errEncryptFailed)
      setStatus('error')
      return
    }

    const fullSurvey = parseFullSurveyMarkdown(contentMdUpdated)
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
      contentHash = await sha256(contentMdUpdated) // Use updated markdown
      const schemaStr = JSON.stringify(fullSurvey.data.questions || [])
      schemaHash = await sha256(schemaStr)
    } catch (err) {
      console.error('E2E Debug: handleFund hash calculation catch:', err)
      setErrorMsg(t.errHashCalcFailed)
      setStatus('error')
      return
    }

    let surveyBlobId: Uint8Array | undefined = undefined
    let surveyBlobIdStr = ''
    if (encryptedBlob.length > SURVEY_SIZE_THRESHOLD_KB * 1024) {
      setStatus('uploading')
      try {
        const uploadRes = await uploadToDecentralizedStorage(encryptedBlob)
        surveyBlobIdStr = uploadRes.blobId
        surveyBlobId = new TextEncoder().encode(uploadRes.blobId)
      } catch (err) {
        console.error('[FundPage] Decentralized upload failed:', err)
        setErrorMsg(t.errUploadFailed)
        setStatus('error')
        return
      }
    }

    setStatus('tx-signing')

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
        encryptedContent: surveyBlobId ? new Uint8Array(0) : encryptedBlob,
        suiToSpend,
        contentHash,
        schemaHash,
        creatorPubKey: creatorPubKeyForChain,
        questions: fullSurvey.data.questions,
        allowedSources: fullSurvey.data.allowedSources,
        offsetIn: cost.offsetIn,
        creatorSsrCoins: ssrCoins,
        sponsorAddress: gasHealth?.sponsorAddress,
        gasCompensationAmount,
        surveyBlobId,
        storageCompensationAmount: storageCompensationAmountMIST,
        requiredStorageFund,
        premiumFee: params.premiumFee ? BigInt(params.premiumFee) : 0n,
        allowedNftType: params.allowedNftType || undefined,
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
              if (surveyBlobIdStr) {
                try {
                  const bffUrl = import.meta.env.VITE_BFF_URL || 'http://localhost:3100'
                  await fetch(`${bffUrl}/api/cache/survey`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ surveyId, blobId: surveyBlobIdStr })
                  })
                } catch (e) {
                  console.warn('Failed to notify BFF to cache survey:', e)
                }
              }
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

  const sui = (mist: bigint) => formatSui(mist)
  const ssr = (base: bigint) => formatSsr(base)

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto">
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

            <div className="space-y-5 max-h-[400px] overflow-y-auto pr-1">
              <div className="space-y-3 bg-white dark:bg-neutral-900 p-5 rounded-2xl border border-slate-100 dark:border-neutral-800/80 shadow-sm">
                <h3 className="text-h2 text-slate-800 dark:text-white">{fullSurvey.title}</h3>
                {fullSurvey.description && (
                  <div
                    className="prose max-w-none text-sm text-slate-600 dark:text-neutral-400 leading-relaxed border-t border-slate-100 dark:border-neutral-800/80 pt-3 mt-1 font-normal"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(fullSurvey.description) }}
                  />
                )}
              </div>

              {fullSurvey.questions.map((q: any, i: number) => (
                <div
                  key={q.id}
                  className="bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800/80 rounded-2xl p-5 space-y-4 shadow-sm hover:bg-slate-50/30 dark:hover:bg-neutral-800/30 transition-colors"
                >
                  <div className="flex items-center justify-between border-b pb-2 border-slate-200/60 dark:border-neutral-800/80">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-normal transition-colors ${q.required ? 'text-rose-800 dark:text-rose-400' : 'text-slate-700 dark:text-neutral-300'}`}>
                        {t.questionNum(i + 1)}
                      </span>
                      <span className={q.required ? 'chip-required' : 'chip-optional'}>
                        {q.required ? t.required : t.optional}
                      </span>
                    </div>
                    <span className="chip-optional shrink-0">
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
                            className="radio-dark"
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
                            className="checkbox-dark checked:bg-blue-600 checked:border-blue-600"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === 'text' && (
                    <div className="space-y-1.5">
                      <textarea
                        disabled
                        rows={2}
                        className="form-input bg-slate-50/50 dark:bg-neutral-950/20 cursor-not-allowed font-mono"
                        placeholder={t.textPlaceholder}
                      />
                      {q.maxLen !== undefined && (
                        <div className="text-xs font-semibold text-slate-400 dark:text-neutral-500 px-1 select-none text-right">
                          {t.charLimit(q.maxLen)}
                        </div>
                      )}
                    </div>
                  )}

                  {q.type === 'scale' && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <label
                          key={val}
                          className="flex flex-col items-center justify-center gap-1.5 cursor-not-allowed bg-slate-50/50 dark:bg-neutral-950/20 border border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-950/30 rounded-xl p-3 w-12 h-14 transition-colors"
                        >
                          <span className="text-xs font-normal text-slate-400 dark:text-neutral-500">{val}</span>
                          <input
                            type="radio"
                            name={`preview-scale-${q.id}`}
                            disabled
                            className="radio-dark"
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

        {/* 2. 問卷規則參數資訊條 */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-neutral-400 bg-slate-50/60 dark:bg-neutral-950/20 rounded-2xl p-4 border border-slate-100 dark:border-neutral-800/80 transition-colors">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-500 dark:text-neutral-500">{t.perResponseLabel}</span>
            <span className="font-semibold text-slate-800 dark:text-neutral-200">{params.perResponse} SSR</span>
          </div>
          <div className="h-4 w-px bg-slate-200 dark:bg-neutral-800 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-slate-500 dark:text-neutral-500">{t.maxResponsesLabel}</span>
            <span className="font-semibold text-slate-800 dark:text-neutral-200">{params.maxResponses} {t.unitCopies}</span>
          </div>
          {params.repeatReward > 0 && (
            <>
              <div className="h-4 w-px bg-slate-200 dark:bg-neutral-800 hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-500 dark:text-neutral-500">{t.repeatRewardLabel}</span>
                <span className="font-semibold text-slate-800 dark:text-neutral-200">{params.repeatReward} SSR ({params.repeatMaxTimes} {t.timesPerPerson})</span>
              </div>
            </>
          )}
        </div>

        {/* 3. 費用估計與資金明細 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 左：問卷規則與預算 */}
          <section className="bg-slate-50/50 dark:bg-neutral-950/30 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 space-y-4 shadow-sm transition-colors text-sm">
            <h2 className="text-h3 border-b pb-2 border-slate-100 dark:border-neutral-800">
              {t.rewardSettings}
            </h2>
            <div className="space-y-2.5 pt-1">
              <div className="flex justify-between text-base">
                <span className="text-slate-600 dark:text-neutral-400 font-normal">{t.totalRewardLabel}</span>
                <span className="font-semibold text-slate-800 dark:text-neutral-200 tabular-nums">
                  {totalSsr} <span className="text-sm font-normal text-slate-500 dark:text-neutral-400">SSR</span>
                </span>
              </div>
              <div className="flex justify-between text-base">
                <span className="text-slate-600 dark:text-neutral-400 font-normal">
                  {t.platformFeeLabel}
                  {cost && (
                    <span className="text-xs text-slate-400 dark:text-neutral-500 ml-1">
                      ({Number(cost.effectiveFeeBps) / 100}%)
                    </span>
                  )}
                </span>
                <span
                  className="font-semibold text-slate-800 dark:text-white tabular-nums"
                  aria-label="platform-fee"
                  title={cost ? `${formatFullPrecision((cost.grossSsrBase * cost.effectiveFeeBps) / 10000n)} SSR` : undefined}
                >
                  {cost ? (
                    <>
                      {ssr((cost.grossSsrBase * cost.effectiveFeeBps) / 10000n)} <span className="text-sm font-normal text-slate-500 dark:text-neutral-400">SSR</span>
                    </>
                  ) : (
                    t.calculating
                  )}
                </span>
              </div>

              <div className="flex justify-between border-t border-slate-200 dark:border-neutral-800 pt-2.5 font-medium text-base">
                <span className="text-slate-700 dark:text-neutral-200">{t.totalSsrRequiredLabel}</span>
                <span className="font-semibold text-slate-800 dark:text-neutral-200 tabular-nums" title={cost ? `${formatFullPrecision(cost.grossSsrBase)} SSR` : undefined}>
                  {cost ? `${ssr(cost.grossSsrBase)} SSR` : t.calculating}
                </span>
              </div>
              <div className="flex justify-between text-base">
                <span className="text-slate-600 dark:text-neutral-400 font-normal">{t.ssrOffsetLabel}</span>
                <span className="font-semibold text-slate-700 dark:text-neutral-300 tabular-nums" title={cost ? `${formatFullPrecision(cost.offsetIn)} SSR` : undefined}>
                  {cost ? `-${ssr(cost.offsetIn)} SSR` : t.calculating}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-neutral-800 pt-2.5 font-medium text-base">
                <span className="text-slate-700 dark:text-neutral-200">{t.newMintSsrLabel}</span>
                <span className="font-bold text-blue-700 dark:text-blue-400 tabular-nums" title={cost ? `${formatFullPrecision(cost.minted)} SSR` : undefined}>
                  {cost ? `${ssr(cost.minted)} SSR` : t.calculating}
                </span>
              </div>
            </div>
          </section>

          {/* 右：支付與資金流向 */}
          <section className="bg-white dark:bg-neutral-950/20 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 space-y-4 shadow-sm text-sm transition-colors flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-h3 border-b pb-2 border-slate-100 dark:border-neutral-800">
                {t.fundFlow}
              </h2>

              {/* Part 2: SUI Payments */}
              <div className="space-y-2">
                <div className="flex justify-between text-slate-600 dark:text-neutral-400">
                  <div className="flex items-center gap-1">
                    <div className="flex flex-col">
                      <span>{t.mintSuiCostLabel}</span>
                      <span className="text-xs text-slate-400 dark:text-neutral-500">
                        ({t.withSlippage})
                      </span>
                    </div>
                    <div className="group relative inline-block self-start mt-1">
                      <Info size={13} className="text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 cursor-pointer" />
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white dark:bg-neutral-800 dark:text-neutral-100 text-xs rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed font-normal">
                        <p className="font-semibold">{t.exchangeRateLabel} 1 SUI ≈ {currentRate.toFixed(2)} SSR</p>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-neutral-800" />
                      </div>
                    </div>
                  </div>
                  <span className="font-semibold text-slate-700 dark:text-neutral-300" title={suiToSpend !== null ? `${formatFullPrecision(suiToSpend)} SUI` : undefined}>
                    {suiToSpend !== null ? `${sui(suiToSpend)} SUI` : t.calculating}
                  </span>
                </div>

                {requiredGas > 0n && (
                  <div className="flex justify-between items-center text-slate-600 dark:text-neutral-400">
                    <div className="flex items-center gap-1">
                      <span>{t.prefundTotalLabel}</span>
                      <div className="group relative inline-block">
                        <Info size={13} className="text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 cursor-pointer" />
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 p-3 bg-slate-900 text-white dark:bg-neutral-800 dark:text-neutral-100 text-xs rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed font-normal">
                          {t.prefundTooltip}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-neutral-800" />
                        </div>
                      </div>
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-neutral-300" title={`${formatFullPrecision(requiredGas)} SUI`}>
                      {sui(requiredGas)} SUI
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Part 3: Total Card */}
            {(() => {
              const fullyOffset = cost != null && totalSuiToSpend != null && totalSuiToSpend === 0n
              const cardClass = fullyOffset
                ? 'bg-gradient-to-r from-emerald-700 to-emerald-600 dark:from-teal-950 dark:to-teal-900 text-white rounded-xl p-3.5 mt-4 flex justify-between items-center shadow-md'
                : 'bg-gradient-to-r from-blue-900 to-indigo-800 text-white rounded-xl p-3.5 mt-4 flex justify-between items-center shadow-md'
              const title = t.estimatedTotal
              const subtitle = fullyOffset ? t.coveredBySsrSubtitle : t.withSlippage
              let mainValue: string
              let fullValue: string | undefined = undefined
              if (totalSuiToSpend == null) {
                mainValue = t.calculating
              } else if (fullyOffset) {
                mainValue = `${ssr(cost!.offsetIn)} SSR`
                fullValue = `${formatFullPrecision(cost!.offsetIn)} SSR`
              } else {
                mainValue = `${sui(totalSuiToSpend)} SUI`
                fullValue = `${formatFullPrecision(totalSuiToSpend)} SUI`
              }
              return (
                <div className={cardClass}>
                  <div className="flex flex-col min-w-0">
                    <span className="text-base font-normal opacity-90">{title}</span>
                    <span className="text-sm opacity-70">{subtitle}</span>
                  </div>
                  <span
                    className="text-xl font-normal font-mono whitespace-nowrap text-right shrink-0 ml-3"
                    aria-label="estimated-sui-cost"
                    title={fullValue}
                  >
                    {mainValue}
                  </span>
                </div>
              )
            })()}
          </section>
        </div>

        {/* 3. 加密安全開關 */}
        <section className="bg-slate-50/50 dark:bg-neutral-950/30 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 animate-fadeIn transition-colors flex flex-col sm:flex-row gap-6">
          <label className="inline-flex items-start gap-3.5 cursor-pointer select-none flex-1">
            <input
              id="encrypt-survey"
              type="checkbox"
              checked={encrypt}
              onChange={(e) => setEncrypt(e.target.checked)}
              className="checkbox-dark checked:bg-blue-600 checked:border-blue-600 mt-0.5 shrink-0"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-base text-slate-800 dark:text-neutral-200 font-semibold">
                {t.encryptSurvey}
              </span>
              <span className="text-sm text-slate-400 dark:text-neutral-400 font-normal leading-normal">
                {t.encryptSurveyDesc}
              </span>

            </div>
          </label>

          <div className="hidden sm:block border-l border-slate-200 dark:border-neutral-800/80 self-stretch my-1" />
          <div className="sm:hidden border-t border-slate-200 dark:border-neutral-800/80 my-1" />

          <label className="inline-flex items-start gap-3.5 cursor-pointer select-none flex-1">
            <input
              id="encrypt-answers"
              type="checkbox"
              checked={encrypt ? true : encryptAnswers}
              disabled={encrypt}
              onChange={(e) => setEncryptAnswers(e.target.checked)}
              className="checkbox-dark checked:bg-blue-600 checked:border-blue-600 mt-0.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-base text-slate-800 dark:text-neutral-200 font-semibold">
                {t.encryptAnswers}
              </span>
              <span className="text-sm text-slate-400 dark:text-neutral-400 font-normal leading-normal">
                {t.encryptAnswersDesc}
              </span>
            </div>
          </label>
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
                {(() => {
                  const isKeyRequired = encrypt || (encrypt ? true : encryptAnswers);
                  return (
                    <>
                      <button
                        type="button"
                        onClick={handleSetupKey}
                        disabled={!isKeyRequired || !!keypair || status === 'key-signing' || status === 'uploading'}
                        className={
                          !isKeyRequired
                            ? 'bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 font-normal px-5 rounded-xl border border-slate-200/60 dark:border-neutral-700/60 w-full flex items-center justify-center gap-2 py-3 cursor-not-allowed'
                            : keypair
                              ? 'bg-emerald-700/40 text-white dark:bg-emerald-800/40 dark:text-emerald-200 font-normal px-5 rounded-xl shadow-sm w-full flex items-center justify-center gap-2 py-3'
                              : 'btn-primary w-full flex items-center justify-center gap-2 py-3'
                        }
                      >
                        {!isKeyRequired
                          ? t.keyNotNeededBtn
                          : status === 'key-signing'
                            ? t.keySigningBtn
                            : keypair
                              ? t.keyReadyBtn
                              : t.setupKeyBtn}
                      </button>
                      <button
                        type="button"
                        onClick={handleFund}
                        disabled={
                          (isKeyRequired && !keypair) ||
                          suiToSpend == null ||
                          status === 'tx-signing' ||
                          status === 'submitting' ||
                          status === 'uploading' ||
                          status === 'success'
                        }
                        className="btn-primary w-full flex items-center justify-center gap-1.5 py-3"
                      >
                        {status === 'uploading'
                          ? t.uploadingShort
                          : status === 'tx-signing' || status === 'submitting'
                            ? t.submittingBtn
                            : status === 'success'
                              ? t.successBtn
                              : t.publishBtn}
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="text-center py-5 warning-box rounded-2xl shadow-inner flex flex-col items-center gap-1.5 justify-center">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-500" />
              <p className="text-sm">
                {t.connectWalletPrompt}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Glassmorphism progress overlay */}
      {status === 'uploading' && (
        <div className="glass-overlay">
          <div className="glass-card space-y-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <h3 className="text-lg font-medium text-slate-800 dark:text-neutral-200 animate-pulse">
              {t.uploadingSurvey}
            </h3>
            <p className="text-sm text-slate-500 dark:text-neutral-400">
              {t.pleaseWait}
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
