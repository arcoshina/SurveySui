import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, Globe, Zap, Info } from 'lucide-react'
import {
  ConnectButton,
  useCurrentWallet,
  useSuiClient,
  useSignPersonalMessage,
} from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { fromBase64 } from '@mysten/sui/utils'
import { PURGE_GRACE_MS } from '../lib/ptb'
import { useActiveSigner } from '../lib/useActiveSigner'
import {
  buildClaimPtb,
  buildClaimWithNftMarkingPtb,
  executeSponsoredTx,
  executeTxWithFallback,
  probeGasSponsorHealth,
  USER_DECLINED_SELF_PAID,
} from '../lib/sponsoredTx'
import { decryptSurveyContent, encryptAnswers, base64urlToBytes } from '../lib/crypto'
import { parseFullSurveyMarkdown, type QuestionType, sanitizeQuestionIds } from '../lib/frontmatter'
import { renderMarkdown } from '../lib/markdown'
import { encodeAnswers, computeSchemaHash, bytesToHex, normalizeBytes } from '../lib/answerCodec'
import { fetchActivePass, fetchPassCredentials, SurveyPassData } from '../lib/surveyPass'
import { translateMoveAbort } from '../lib/moveAbort'
import { useT } from '../i18n'
import { formatSui } from '../lib/format'
import { downloadFromDecentralizedStorage, uploadToDecentralizedStorage } from '../lib/storage'

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID ?? ''

function normalizeSuiId(id: string): string {
  if (!id) return ''
  let cleaned = id.toLowerCase().trim()
  if (cleaned.startsWith('0x')) {
    cleaned = cleaned.slice(2)
  }
  return cleaned.padStart(64, '0')
}

function getSliderBackground(valStr: string | string[] | undefined) {
  if (!valStr || Array.isArray(valStr)) return undefined
  const val = Number(valStr)
  const percent = ((val - 1) / 4) * 100
  return {
    background: `linear-gradient(to right, var(--slider-active) ${percent}%, var(--slider-inactive) ${percent}%)`
  }
}

interface Question {
  id: string
  type: QuestionType
  prompt: string
  options_json: string[] | null
  required: boolean
  maxLen?: number
  shuffle?: boolean
  shuffledOptions?: Array<{
    text: string
    originalIndex: number
  }>
}

interface Survey {
  id: string
  title: string
  description: string
  status: 'ACTIVE' | 'CLOSED'
  deadline: string
  per_response: number
  /** SSR for each repeat submission. 0 = repeats disabled. Read from vault. */
  repeat_reward: number
  /** Max repeats per address. Only meaningful when repeat_reward > 0. */
  repeat_max_times: number
  vaultObjectId: string // Add vaultObjectId for claiming
  questions: Question[]
  schemaHash: string
  encryptAnswers?: boolean
  isDecentralized?: boolean
  allowedNftType: string | null
}

type Answers = Record<string, string | string[] | number | number[]>
type Phase =
  | 'loading'
  | 'filling'
  | 'review'
  | 'submitting'
  | 'success'
  | 'error'
  | 'closed'

export default function SurveyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const ANSWERS_KEY = `surveysui:answers:${id ?? ''}`
  // 加密問卷的解密金鑰在網址 hash（/s/:id#key），導向 /auth 時必須一併帶上才能在返回後解密
  const goToAuth = () => {
    const here = `/s/${id ?? ''}${window.location.search}${window.location.hash}`
    navigate(`/auth?returnTo=${encodeURIComponent(here)}`)
  }
  const t = useT('survey')
  const purgeGraceDays = Math.max(1, Math.round(Number(PURGE_GRACE_MS) / 86_400_000))
  const typeLabel = (type: QuestionType): string => {
    switch (type) {
      case 'single_choice': return t.typeSingleChoice
      case 'multi_choice': return t.typeMultiChoice
      case 'text': return t.typeText
      case 'scale': return t.typeScale
      default: return type
    }
  }
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [answers, setAnswers] = useState<Answers>({})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [creatorPubKey, setCreatorPubKey] = useState<Uint8Array | null>(null)
  const [surveyAllowedSources, setSurveyAllowedSources] = useState<number[]>([2])

  // Wallet & Client integration
  const { connectionStatus } = useCurrentWallet()
  const isWalletConnecting = connectionStatus === 'connecting'
  const suiClient = useSuiClient()
  const activeSigner = useActiveSigner()
  const { mutateAsync: signPersonalMessageAsync } = useSignPersonalMessage()
  const [selfPaidMode, setSelfPaidMode] = useState(false)
  const [isUploadingAnswer, setIsUploadingAnswer] = useState(false)
  const [gasMode, setGasMode] = useState<'unknown' | 'sponsored' | 'self_paid_warning' | 'limit_reached_warning'>('unknown')
  const [selfPaidConfirm, setSelfPaidConfirm] = useState<{
    estSui: string
    resolve: (ok: boolean) => void
    isLimitReached?: boolean
  } | null>(null)

  // SurveyPass SBT & Verification States
  const registryId =
    import.meta.env.VITE_NULLIFIER_REGISTRY_ID ?? import.meta.env.VITE_PASS_REGISTRY_ID ?? ''
  const configId = import.meta.env.VITE_ISSUER_CONFIG_ID ?? ''

  const [activePass, setActivePass] = useState<SurveyPassData | null>(null)
  const [passCredentials, setPassCredentials] = useState<any[]>([])
  const [isPassLoading, setIsPassLoading] = useState(true)

  /** How many times the connected wallet has already claimed for this survey. */
  const [myClaimCount, setMyClaimCount] = useState(0)

  // 弱匿名 (Weak KYC)
  const [ownedNfts, setOwnedNfts] = useState<Array<{ objectId: string; type: string }>>([])
  const [selectedNftId, setSelectedNftId] = useState<string>('')
  const [isNftsLoading, setIsNftsLoading] = useState(false)
  const [nftError, setNftError] = useState<string | null>(null)



  // 弱匿名模式：自動查詢符合條件的 NFT
  useEffect(() => {
    if (!survey || !survey.allowedNftType || !activeSigner?.address) {
      setOwnedNfts([])
      setSelectedNftId('')
      return
    }
    let cancelled = false
    async function checkNfts() {
      setIsNftsLoading(true)
      setNftError(null)
      try {
        const res = await suiClient.getOwnedObjects({
          owner: activeSigner!.address,
          filter: { StructType: survey!.allowedNftType! },
          options: { showType: true }
        })
        if (cancelled) return
        const nfts = (res.data || []).map(item => ({
          objectId: item.data?.objectId ?? '',
          type: item.data?.type ?? '',
        })).filter(x => x.objectId !== '')
        setOwnedNfts(nfts)
        if (nfts.length > 0) {
          setSelectedNftId(nfts[0].objectId)
        } else {
          setSelectedNftId('')
          setNftError(t.nftNotOwnedError(survey!.allowedNftType!))
        }
      } catch (err: any) {
        if (cancelled) return
        setNftError(err.message || t.nftQueryFailed)
      } finally {
        if (!cancelled) setIsNftsLoading(false)
      }
    }
    checkNfts()
    return () => {
      cancelled = true
    }
  }, [survey, activeSigner?.address, suiClient])



  const fetchPass = async () => {
    if (!activeSigner?.address || !registryId) {
      setActivePass(null)
      setPassCredentials([])
      setIsPassLoading(false)
      return
    }
    setIsPassLoading(true)
    try {
      const pass = await fetchActivePass(suiClient, activeSigner.address, registryId)
      setActivePass(pass)
      if (pass) {
        const creds = await fetchPassCredentials(suiClient, pass.objectId)
        setPassCredentials(creds)
      } else {
        setPassCredentials([])
      }
    } catch (err) {
      console.error('Failed to fetch active pass:', err)
      setActivePass(null)
      setPassCredentials([])
    } finally {
      setIsPassLoading(false)
    }
  }

  useEffect(() => {
    fetchPass()
  }, [activeSigner?.address, registryId])


  // ── Pass / NFT eligibility (必須在任何 early return 之前) ──────────────
  const isPassResolving = isWalletConnecting || isPassLoading
  const isPassRevoked = !!activePass && activePass.status === 3
  const isPassExpired =
    !!activePass && activePass.expiresAt > 0 && activePass.expiresAt <= Date.now()

  const hasEligibleSource = useMemo(() => {
    if (!activePass || passCredentials.length === 0) return false
    return passCredentials.some(
      (cred) =>
        surveyAllowedSources.includes(cred.source) &&
        (cred.expiresAt === 0 || cred.expiresAt > Date.now())
    )
  }, [activePass, passCredentials, surveyAllowedSources])

  const isCredentialInsufficient =
    !!activePass && !isPassRevoked && !isPassExpired && !hasEligibleSource

  const isPassValid =
    !isPassResolving && !!activePass && !isPassRevoked && !isPassExpired

  const isPassQualified = isPassValid && hasEligibleSource
  const isNftQualified = ownedNfts.length > 0 && !!selectedNftId

  // Repeat-submission gate
  const repeatsEnabled = !!survey && survey.repeat_reward > 0
  const maxTotalSubmissions = survey ? (repeatsEnabled ? 1 + survey.repeat_max_times : 1) : 1
  const remainingSubmissions = Math.max(0, maxTotalSubmissions - myClaimCount)
  const atSubmissionLimit = myClaimCount >= maxTotalSubmissions

  const { submitDisabled, submitLabel } = useMemo(() => {
    if (!survey) {
      return { submitDisabled: true, submitLabel: t.loadingSurvey }
    }
    if ((phase as string) === 'submitting') {
      return { submitDisabled: true, submitLabel: t.submitting }
    }
    if (atSubmissionLimit) {
      return { submitDisabled: true, submitLabel: t.submitLabelLimit }
    }

    const hasNftLimit = !!survey.allowedNftType

    if (hasNftLimit) {
      if (isNftsLoading || isPassResolving) {
        return { submitDisabled: true, submitLabel: t.verifyingEligibility }
      }
      if (!isPassQualified && !isNftQualified) {
        return { submitDisabled: true, submitLabel: t.needCredentialOrNft }
      }
    } else {
      if (isPassResolving) {
        return { submitDisabled: true, submitLabel: t.verifyingPass }
      }
      if (isPassRevoked) {
        return { submitDisabled: true, submitLabel: t.submitLabelRevoked }
      }
      if (isPassExpired) {
        return { submitDisabled: true, submitLabel: t.submitLabelExpired }
      }
      if (!isPassValid || isCredentialInsufficient) {
        return { submitDisabled: true, submitLabel: t.submitLabelNeedAuth }
      }
    }

    return {
      submitDisabled: false,
      submitLabel: myClaimCount > 0 ? t.submitLabelPreviewRepeat : t.submitLabelPreview
    }
  }, [
    phase,
    survey,
    survey?.allowedNftType,
    atSubmissionLimit,
    isNftsLoading,
    isPassResolving,
    isPassRevoked,
    isPassExpired,
    isPassValid,
    isCredentialInsufficient,
    isPassQualified,
    isNftQualified,
    myClaimCount,
    t
  ])

  // Debug output to trace variables
  useEffect(() => {
    console.log('[SurveyPage Debug]', {
      PACKAGE_ID,
      accountAddress: activeSigner?.address,
      activePass,
      surveyAllowedSources,
      phase,
    })
  }, [activeSigner?.address, activePass, surveyAllowedSources, phase])

  // Probe BFF gas sponsor health when entering review phase
  useEffect(() => {
    if (phase !== 'review' || gasMode !== 'unknown') return
    let cancelled = false
    void probeGasSponsorHealth().then((res) => {
      if (cancelled) return
      setGasMode(res.available ? 'sponsored' : 'self_paid_warning')
    })
    return () => {
      cancelled = true
    }
  }, [phase, gasMode])

  useEffect(() => {
    if (!id) return
    const surveyId: string = id

    setPhase('loading')

    async function loadSurvey() {
      try {
        const hash = window.location.hash.substring(1)

        let finalSurveyId = surveyId

        // Fetch survey object from chain
        let obj = await suiClient.getObject({
          id: finalSurveyId,
          options: { showContent: true },
        })

        if (
          obj.data &&
          obj.data.content &&
          obj.data.content.dataType === 'moveObject' &&
          (obj.data.content.type.endsWith('::survey_vault::SurveyVault') ||
            obj.data.content.type.includes('::survey_vault::SurveyVault'))
        ) {
          let cursor: any = null
          let hit: any = null
          let pageCount = 0
          do {
            const res = await suiClient.queryEvents({
              query: {
                MoveEventType: `${PACKAGE_ID}::survey_registry::SurveyRegistered`,
              },
              cursor,
              limit: 50,
              order: 'descending',
            })
            hit = res.data.find(
              (e: any) =>
                e.parsedJson &&
                normalizeSuiId(e.parsedJson.vault_id) === normalizeSuiId(finalSurveyId)
            )
            if (hit) break
            cursor = res.hasNextPage ? res.nextCursor : null
            pageCount++
          } while (cursor && pageCount < 10)
          if (!hit) {
            throw new Error(t.errNoSurveyRegistry)
          }
          finalSurveyId = hit.parsedJson.survey_id
          console.log('[SurveyPage] Resolved surveyId from on-chain event:', finalSurveyId)

          // Re-fetch the true Survey object
          obj = await suiClient.getObject({
            id: finalSurveyId,
            options: { showContent: true },
          })
        }

        if (!obj.data || !obj.data.content || obj.data.content.dataType !== 'moveObject') {
          throw new Error(t.errNoSurveyObject)
        }

        const fields = obj.data.content.fields as any
        const vault_id = fields.vault_id
        const status = fields.status // 0 = ACTIVE, 1 = ARCHIVED

        // 加查 vault 狀態，作為「是否關閉」的權威來源
        // (Survey.status 永遠是 ACTIVE，因為 close 流程不會呼叫 archive)
        const vaultObj = await suiClient.getObject({
          id: vault_id,
          options: { showContent: true },
        })
        if (
          vaultObj.data?.content?.dataType === 'moveObject' &&
          Number((vaultObj.data.content.fields as any).status) === 1 // STATUS_CLOSED
        ) {
          setPhase('closed')
          return
        }

        const vaultFields = (
          vaultObj.data?.content?.dataType === 'moveObject'
            ? (vaultObj.data.content.fields as any)
            : {}
        ) as Record<string, any>
        const repeatRewardBase = Number(vaultFields.repeat_reward ?? 0)
        const repeatMaxTimes = Number(vaultFields.repeat_max_times ?? 1)
        // base units (9 decimals) → human SSR
        const repeatRewardHuman = Math.floor(repeatRewardBase / 1_000_000_000)

        // Extract encrypted content
        const getOptionVec = (opt: any): Uint8Array | null => {
          if (!opt) return null
          
          // Support direct raw array (new Sui RPC Option format)
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

          // Support legacy Option wrapping
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

        const allowedNftTypeBytes = getOptionVec(vaultFields.allowed_nft_type)
        const allowedNftType = allowedNftTypeBytes ? new TextDecoder().decode(allowedNftTypeBytes) : null

        const surveyBlobIdBytes = getOptionVec(fields.survey_blob_id)
        let rawContent: Uint8Array

        if (surveyBlobIdBytes) {
          const blobId = new TextDecoder().decode(surveyBlobIdBytes)
          console.log('[SurveyPage] Survey is in decentralized mode. Downloading blobId:', blobId)
          rawContent = await downloadFromDecentralizedStorage(blobId)
        } else {
          // Fallback to legacy encrypted_content
          const encryptedContentBytes = getOptionVec(fields.encrypted_content)
          if (!encryptedContentBytes) {
            throw new Error(t.errCorruptContent)
          }
          rawContent = encryptedContentBytes
        }

        let markdown = ''
        let creatorPublicKeyBytes: Uint8Array

        if (hash) {
          // Decrypt content using hash key
          let contentKey: Uint8Array
          try {
            contentKey = base64urlToBytes(hash)
          } catch {
            throw new Error(t.errInvalidKeyFormat)
          }

          const dec = await decryptSurveyContent(rawContent, contentKey)
          markdown = dec.markdown
          creatorPublicKeyBytes = dec.creatorPublicKeyBytes
        } else {
          // Unencrypted: first 32 bytes are public key, rest is plain text
          if (rawContent.length < 32) {
            throw new Error(t.errCorruptContent)
          }
          creatorPublicKeyBytes = rawContent.slice(0, 32)
          markdown = new TextDecoder().decode(rawContent.slice(32))
        }

        // Parse markdown
        const parsed = parseFullSurveyMarkdown(markdown)
        if (!parsed.ok) {
          throw new Error(parsed.error)
        }

        // Resolve on-chain schema_hash, or compute it as fallback
        let schemaHashHex = ''
        if (fields.schema_hash) {
          schemaHashHex = bytesToHex(normalizeBytes(fields.schema_hash))
        } else {
          const computed = await computeSchemaHash(parsed.data.questions)
          schemaHashHex = bytesToHex(computed)
        }

        // Fisher-Yates shuffle algorithm
        const shuffleArray = <T,>(array: T[]): T[] => {
          const arr = [...array]
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
          }
          return arr
        }

        const sanitizedQuestions = sanitizeQuestionIds(parsed.data.questions).map((q) => {
          if (q.options_json && q.options_json.length > 0) {
            const mappedOpts = q.options_json.map((text, originalIndex) => ({
              text,
              originalIndex,
            }))
            return {
              ...q,
              shuffledOptions: q.shuffle ? shuffleArray(mappedOpts) : mappedOpts,
            }
          }
          return q
        })

        setSurvey({
          id: surveyId,
          title: parsed.data.title,
          description: parsed.data.description,
          status: status === 0 ? 'ACTIVE' : 'CLOSED',
          deadline: new Date(parsed.data.deadlineMs).toISOString(),
          per_response: parsed.data.perResponse,
          repeat_reward: repeatRewardHuman,
          repeat_max_times: repeatMaxTimes,
          vaultObjectId: vault_id,
          questions: sanitizedQuestions,
          schemaHash: schemaHashHex,
          encryptAnswers: parsed.data.encryptAnswers !== false,
          isDecentralized: !!surveyBlobIdBytes,
          allowedNftType,
        })

        // Count this wallet's prior claims on this vault (events filtered client-side).
        if (activeSigner?.address) {
          try {
            const myAddrNorm = normalizeSuiId(activeSigner.address)
            let evCursor: any = null
            let evPages = 0
            let count = 0
            do {
              const res = await suiClient.queryEvents({
                query: { MoveEventType: `${PACKAGE_ID}::survey_vault::SurveyClaimed` },
                cursor: evCursor,
                limit: 50,
              })
              for (const ev of res.data) {
                const j: any = ev.parsedJson
                if (!j) continue
                if (
                  normalizeSuiId(j.vault_id) === normalizeSuiId(vault_id) &&
                  normalizeSuiId(j.respondent) === myAddrNorm
                ) {
                  count++
                }
              }
              evCursor = res.hasNextPage ? (res.nextCursor ?? null) : null
              evPages++
            } while (evCursor !== null && evPages < 20)
            setMyClaimCount(count)
          } catch (e) {
            console.warn('[SurveyPage] failed to count prior claims:', e)
            setMyClaimCount(0)
          }
        } else {
          setMyClaimCount(0)
        }
        // Answer encryption uses the hybrid (X25519 + ML-KEM-768) pubkey published
        // on-chain in creator_pub_key, NOT the 32B X25519 header in the content blob.
        setCreatorPubKey(normalizeBytes(fields.creator_pub_key))
        setSurveyAllowedSources(fields.allowed_sources || [2])
        // 還原導向 /auth 領 Pass 前暫存的作答
        try {
          const saved = sessionStorage.getItem(ANSWERS_KEY)
          if (saved) setAnswers(JSON.parse(saved))
        } catch (e) {
          console.warn('[SurveyPage] failed to restore saved answers:', e)
        }
        setPhase('filling')
      } catch (err: any) {
        console.error('Failed to load survey:', err)
        setSubmitError(err.message || t.errLoadSurveyFailed)
        setPhase('error')
      }
    }

    loadSurvey()
  }, [id, suiClient])

  function getAnswerDisplay(q: Question): string {
    const ans = answers[q.id]
    if (ans === undefined || ans === null) return t.notFilled

    if (q.type === 'single_choice' && q.options_json) {
      const idx = Number(ans)
      if (!isNaN(idx) && idx >= 0 && idx < q.options_json.length) {
        return q.options_json[idx]
      }
      return t.notFilled
    }

    if (q.type === 'multi_choice' && q.options_json) {
      if (Array.isArray(ans)) {
        const texts = ans
          .map((item) => {
            const idx = Number(item)
            return idx >= 0 && idx < q.options_json!.length ? q.options_json![idx] : ''
          })
          .filter((t) => t !== '')
        return texts.length > 0 ? texts.join(t.multiSep) : t.notFilled
      }
      return t.notFilled
    }

    if (Array.isArray(ans)) return ans.length > 0 ? ans.join(t.multiSep) : t.notFilled
    return String(ans).trim() !== '' ? String(ans) : t.notFilled
  }

  function validateAndPreview() {
    if (!survey) return
    const missing = survey.questions.filter((q) => {
      if (!q.required) return false
      const ans = answers[q.id]
      if (ans === undefined || ans === null) return true
      if (Array.isArray(ans)) return ans.length === 0
      return String(ans).trim() === ''
    })
    if (missing.length > 0) {
      setValidationError(t.errRequired)
      return
    }
    // Validate text question character limits
    const exceeded = survey.questions.find((q) => {
      if (q.type === 'text' && q.maxLen !== undefined) {
        const ans = answers[q.id]
        if (typeof ans === 'string' && ans.length > q.maxLen) {
          return true
        }
      }
      return false
    })
    if (exceeded) {
      const idx = survey.questions.findIndex((q) => q.id === exceeded.id)
      setValidationError(t.errCharLimitExceeded(idx + 1, exceeded.maxLen!))
      return
    }
    setValidationError(null)

    // 門檻驗證（Pass 憑證與 NFT 視為平行 OR 聯集）
    const hasNftLimit = !!survey.allowedNftType

    if (hasNftLimit) {
      if (!isPassQualified && !isNftQualified) {
        setValidationError(t.needCredentialOrNft)
        return
      }
      setPhase('review')
    } else {
      // none: 原本的 SurveyPass 驗證
      if (!activePass) {
        goToAuth()
      } else if (activePass.status === 3) {
        setValidationError(t.errPassRevokedFull)
      } else if (!hasEligibleSource) {
        const sourcesText = surveyAllowedSources.map((src) => {
          switch (src) {
            case 1: return t.sourceSelfReport || '自我宣告'
            case 2: return t.sourceEmail || 'Email'
            case 3: return t.sourceSocial || '社群驗證'
            case 4: return t.sourceSelfProtocol || '自我協定'
            case 5: return t.sourceWorldId || 'World ID'
            case 6: return t.sourceGoogle || 'Google'
            case 7: return t.sourceGithub || 'GitHub'
            default: return `Source ${src}`
          }
        }).join(', ')
        setValidationError(t.credentialInsufficientDesc(sourcesText))
      } else {
        setPhase('review')
      }
    }
  }

  async function handleSubmit() {
    if (!id || !survey) return
    if (!activeSigner) {
      setSubmitError(t.errNeedConnectSign)
      return
    }

    // 門檻驗證
    const hasNftLimit = !!survey.allowedNftType

    if (hasNftLimit) {
      if (!isPassQualified && !isNftQualified) {
        setSubmitError(t.needCredentialOrNft)
        return
      }
    } else {
      if (!activePass) {
        goToAuth()
        return
      }
      if (activePass.status === 3) {
        setSubmitError(t.errPassRevokedShort)
        return
      }
      if (!hasEligibleSource) {
        const sourcesText = surveyAllowedSources.map((src) => {
          switch (src) {
            case 1: return t.sourceSelfReport || '自我宣告'
            case 2: return t.sourceEmail || 'Email'
            case 3: return t.sourceSocial || '社群驗證'
            case 4: return t.sourceSelfProtocol || '自我協定'
            case 5: return t.sourceWorldId || 'World ID'
            case 6: return t.sourceGoogle || 'Google'
            case 7: return t.sourceGithub || 'GitHub'
            default: return `Source ${src}`
          }
        }).join(', ')
        setSubmitError(t.credentialInsufficientDesc(sourcesText))
        return
      }
    }

    setPhase('submitting')
    setSubmitError(null)

    let lastBffError: any = undefined

    try {
      // 0. 前端 Schema 邊界校驗（防範選項注入與非法提交）
      for (const q of survey.questions) {
        const ans = answers[q.id]
        const isAnswerEmpty =
          ans === undefined ||
          ans === null ||
          (Array.isArray(ans) && ans.length === 0) ||
          (typeof ans === 'string' && ans.trim() === '')
        if (q.required && isAnswerEmpty) {
          throw new Error(`題目 "${q.prompt}" 是必填的`)
        }
        if (ans !== undefined && ans !== null && q.options_json && q.options_json.length > 0) {
          if (q.type === 'single_choice') {
            const idx = Number(ans)
            if (isNaN(idx) || idx < 0 || idx >= q.options_json.length) {
              throw new Error(`題目 "${q.prompt}" 提交了非法的選項值`)
            }
          } else if (q.type === 'multi_choice') {
            if (Array.isArray(ans)) {
              for (const val of ans) {
                const idx = Number(val)
                if (isNaN(idx) || idx < 0 || idx >= q.options_json.length) {
                  throw new Error(`題目 "${q.prompt}" 提交了非法的選項值`)
                }
              }
            } else {
              throw new Error(`多選題 "${q.prompt}" 的答案格式不正確`)
            }
          }
        }
      }

      // 1. Encrypt answers using ECIES
      const encodedPayload = encodeAnswers(answers, survey.questions, survey.schemaHash)
      const payloadStr = JSON.stringify(encodedPayload)
      let encryptedAnswersHex: string
      let encryptedAnswersBytes: Uint8Array

      if (survey.encryptAnswers === false) {
        // 公開不加密：直接將 payload 轉成 UTF-8 bytes 再轉成 hex
        const bytes = new TextEncoder().encode(payloadStr)
        encryptedAnswersBytes = bytes
        encryptedAnswersHex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      } else {
        // 加密：使用原有的 ECIES 加密
        if (!creatorPubKey) {
          throw new Error(t.errNoCreatorKey)
        }
        encryptedAnswersBytes = await encryptAnswers(payloadStr, creatorPubKey)
        encryptedAnswersHex = Array.from(encryptedAnswersBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      }

      // Route small answers on-chain (deletable dynamic field, fully purgeable and
      // cheap), only large ones to Walrus. Walrus bills a ~63 MiB encoded floor for
      // any blob, so on-chain is far cheaper until answers get large — hence the
      // generous default. Env-tunable via VITE_ANSWER_SIZE_THRESHOLD_KB.
      const ANSWER_SIZE_THRESHOLD_KB = Number(import.meta.env.VITE_ANSWER_SIZE_THRESHOLD_KB || '100')
      let answerBlobId: string | undefined = undefined

      if (encryptedAnswersBytes.length > ANSWER_SIZE_THRESHOLD_KB * 1024) {
        setIsUploadingAnswer(true)
        try {
          const uploadRes = await uploadToDecentralizedStorage(encryptedAnswersBytes)
          answerBlobId = uploadRes.blobId
        } catch (err) {
          console.error('[SurveyPage] Failed to upload answer to decentralized storage:', err)
          throw new Error(t.errEncryptSubmitFailed)
        } finally {
          setIsUploadingAnswer(false)
        }
      }

      // 2. Build Claim PTB
      let tx: Transaction
      const useNftRoute = hasNftLimit && isNftQualified && !isPassQualified

      if (useNftRoute) {
        tx = buildClaimWithNftMarkingPtb({
          packageId: PACKAGE_ID,
          vaultId: survey.vaultObjectId,
          nftId: selectedNftId,
          nftType: survey.allowedNftType!,
          encryptedAnswers: answerBlobId ? undefined : encryptedAnswersHex,
          answerBlobId: answerBlobId,
        })
      } else {
        tx = buildClaimPtb({
          packageId: PACKAGE_ID,
          vaultId: survey.vaultObjectId,
          surveyId: survey.id,
          passId: activePass!.objectId,
          encryptedAnswers: answerBlobId ? undefined : encryptedAnswersHex,
          answerBlobId: answerBlobId,
        })
      }

      // 3. Try sponsored path; auto-fallback to self-paid if BFF unreachable.
      // When fallback would charge the user, surface a confirm dialog first.
      const fallbackResult = await executeTxWithFallback({
        tx,
        senderAddress: activeSigner.address,
        client: suiClient as any,
        signAndExecute: async (t) => activeSigner.signAndExecute(t as Transaction),
        onSelfPaidFallback: (estMist, bffError) =>
          new Promise<boolean>((resolve) => {
            lastBffError = bffError
            const estSui = formatSui(estMist)
            const isLimitReached = bffError?.message === 'PLATFORM_SPONSOR_LIMIT_REACHED'
            setSelfPaidConfirm({ estSui, resolve, isLimitReached })
          }),
      })

      let digest: string
      if (fallbackResult.mode === 'sponsored') {
        // 4. User signs the sponsored TX block
        const txBytes = fromBase64(fallbackResult.sponsoredTxBytes)
        const userSignature = await activeSigner.signTxBytes(txBytes)
        // 5. Broadcast double-signed TX
        const txResult = await executeSponsoredTx({
          client: suiClient as any,
          sponsoredTxBytes: fallbackResult.sponsoredTxBytes,
          userSignature,
          sponsorSignature: fallbackResult.sponsorSignature,
        })
        digest = txResult.digest
      } else {
        // self_paid — already executed inside executeTxWithFallback
        digest = fallbackResult.digest
        setSelfPaidMode(true)
      }

      // 等待問卷提交交易確認並檢查是否成功
      const claimTxResult = await suiClient.waitForTransaction({
        digest: digest,
        options: {
          showEffects: true,
        },
      })

      if (
        claimTxResult &&
        claimTxResult.effects &&
        claimTxResult.effects.status &&
        claimTxResult.effects.status.status === 'failure'
      ) {
        const rawErr = claimTxResult.effects.status.error || t.errUnknown
        throw new Error(t.errTxOnchain(rawErr))
      }

      setTxHash(digest)
      // 提交成功，清除暫存的作答
      try {
        sessionStorage.removeItem(ANSWERS_KEY)
      } catch { /* ignore */ }
      setPhase('success')
    } catch (err: any) {
      if (err?.message === USER_DECLINED_SELF_PAID) {
        // User cancelled the self-paid confirmation — keep their answers, surface the warning
        setGasMode(
          lastBffError?.message === 'PLATFORM_SPONSOR_LIMIT_REACHED'
            ? 'limit_reached_warning'
            : 'self_paid_warning'
        )
        setPhase('review')
        return
      }
      const friendly = translateMoveAbort(err.message)
      setSubmitError(friendly || err.message || t.errSubmitFailed)
      setPhase('review')
    }
  }

  function handleAnswerChange(qId: string, value: string | string[] | number | number[]) {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
    setValidationError(null)
  }

  // 暫存作答，使導向 /auth 領 Pass 後返回時不遺失（提交成功後清除）
  useEffect(() => {
    if (!id) return
    if (Object.keys(answers).length === 0) return
    try {
      sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers))
    } catch (e) {
      console.warn('[SurveyPage] failed to persist answers:', e)
    }
  }, [answers, id])

  if (!activeSigner && phase !== 'loading' && phase !== 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full">
          <h1 className="text-h1">{t.connectWalletTitle}</h1>
          <p className="text-muted leading-relaxed">
            {t.connectWalletDesc}
          </p>
          <div className="my-3 scale-110 flex flex-col items-center gap-3">
            <a
              href="/guide"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary shadow-none inline-flex items-center justify-center text-sm font-normal px-4 py-2"
            >
              {t.btnGuide}
            </a>
            <ConnectButton />
          </div>
          <p className="text-xs text-slate-400 dark:text-neutral-500">{t.connectWalletHint}</p>
        </div>
      </main>
    )
  }

  if (phase === 'loading') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl p-8 text-center space-y-4 animate-fadeIn w-full">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
          <p aria-live="polite" className="text-sm text-slate-500 dark:text-neutral-400 font-medium">
            {t.loadingSurvey}
          </p>
        </div>
      </main>
    )
  }

  if ((phase === 'error' || !survey) && phase !== 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl p-8 text-center space-y-4 animate-fadeIn w-full">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 text-rose-500 border border-rose-100">
            <AlertTriangle size={24} />
          </div>
          <p role="alert" className="text-sm text-rose-600 font-semibold">
            {t.surveyLoadError}
          </p>
        </div>
      </main>
    )
  }

  if (phase === 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
          </div>
          <h1 className="text-h1">{t.surveyClosedTitle}</h1>
          <p className="text-muted leading-relaxed">{t.surveyClosedDesc}</p>
          <Link
            to="/"
            className="btn-secondary w-full"
          >
            {t.backHome}
          </Link>
        </div>
      </main>
    )
  }

  if (phase === 'success') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-slate-100 dark:border-neutral-800 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-100 mb-1 animate-scaleIn">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
          </div>
          <h1 className="text-h1">{t.submitSuccessTitle}</h1>
          {selfPaidMode && (
            <div className="text-sm warning-box rounded-xl px-4 py-3 leading-relaxed w-full flex items-center gap-1.5 justify-center">
              <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-500" />
              <div>
                <span>{t.selfPaidPrefix}</span>{t.selfPaidNotice('')}
              </div>
            </div>
          )}
          <p className="text-muted leading-relaxed">
            {t.submitSuccessDesc}
          </p>
          <div className="bg-slate-50/50 dark:bg-neutral-900/30 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 text-left w-full space-y-1 shadow-inner">
            <p className="text-xs text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-wider">{t.txHashLabel}</p>
            <p aria-label="tx-hash" className="font-mono text-xs break-all text-blue-600 font-semibold">
              {txHash}
            </p>
          </div>
          {survey?.encryptAnswers === false && (
            <Link
              to={`/results/${survey.vaultObjectId}`}
              className="btn-primary w-full inline-flex items-center justify-center"
            >
              {t.viewResultsBtn}
            </Link>
          )}
          <Link
            to="/"
            className="btn-secondary w-full"
          >
            {t.backHome}
          </Link>
        </div>
      </main>
    )
  }

  if (phase === 'review' || phase === 'submitting') {
    if (!survey) return null
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn">
          <div className="border-b pb-4 border-slate-100 dark:border-neutral-800">
            <h1 className="text-h1">{t.reviewTitle}</h1>
            <p className="text-muted mt-1">{t.reviewDesc}</p>
            {gasMode === 'self_paid_warning' && (
              <div role="alert" className="alert-error mt-3">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{t.gasSelfPaidWarning}</span>
              </div>
            )}
            {gasMode === 'limit_reached_warning' && (
              <div role="alert" className="alert-error mt-3">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{t.gasLimitReachedWarning}</span>
              </div>
            )}
            {survey.encryptAnswers === false && (
              <div className="warning-box rounded-2xl p-4 text-sm leading-relaxed mt-3 flex items-start gap-2.5">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                <div>{t.warnUnencryptedAnswers}</div>
              </div>
            )}
          </div>

          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            {survey.questions.map((q, i) => (
              <div key={q.id} className="bg-slate-50/50 dark:bg-neutral-900/30 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 space-y-3 shadow-sm transition-colors hover:bg-slate-50 dark:hover:bg-neutral-800/40">
                <div className="flex items-center justify-between border-b pb-2 border-slate-200/60 dark:border-neutral-700/60">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-normal text-slate-700 dark:text-neutral-200">{t.questionNum(i + 1)}</span>
                    <span className="chip-optional shrink-0">
                      {typeLabel(q.type as QuestionType)}
                    </span>
                  </div>
                  <span className={q.required ? 'chip-required' : 'chip-optional'}>
                    {q.required ? t.required : t.optional}
                  </span>
                </div>
                <p className="text-body leading-relaxed">{q.prompt}</p>
                <div className="bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 rounded-xl px-4 py-2.5 shadow-inner">
                  <p className="text-blue-700 font-bold text-sm">{getAnswerDisplay(q)}</p>
                </div>
              </div>
            ))}
          </div>

          {submitError && (
            <div role="alert" className="alert-error">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPhase('filling')}
              disabled={phase === 'submitting'}
              className="btn-outline w-full sm:w-1/3 flex items-center justify-center gap-1.5"
            >
              {t.backModifyArrow}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={phase === 'submitting'}
              className={
                gasMode === 'self_paid_warning' || gasMode === 'limit_reached_warning'
                  ? 'btn-danger w-full sm:w-2/3 flex items-center justify-center gap-1.5 disabled:opacity-50'
                  : 'w-full sm:w-2/3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 text-sm shadow-md flex items-center justify-center gap-1.5'
              }
            >
              {phase === 'submitting'
                ? t.submitting
                : gasMode === 'self_paid_warning' || gasMode === 'limit_reached_warning'
                  ? t.confirmSubmitSelfPaid
                  : t.confirmSubmit}
            </button>
          </div>
        </div>
        {selfPaidConfirm && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={() => {
              selfPaidConfirm.resolve(false)
              setSelfPaidConfirm(null)
            }}
          >
            <div
              className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-2xl max-w-md w-full p-6 space-y-4 animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-600/20 dark:border-rose-400/70 dark:text-rose-400 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                    {selfPaidConfirm.isLimitReached
                      ? t.gasLimitReachedConfirmTitle
                      : t.gasSelfPaidConfirmTitle}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-neutral-400 mt-1 leading-relaxed">
                    {selfPaidConfirm.isLimitReached
                      ? t.gasLimitReachedConfirmDesc(selfPaidConfirm.estSui)
                      : t.gasSelfPaidConfirmDesc(selfPaidConfirm.estSui)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  className="btn-outline w-full sm:w-1/2"
                  onClick={() => {
                    selfPaidConfirm.resolve(false)
                    setSelfPaidConfirm(null)
                  }}
                >
                  {t.gasSelfPaidCancel}
                </button>
                <button
                  type="button"
                  className="btn-danger w-full sm:w-1/2"
                  onClick={() => {
                    selfPaidConfirm.resolve(true)
                    setSelfPaidConfirm(null)
                  }}
                >
                  {t.gasSelfPaidContinue}
                </button>
              </div>
            </div>
          </div>
        )}
        {isUploadingAnswer && (
          <div className="glass-overlay">
            <div className="glass-card space-y-4">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <h3 className="text-lg font-medium text-slate-800 dark:text-neutral-200 animate-pulse">
                {t.encryptingSubmit}
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

  // ── filling ───────────────────────────────────────────────────────────────

  if (!survey) return null

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn">

        {/* 頂部問卷標題與說明區 */}
        <div className="space-y-3 bg-slate-50/50 dark:bg-neutral-900/30 border border-slate-100 dark:border-neutral-800 p-5 rounded-2xl animate-fadeIn">
          <h1 className="text-h1 overflow-x-auto whitespace-nowrap pb-1.5">{survey.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-500 dark:text-neutral-400 border-b border-slate-200/60 dark:border-neutral-700/60 pb-3 items-center">
            <span>{t.deadlineLabel(new Date(survey.deadline).toLocaleDateString(t.locale))}</span>
            <span>{t.rewardPerLabel(survey.per_response)}</span>
            {survey.repeat_reward > 0 && (
              <span>{t.repeatLabel(survey.repeat_reward, 1 + survey.repeat_max_times)}</span>
            )}
          </div>
          {survey.description && (
            <div
              aria-label={t.surveyDescriptionAria}
              className="prose max-w-none text-sm text-slate-600 dark:text-neutral-300 leading-relaxed pt-1"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(survey.description) }}
            />
          )}
        </div>

        {(survey.encryptAnswers === false || (activeSigner && myClaimCount > 0)) && (
          <div className="flex flex-col gap-3">
            {survey.encryptAnswers === false && (
              <div className="warning-box rounded-2xl p-4 text-sm leading-relaxed shadow-sm flex items-start gap-2.5">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                <div>{t.warnUnencryptedAnswers}</div>
              </div>
            )}

            {/* Repeat-submission status banner */}
            {activeSigner && myClaimCount > 0 && (
              <div
                data-testid="repeat-banner"
                className={`rounded-2xl px-5 py-3.5 text-sm shadow-sm ${atSubmissionLimit
                  ? 'warning-box'
                  : 'border border-blue-100 bg-blue-50/50 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-200'
                  }`}
              >
                {atSubmissionLimit ? (
                  <p className="font-normal flex items-start gap-1.5">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                    <span>
                      <span>{t.submissionLimitReached}</span>{t.submissionLimitMsg(myClaimCount, repeatsEnabled ? t.submissionLimitSuffix(maxTotalSubmissions) : '')}
                    </span>
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-normal"><span>{t.youHaveFilled(myClaimCount)}</span></p>
                    {repeatsEnabled && (
                      <p className="text-xs text-blue-700 font-semibold">
                        {t.repeatRewardInfo(survey.repeat_reward, remainingSubmissions)}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 dark:text-neutral-500">
                      {t.permanentNotice(purgeGraceDays)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!activeSigner && !isWalletConnecting && (
          <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="text-blue-800 dark:text-blue-200 text-left font-semibold">
              <strong>{t.connectWalletShort}</strong>{t.connectWalletShortDesc}
            </div>
            <ConnectButton />
          </div>
        )}

        {isPassQualified && (
          <span
            data-testid="tier-badge"
            className="inline-flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-full px-3 py-1 mb-2 font-bold w-fit"
          >
            <Check size={14} />
            {activePass!.effectiveTier === 0
              ? t.tier0
              : activePass!.effectiveTier === 1
                ? t.tier1
                : t.tier2}
          </span>
        )}

        {!!survey.allowedNftType && (
          <div className="bg-slate-50/50 dark:bg-neutral-900/30 border border-slate-100 dark:border-neutral-800 p-5 rounded-2xl animate-fadeIn space-y-3.5 text-sm">
            <div className="flex items-center gap-2 border-b pb-2.5 border-slate-200/60 dark:border-neutral-800">
              <Globe className="text-blue-500 shrink-0" size={16} />
              <span className="font-bold text-slate-800 dark:text-neutral-200">{t.nftThresholdTitle}</span>
            </div>

            {isNftsLoading ? (
              <p className="text-slate-500 dark:text-neutral-450 animate-pulse font-normal">{t.queryingNft}</p>
            ) : nftError ? (
              <div className="alert-error text-xs p-3">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{nftError}</span>
              </div>
            ) : ownedNfts.length > 0 ? (
              <div className="space-y-2">
                <label className="block">
                  <span className="text-slate-500 dark:text-neutral-450 font-bold block mb-1">{t.ownedNftLabel}</span>
                  <select
                    value={selectedNftId}
                    onChange={(e) => setSelectedNftId(e.target.value)}
                    className="form-input bg-white dark:bg-neutral-900 text-xs py-1.5 w-full max-w-md"
                  >
                    {ownedNfts.map((nft) => (
                      <option key={nft.objectId} value={nft.objectId}>
                        {nft.objectId.slice(0, 14)}...{nft.objectId.slice(-10)} ({nft.type.split('::').pop()})
                      </option>
                    ))}
                  </select>
                </label>
                {isPassQualified ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                    {t.passQualifiedPriority}
                  </p>
                ) : (
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1">
                    {t.nftQualifiedUse}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-rose-500 font-semibold animate-pulse">{t.nftNotOwnedWarning(survey.allowedNftType)}</p>
                {isPassQualified ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                    {t.nftNotOwnedPassQualified}
                  </p>
                ) : (
                  <p className="text-xs text-slate-450 dark:text-neutral-400 mt-1 font-normal">
                    {t.nftNotOwnedAuthHint}
                  </p>
                )}
              </div>
            )}
          </div>
        )}


        <form
          onSubmit={(e) => {
            e.preventDefault()
            validateAndPreview()
          }}
          noValidate
          className="space-y-6"
        >
          {survey.questions.map((q, i) => (
            <div
              key={q.id}
              className="bg-white dark:bg-neutral-900 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 space-y-4 shadow-sm hover:border-slate-200 dark:hover:border-neutral-700 transition-colors animate-fadeIn"
            >
              <div className="flex items-center justify-between border-b pb-2 border-slate-200/60 dark:border-neutral-700/60">
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-normal transition-colors ${q.required ? 'text-rose-800 dark:text-rose-400/80' : 'text-slate-700 dark:text-neutral-200'}`}>
                    {t.questionNum(i + 1)}
                  </span>
                  <span className="chip-optional shrink-0">
                    {typeLabel(q.type as QuestionType)}
                  </span>
                </div>
                <span className={q.required ? 'chip-required' : 'chip-optional'}>
                  {q.required ? t.required : t.optional}
                </span>
              </div>

              <p className="text-body">{q.prompt}</p>

              <div className="mt-1">
                {q.type === 'single_choice' && q.shuffledOptions && (
                  <div className="space-y-2">
                    {q.shuffledOptions.map((opt, optIdx) => {
                      const isChecked = answers[q.id] === opt.originalIndex
                      return (
                        <label
                          key={`${q.id}-opt-${optIdx}`}
                          className={`flex items-center gap-2.5 text-sm font-medium cursor-pointer border rounded-xl px-3.5 py-2.5 transition-all w-full ${isChecked
                            ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 font-semibold'
                            : 'bg-slate-50/50 dark:bg-neutral-900/30 border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800/40 text-slate-600 dark:text-neutral-300'
                            }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={String(opt.originalIndex)}
                            checked={isChecked}
                            onChange={() => handleAnswerChange(q.id, opt.originalIndex)}
                            className="radio-dark"
                            aria-label={opt.text}
                          />
                          <span>{opt.text}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'multi_choice' && q.shuffledOptions && (
                  <div className="space-y-2">
                    {q.shuffledOptions.map((opt, optIdx) => {
                      const selected = (answers[q.id] as number[] | undefined) ?? []
                      const isChecked = selected.includes(opt.originalIndex)
                      return (
                        <label
                          key={`${q.id}-opt-${optIdx}`}
                          className={`flex items-center gap-2.5 text-sm font-medium cursor-pointer border rounded-xl px-3.5 py-2.5 transition-all w-full ${isChecked
                            ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 font-semibold'
                            : 'bg-slate-50/50 dark:bg-neutral-900/30 border-slate-100 dark:border-neutral-800 hover:bg-slate-55 dark:hover:bg-neutral-800/40 text-slate-600 dark:text-neutral-300'
                            }`}
                        >
                          <input
                            type="checkbox"
                            value={String(opt.originalIndex)}
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selected, opt.originalIndex]
                                : selected.filter((idx) => idx !== opt.originalIndex)
                              handleAnswerChange(q.id, next)
                            }}
                            className="checkbox-dark checked:bg-blue-600 checked:border-blue-600"
                            aria-label={opt.text}
                          />
                          <span>{opt.text}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'text' && (
                  <div className="space-y-1.5">
                    <textarea
                      className="w-full border border-slate-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-neutral-100 bg-white dark:bg-neutral-900 placeholder:text-slate-400 dark:placeholder:text-neutral-500 font-mono transition-all"
                      rows={3}
                      value={(answers[q.id] as string | undefined) ?? ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      aria-label={q.prompt}
                      placeholder={t.textPlaceholder}
                      maxLength={q.maxLen}
                    />
                    {q.maxLen !== undefined && (
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-400 dark:text-neutral-500 px-1 select-none">
                        <span>{t.charLimit(q.maxLen)}</span>
                        <span>
                          {((answers[q.id] as string | undefined) ?? '').length} / {q.maxLen}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {q.type === 'scale' && (
                  <div className="space-y-4 py-2 max-w-xs">
                    <div className="relative flex items-center select-none py-3">
                      {/* The HTML5 input range */}
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : '3'}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                        className={`slider-custom relative z-10 ${!answers[q.id] ? 'slider-unselected' : ''}`}
                        style={getSliderBackground(answers[q.id] as string | string[] | undefined)}
                      />

                      {/* Snap points (ticks) on the track */}
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none px-[7px] z-20">
                        {[1, 2, 3, 4, 5].map((val) => {
                          const isSelected = answers[q.id] === String(val)
                          const isPassed = answers[q.id] && typeof answers[q.id] === 'string' ? Number(answers[q.id]) >= val : false
                          return (
                            <div
                              key={val}
                              className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                                isSelected
                                  ? 'opacity-0'
                                  : isPassed
                                  ? 'bg-white/80'
                                  : 'bg-slate-400 dark:bg-neutral-600'
                              }`}
                            />
                          )
                        })}
                      </div>
                    </div>

                    {/* Numeric buttons under the slider */}
                    <div className="flex justify-between px-1 select-none">
                      {[1, 2, 3, 4, 5].map((val) => {
                        const isSelected = answers[q.id] === String(val)
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleAnswerChange(q.id, String(val))}
                            className={`text-xs font-bold transition-all duration-200 px-3 py-1.5 rounded-lg border ${
                              isSelected
                                ? 'text-blue-800 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 scale-110 font-black ring-2 ring-blue-500/20'
                                : 'text-slate-400 dark:text-neutral-500 border-transparent hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800/40'
                            }`}
                          >
                            {val}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isPassResolving ? (
            <div className="mt-4">
              <div className="bg-slate-50/50 dark:bg-neutral-900/30 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 text-sm flex items-center justify-center gap-3 text-slate-500 dark:text-neutral-400 animate-pulse">
                {t.verifyingPass}
              </div>
            </div>
          ) : !activeSigner ? null : (
            ((!isPassValid || isCredentialInsufficient) && (!survey.allowedNftType || !isNftQualified)) && (
              <div className="mt-4">
                {isPassRevoked ? (
                  <div className="bg-rose-50/50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-rose-800 dark:text-rose-200 text-left flex items-start gap-2.5">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">{t.passRevokedPrompt}</span>{t.passRevokedDesc}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={goToAuth}
                      className="bg-rose-800 hover:bg-rose-600 text-white dark:bg-rose-800 dark:hover:bg-rose-700 dark:text-neutral-200 font-normal text-sm py-1.5 px-4 rounded-xl transition-all shadow-sm whitespace-nowrap"
                    >
                      {t.renewPassBtn}
                    </button>
                  </div>
                ) : isPassExpired ? (
                  <div className="warning-box rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-left flex items-start gap-2.5">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                      <div>
                        <span className="font-semibold">{t.passExpiredPrompt}</span>{t.passExpiredDesc}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={goToAuth}
                      className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white font-normal text-sm py-1.5 px-4 rounded-xl transition-all shadow-sm whitespace-nowrap animate-pulse"
                    >
                      {t.renewPassBtn}
                    </button>
                  </div>
                ) : !activePass ? (
                  <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-blue-800 dark:text-blue-200 text-left flex items-start gap-2.5">
                      <Info size={16} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">{t.needPassPrompt}</span>{t.needPassPromptDesc}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={goToAuth}
                      className="bg-blue-700 hover:bg-blue-800 text-white dark:bg-blue-800 dark:hover:bg-blue-600 dark:text-neutral-200 font-normal text-sm py-1.5 px-4 rounded-xl transition-all shadow-sm whitespace-nowrap animate-pulse"
                    >
                      {t.getPassBtn}
                    </button>
                  </div>
                ) : (
                  <div className="warning-box rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-left flex items-start gap-2.5">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                      <div>
                        <span className="font-semibold">憑證驗證不符</span>
                        <p className="text-xs opacity-90 mt-1">
                          本問卷需要以下其中一種未過期的憑證：
                          {surveyAllowedSources.map((src) => {
                            if (src === 2) return ' Email'
                            if (src === 6) return ' Google'
                            if (src === 7) return ' GitHub'
                            if (src === 5) return ' World ID'
                            return ' 未知'
                          }).join(', ')}。
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={goToAuth}
                      className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white font-normal text-sm py-1.5 px-4 rounded-xl transition-all shadow-sm whitespace-nowrap"
                    >
                      {t.upgradePassBtn}
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {validationError && (
            <div role="alert" className="alert-error">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {survey.encryptAnswers === false && atSubmissionLimit ? (
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={submitDisabled}
                className="btn-primary w-full sm:w-1/2"
              >
                {submitLabel}
              </button>
              <Link
                to={`/results/${survey.vaultObjectId}`}
                className="btn-secondary w-full sm:w-1/2 inline-flex items-center justify-center"
              >
                {t.viewResultsBtn}
              </Link>
            </div>
          ) : (
            <button
              type="submit"
              disabled={submitDisabled}
              className="btn-primary w-full"
            >
              {submitLabel}
            </button>
          )}
        </form>
        {/* Footer */}
        <footer className="py-8 text-center text-xs text-slate-400 dark:text-neutral-500 font-medium transition-colors">
          © 2026 SurveySui
        </footer>
      </div>
    </main>
  )
}
