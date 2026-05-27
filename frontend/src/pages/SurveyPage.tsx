import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { IdCard, AlertTriangle, Check } from 'lucide-react'
import {
  ConnectButton,
  useCurrentAccount,
  useCurrentWallet,
  useSignTransaction,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import {
  buildClaimPtb,
  executeSponsoredTx,
  executeTxWithFallback,
  probeGasSponsorHealth,
  USER_DECLINED_SELF_PAID,
} from '../lib/sponsoredTx'
import { decryptSurveyContent, encryptAnswers, base64urlToBytes } from '../lib/crypto'
import { parseFullSurveyMarkdown, type QuestionType } from '../lib/frontmatter'
import { renderMarkdown } from '../lib/markdown'
import { encodeAnswers, computeSchemaHash, bytesToHex, normalizeBytes } from '../lib/answerCodec'
import { buildMintPassPtb } from '../lib/ptb'
import { fetchActivePass, SurveyPassData } from '../lib/surveyPass'
import { translateMoveAbort } from '../lib/moveAbort'
import { useLanguage } from '../context/LanguageContext'
import { formatSui } from '../lib/format'

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID ?? ''

const content = {
  ZH: {
    typeSingleChoice: '單選',
    typeMultiChoice: '複選',
    typeText: '簡答',
    typeScale: '量表',
    errNoSurveyRegistry: '找不到該金庫關聯的問卷登記記錄',
    errNoSurveyObject: '找不到該問卷物件',
    errInvalidEncFormat: '無效的加密內容格式',
    errInvalidKeyFormat: '解密金鑰格式無效',
    errCorruptContent: '問卷內容資料損壞',
    errLoadSurveyFailed: '載入問卷失敗',
    errInvalidEmail: '請輸入有效的電子郵件地址',
    errSendOtp: '發送 OTP 失敗',
    errSendRequest: '發送請求時出錯',
    errInvalidOtp: '請輸入 6 位數驗證碼',
    errVerifyFailed: '驗證失敗',
    errTxExecFailed: '交易執行失敗',
    errUnknown: '未知錯誤',
    errTxOnchain: (raw: string) => `鏈上交易執行失敗: ${raw}`,
    errAuthOrTxFailed: '驗證或交易發送失敗',
    errNeedConnectSign: '請連接錢包以進行簽名!',
    errPassRevokedShort: '您的 SurveyPass 已被吊銷 (Revoked)',
    errPassExpiredShort: '您的 SurveyPass 已過期',
    errNoCreatorKey: '未載入問卷建立者金鑰,無法加密答案',
    errSubmitFailed: '提交填答與領取獎勵失敗',
    errRequired: '請回答所有必填題',
    errPassRevokedFull: '您的 SurveyPass 已被吊銷 (Revoked),無法填寫問卷。請先前往誰位通證重新發行。',
    errPassExpiredFull: '您的 SurveyPass 已過期,請先前往誰位通證更新驗證。',
    notFilled: '（未填寫)',
    multiSep: '、',
    connectWalletTitle: '請連接錢包',
    connectWalletDesc: '本平台為確保填答真實性,需要使用您的 Sui 錢包進行零手續費交易與簽名。',
    connectWalletHint: '請點擊上方按鈕連接錢包,或重整頁面。',
    loadingSurvey: '載入問卷中…',
    surveyLoadError: '問卷載入失敗,請確認網址或稍後再試。',
    surveyClosedTitle: '此問卷已關閉',
    surveyClosedDesc: '發起人已結束此問卷活動,目前已無法再填寫。',
    backHome: '返回首頁',
    needPassTitle: '首次填答,請先領取通行證',
    needPassDesc: '本系統需要誰位通證 (SurveyPass) 以防範女巫攻擊。請輸入 Email 獲取驗證碼以鑄造您專屬的 SBT 憑證卡。',
    needPassConnectHint: '要獲取或鑄造您的 SurveyPass,您必須先連結您的 Sui 錢包。',
    backToSurvey: '返回問卷',
    emailLabel: '電子郵件地址',
    backModify: '返回修改',
    sendingOtp: '正在發送...',
    getOtp: '獲取驗證碼 →',
    inputOtpLabel: '請輸入 6 位數驗證碼',
    devOtpHintPrefix: '開發者提示:輸入 ',
    devOtpHintSuffix: ' 即可。',
    verifying: '正在驗證鑄造...',
    verifyMint: '驗證並鑄造憑證',
    submitSuccessTitle: '提交成功!',
    selfPaidNotice: (prefix: string) => `${prefix}本次以自付 gas 模式完成（Gas Station 暫時不可用)`,
    selfPaidPrefix: '提示:',
    gasSelfPaidWarning: '⚠ Gas 代付目前失效中,請稍後再試',
    gasSelfPaidConfirmTitle: 'Gas 代付失效中',
    gasSelfPaidConfirmDesc: (estSui: string) => `提交本問卷需由您支付鏈上手續費 (預估 ${estSui} SUI)。是否繼續?`,
    gasSelfPaidContinue: '確認自付',
    gasSelfPaidCancel: '取消',
    confirmSubmitSelfPaid: '自付 Gas 提交 ➔',
    submitSuccessDesc: '感謝您的熱心參與,填答完成驗證已在鏈上通過,RWD 獎勵已發放至您的錢包!',
    txHashLabel: '交易雜湊（TX Hash)',
    reviewTitle: '確認您的答案',
    reviewDesc: '請在提交前核對您所填寫的回答內容。',
    questionNum: (n: number) => `第 ${n} 題`,
    required: '必填',
    optional: '選填',
    backModifyArrow: '⬅ 返回修改',
    submitting: '提交中…',
    confirmSubmit: '確認提交並領取獎勵 ➔',
    connectWalletShort: '請先連結錢包:',
    connectWalletShortDesc: ' 填寫此問卷需要連結錢包並檢測您的身分憑證 (SurveyPass)。',
    tier0: 'Tier 0 - Email 驗證',
    tier1: 'Tier 1 - OAuth 驗證',
    tier2: 'Tier 2 - 真人驗證',
    submissionLimitReached: '已達填答次數上限：',
    submissionLimitMsg: (n: number, max: string) => `您此地址已填過 ${n} 次${max},無法再次提交。`,
    submissionLimitSuffix: (m: number) => `（上限 ${m} 次)`,
    youHaveFilled: (n: number) => `您已填過 ${n} 次。`,
    repeatRewardInfo: (ssr: number, remaining: number) => `再填可得 ${ssr} SSR,還可再填 ${remaining} 次。`,
    permanentNotice: '鏈上事件歷史不可抹除,每次提交都會獨立永久保留。',
    deadlineLabel: (date: string) => `截止日期:${date}`,
    rewardPerLabel: (n: number) => `單份獎勵:${n} SSR`,
    repeatLabel: (n: number, max: number) => `重複填答:${n} SSR (上限 ${max} 次)`,
    surveyDescriptionAria: '問卷說明',
    textPlaceholder: '請輸入您的回答...',
    needPassPrompt: '需要 SurveyPass 憑證:',
    needPassPromptDesc: ' 填寫此問卷要求經過身分驗證。',
    verifyingPass: '正在驗證身分憑證…',
    getPassBtn: '獲取 SurveyPass 憑證',
    passExpiredPrompt: 'SurveyPass 已過期:',
    passExpiredDesc: ' 您的憑證已逾有效期限,請重新驗證以更新效期。',
    passRevokedPrompt: 'SurveyPass 已被吊銷:',
    passRevokedDesc: ' 您的憑證已被管理員吊銷,請重新驗證取得新憑證。',
    renewPassBtn: '重新驗證更新',
    tierTooLowPrompt: '憑證等級不足:',
    tierTooLowDesc: (req: number, curr: number) => ` 本問卷要求 Tier ${req},但您的憑證等級為 Tier ${curr}。`,
    upgradePassBtn: '升級 SurveyPass 憑證',
    submitLabelLimit: '已達填答次數上限',
    submitLabelNeedAuth: '需要身分驗證才能填答',
    submitLabelExpired: 'Pass 已過期,請先重新驗證',
    submitLabelRevoked: 'Pass 已被吊銷,請先重新驗證',
    submitLabelPreviewRepeat: '預覽答案（重複填答)',
    submitLabelPreview: '預覽答案',
    warnUnencryptedAnswers: '⚠️ 安全提示：此問卷完全公開，任何人均可檢視您的填答內容。請勿填寫個人隱私資訊。',
    viewResultsBtn: '查看即時統計結果',
    locale: 'zh-TW',
  },
  EN: {
    typeSingleChoice: 'Single Choice',
    typeMultiChoice: 'Multi Choice',
    typeText: 'Text',
    typeScale: 'Scale',
    errNoSurveyRegistry: 'No survey registration record found for this vault',
    errNoSurveyObject: 'Survey object not found',
    errInvalidEncFormat: 'Invalid encrypted content format',
    errInvalidKeyFormat: 'Invalid decryption key format',
    errCorruptContent: 'Survey content data corrupted',
    errLoadSurveyFailed: 'Failed to load survey',
    errInvalidEmail: 'Please enter a valid email address',
    errSendOtp: 'Failed to send OTP',
    errSendRequest: 'Error sending request',
    errInvalidOtp: 'Please enter the 6-digit verification code',
    errVerifyFailed: 'Verification failed',
    errTxExecFailed: 'Transaction execution failed',
    errUnknown: 'Unknown error',
    errTxOnchain: (raw: string) => `On-chain transaction failed: ${raw}`,
    errAuthOrTxFailed: 'Verification or transaction send failed',
    errNeedConnectSign: 'Please connect your wallet to sign!',
    errPassRevokedShort: 'Your SurveyPass has been revoked',
    errPassExpiredShort: 'Your SurveyPass has expired',
    errNoCreatorKey: 'Survey creator key not loaded, cannot encrypt answers',
    errSubmitFailed: 'Failed to submit response and claim reward',
    errRequired: 'Please answer all required questions.',
    errPassRevokedFull: 'Your SurveyPass has been revoked. Please re-verify identity to issue a new one.',
    errPassExpiredFull: 'Your SurveyPass has expired. Please re-verify identity to update.',
    notFilled: '(unanswered)',
    multiSep: ', ',
    connectWalletTitle: 'Please connect your wallet',
    connectWalletDesc: 'To ensure response authenticity, this platform requires your Sui wallet for zero-fee transactions and signing.',
    connectWalletHint: 'Please click the button above to connect, or refresh the page.',
    loadingSurvey: 'Loading survey…',
    surveyLoadError: 'Failed to load survey. Please check the URL or try again later.',
    surveyClosedTitle: 'This survey is closed',
    surveyClosedDesc: 'The creator has ended this survey activity. Responses are no longer accepted.',
    backHome: 'Back to home',
    needPassTitle: 'First-time response — please claim your pass',
    needPassDesc: 'This system requires a SurveyPass credential to prevent Sybil attacks. Please enter your email to receive a verification code and mint your exclusive SBT credential.',
    needPassConnectHint: 'To obtain or mint your SurveyPass, you must first connect your Sui wallet.',
    backToSurvey: 'Back to survey',
    emailLabel: 'Email address',
    backModify: 'Back',
    sendingOtp: 'Sending...',
    getOtp: 'Get code →',
    inputOtpLabel: 'Please enter the 6-digit code',
    devOtpHintPrefix: 'Dev hint: enter ',
    devOtpHintSuffix: ' to continue.',
    verifying: 'Verifying and minting...',
    verifyMint: 'Verify and mint credential',
    submitSuccessTitle: 'Submitted successfully!',
    selfPaidNotice: (prefix: string) => `${prefix}Completed with self-paid gas mode (Gas Station temporarily unavailable)`,
    selfPaidPrefix: 'Notice: ',
    gasSelfPaidWarning: '⚠ Gas sponsorship is currently unavailable. Please try again later.',
    gasSelfPaidConfirmTitle: 'Gas Sponsorship Unavailable',
    gasSelfPaidConfirmDesc: (estSui: string) => `Submitting this survey will require you to pay the on-chain gas fee (~${estSui} SUI). Continue?`,
    gasSelfPaidContinue: 'Pay Gas & Submit',
    gasSelfPaidCancel: 'Cancel',
    confirmSubmitSelfPaid: 'Self-paid Gas Submit ➔',
    submitSuccessDesc: 'Thank you for participating! Your response has been verified on-chain, and the RWD reward has been sent to your wallet!',
    txHashLabel: 'Transaction Hash',
    reviewTitle: 'Confirm your answers',
    reviewDesc: 'Please review your responses before submitting.',
    questionNum: (n: number) => `Question ${n}`,
    required: 'Required',
    optional: 'Optional',
    backModifyArrow: '⬅ Back to edit',
    submitting: 'Submitting…',
    confirmSubmit: 'Confirm submission and claim reward ➔',
    connectWalletShort: 'Please connect your wallet:',
    connectWalletShortDesc: ' Filling out this survey requires connecting your wallet and verifying your SurveyPass.',
    tier0: 'Tier 0 - Email',
    tier1: 'Tier 1 - OAuth',
    tier2: 'Tier 2 - Individual',
    submissionLimitReached: 'Submission Limit Reached: ',
    submissionLimitMsg: (n: number, max: string) => `Your address has submitted ${n} times${max}. You cannot submit again.`,
    submissionLimitSuffix: (m: number) => ` (limit ${m})`,
    youHaveFilled: (n: number) => `You have submitted ${n} times.`,
    repeatRewardInfo: (ssr: number, remaining: number) => `Repeat reward: ${ssr} SSR. You can submit ${remaining} more times.`,
    permanentNotice: 'On-chain event history cannot be erased; each submission is independently and permanently preserved.',
    deadlineLabel: (date: string) => `Deadline: ${date}`,
    rewardPerLabel: (n: number) => `Per response: ${n} SSR`,
    repeatLabel: (n: number, max: number) => `Repeat: ${n} SSR (max ${max} times)`,
    surveyDescriptionAria: 'Survey description',
    textPlaceholder: 'Enter your answer...',
    needPassPrompt: 'SurveyPass credential required:',
    needPassPromptDesc: ' This survey requires identity verification.',
    verifyingPass: 'Verifying identity credential…',
    getPassBtn: 'Claim SurveyPass',
    passExpiredPrompt: 'SurveyPass expired:',
    passExpiredDesc: ' Your credential is past its expiry. Re-verify your identity to renew it.',
    passRevokedPrompt: 'SurveyPass revoked:',
    passRevokedDesc: ' Your credential has been revoked by an admin. Re-verify to obtain a new one.',
    renewPassBtn: 'Renew SurveyPass',
    tierTooLowPrompt: 'Low SurveyPass level:',
    tierTooLowDesc: (req: number, curr: number) => ` This survey requires Tier ${req}, but your SurveyPass is Tier ${curr}.`,
    upgradePassBtn: 'Upgrade SurveyPass',
    submitLabelLimit: 'Submission limit reached',
    submitLabelNeedAuth: 'Verification required',
    submitLabelExpired: 'Pass expired — please re-verify',
    submitLabelRevoked: 'Pass revoked — please re-verify',
    submitLabelPreviewRepeat: 'Preview answers (repeat submission)',
    submitLabelPreview: 'Preview answers',
    warnUnencryptedAnswers: '⚠️ Privacy Alert: The creator set "Unencrypted Answers" for this survey. Once submitted, your answers will be publicly visible to anyone on the dashboard. Please DO NOT enter sensitive personal information.',
    viewResultsBtn: 'View Real-time Results',
    locale: 'en-US',
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

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16)
  }
  return bytes
}

interface Question {
  id: string
  type: QuestionType
  prompt: string
  options_json: string[] | null
  required: boolean
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
}

type Answers = Record<string, string | string[]>
type Phase =
  | 'loading'
  | 'filling'
  | 'review'
  | 'submitting'
  | 'success'
  | 'error'
  | 'need_pass'
  | 'closed'

export default function SurveyPage() {
  const { id } = useParams<{ id: string }>()
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
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [answers, setAnswers] = useState<Answers>({})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [creatorPubKey, setCreatorPubKey] = useState<Uint8Array | null>(null)
  const [surveyMinTier, setSurveyMinTier] = useState(0)

  // Wallet & Client integration
  const account = useCurrentAccount()
  const { connectionStatus } = useCurrentWallet()
  const isWalletConnecting = connectionStatus === 'connecting'
  const suiClient = useSuiClient()
  const { mutateAsync: signTransaction } = useSignTransaction()
  const { mutateAsync: signAndExecuteWallet } = useSignAndExecuteTransaction()
  const [selfPaidMode, setSelfPaidMode] = useState(false)
  const [gasMode, setGasMode] = useState<'unknown' | 'sponsored' | 'self_paid_warning'>('unknown')
  const [selfPaidConfirm, setSelfPaidConfirm] = useState<{
    estSui: string
    resolve: (ok: boolean) => void
  } | null>(null)

  // SurveyPass SBT & Verification States
  const registryId =
    import.meta.env.VITE_NULLIFIER_REGISTRY_ID ?? import.meta.env.VITE_PASS_REGISTRY_ID ?? ''
  const configId = import.meta.env.VITE_ISSUER_CONFIG_ID ?? ''

  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStep, setOtpStep] = useState<'input' | 'verify'>('input')
  const [debugOtp, setDebugOtp] = useState<string | null>(null)
  const [issuingPass, setIssuingPass] = useState(false)
  const [issuingError, setIssuingError] = useState<string | null>(null)

  const [activePass, setActivePass] = useState<SurveyPassData | null>(null)
  const [isPassLoading, setIsPassLoading] = useState(true)

  /** How many times the connected wallet has already claimed for this survey. */
  const [myClaimCount, setMyClaimCount] = useState(0)

  const fetchPass = async () => {
    if (!account?.address || !registryId) {
      setActivePass(null)
      setIsPassLoading(false)
      return
    }
    setIsPassLoading(true)
    try {
      const pass = await fetchActivePass(suiClient, account.address, registryId)
      setActivePass(pass)
    } catch (err) {
      console.error('Failed to fetch active pass:', err)
      setActivePass(null)
    } finally {
      setIsPassLoading(false)
    }
  }

  useEffect(() => {
    fetchPass()
  }, [account?.address, registryId])

  // Debug output to trace variables
  useEffect(() => {
    console.log('[SurveyPage Debug]', {
      PACKAGE_ID,
      accountAddress: account?.address,
      activePass,
      surveyMinTier,
      phase,
    })
  }, [account?.address, activePass, surveyMinTier, phase])

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
        let rawContent: Uint8Array
        if (Array.isArray(fields.encrypted_content)) {
          rawContent = new Uint8Array(fields.encrypted_content.map(Number))
        } else if (typeof fields.encrypted_content === 'string') {
          const str = fields.encrypted_content
          if (str.startsWith('0x')) {
            rawContent = new Uint8Array(
              str
                .slice(2)
                .match(/.{1,2}/g)
                ?.map((byte: string) => parseInt(byte, 16)) || []
            )
          } else {
            // Assume base64
            const binary = atob(str)
            rawContent = Uint8Array.from(binary, (c) => c.charCodeAt(0))
          }
        } else {
          throw new Error(t.errInvalidEncFormat)
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
          questions: parsed.data.questions,
          schemaHash: schemaHashHex,
          encryptAnswers: parsed.data.encryptAnswers !== false,
        })

        // Count this wallet's prior claims on this vault (events filtered client-side).
        if (account?.address) {
          try {
            const myAddrNorm = normalizeSuiId(account.address)
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
        setCreatorPubKey(creatorPublicKeyBytes)
        setSurveyMinTier(Number(fields.min_tier ?? 0))
        setPhase('filling')
      } catch (err: any) {
        console.error('Failed to load survey:', err)
        setSubmitError(err.message || t.errLoadSurveyFailed)
        setPhase('error')
      }
    }

    loadSurvey()
  }, [id, suiClient])

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      setIssuingError(t.errInvalidEmail)
      return
    }

    setIssuingPass(true)
    setIssuingError(null)
    setDebugOtp(null)

    try {
      const res = await fetch('/auth/email/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t.errSendOtp)
      }

      setOtpStep('verify')
      if (data.code) {
        setDebugOtp(data.code)
      }
    } catch (err: any) {
      setIssuingError(err.message || t.errSendRequest)
    } finally {
      setIssuingPass(false)
    }
  }

  async function handleVerifyAndMint(e: React.FormEvent) {
    e.preventDefault()
    if (!otpCode || otpCode.length !== 6) {
      setIssuingError(t.errInvalidOtp)
      return
    }
    if (!account) return

    setIssuingPass(true)
    setIssuingError(null)

    try {
      const res = await fetch('/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: otpCode,
          owner: account.address,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t.errVerifyFailed)
      }

      const nullifierHash = hexToBytes(data.nullifier_hash)
      const commitment = new Uint8Array(0)
      const bffSig = hexToBytes(data.bff_sig)

      const tx = buildMintPassPtb({
        packageId: PACKAGE_ID,
        registryId,
        configId,
        owner: account.address,
        source: data.source,
        nullifierHash,
        commitment,
        expiresAt: data.expires_at,
        bffSig,
      })

      const result = await signAndExecuteWallet({ transaction: tx as any })
      if (!result.digest) {
        throw new Error(t.errTxExecFailed)
      }

      // 等待交易在鏈上被確認並檢查執行狀態
      const txResult = await suiClient.waitForTransaction({
        digest: result.digest,
        options: {
          showEffects: true,
        },
      })

      if (
        txResult &&
        txResult.effects &&
        txResult.effects.status &&
        txResult.effects.status.status === 'failure'
      ) {
        const rawErr = txResult.effects.status.error || t.errUnknown
        const friendly = translateMoveAbort(rawErr)
        throw new Error(friendly || t.errTxOnchain(rawErr))
      }

      // 輪詢等待鏈上反映新鑄造的 SurveyPass 物件
      let attempts = 0
      let found = false
      while (attempts < 6) {
        const pass = await fetchActivePass(suiClient, account?.address ?? '', registryId)
        if (pass) {
          setActivePass(pass)
          found = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
        attempts++
      }

      if (!found) {
        console.warn('[SurveyPage] SurveyPass minted on-chain but not yet found via table index.')
      }

      setPhase('filling')
      setOtpStep('input')
      setDebugOtp(null)
      setOtpCode('')
      setEmail('')
    } catch (err: any) {
      const friendly = translateMoveAbort(err.message)
      setIssuingError(friendly || err.message || t.errAuthOrTxFailed)
    } finally {
      setIssuingPass(false)
    }
  }

  function getAnswerDisplay(q: Question): string {
    const ans = answers[q.id]
    if (!ans) return t.notFilled
    if (Array.isArray(ans)) return ans.length > 0 ? ans.join(t.multiSep) : t.notFilled
    return ans.trim() !== '' ? ans : t.notFilled
  }

  function validateAndPreview() {
    if (!survey) return
    const missing = survey.questions.filter((q) => {
      if (!q.required) return false
      const ans = answers[q.id]
      if (!ans) return true
      if (Array.isArray(ans)) return ans.length === 0
      return ans.trim() === ''
    })
    if (missing.length > 0) {
      setValidationError(t.errRequired)
      return
    }
    setValidationError(null)

    // Check if SurveyPass exists
    if (!activePass) {
      setPhase('need_pass')
    } else if (activePass.status === 3) {
      setValidationError(t.errPassRevokedFull)
    } else if (activePass.expiresAt > 0 && activePass.expiresAt < Date.now()) {
      setValidationError(t.errPassExpiredFull)
    } else {
      setPhase('review')
    }
  }

  async function handleSubmit() {
    if (!id || !survey) return
    if (!account) {
      setSubmitError(t.errNeedConnectSign)
      return
    }
    if (!activePass) {
      setPhase('need_pass')
      return
    }
    if (activePass.status === 3) {
      setSubmitError(t.errPassRevokedShort)
      return
    }
    if (activePass.expiresAt > 0 && activePass.expiresAt < Date.now()) {
      setSubmitError(t.errPassExpiredShort)
      return
    }

    setPhase('submitting')
    setSubmitError(null)

    try {
      // 1. Encrypt answers using ECIES
      const encodedPayload = encodeAnswers(answers, survey.questions, survey.schemaHash)
      const payloadStr = JSON.stringify(encodedPayload)
      let encryptedAnswersHex: string

      if (survey.encryptAnswers === false) {
        // 公開不加密：直接將 payload 轉成 UTF-8 bytes 再轉成 hex
        const bytes = new TextEncoder().encode(payloadStr)
        encryptedAnswersHex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      } else {
        // 加密：使用原有的 ECIES 加密
        if (!creatorPubKey) {
          throw new Error(t.errNoCreatorKey)
        }
        const encryptedAnswersBytes = await encryptAnswers(payloadStr, creatorPubKey)
        encryptedAnswersHex = Array.from(encryptedAnswersBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      }

      // 2. Build Claim PTB
      const tx = buildClaimPtb({
        packageId: PACKAGE_ID,
        vaultId: survey.vaultObjectId,
        passId: activePass.objectId,
        encryptedAnswers: encryptedAnswersHex,
      })

      // 3. Try sponsored path; auto-fallback to self-paid if BFF unreachable.
      // When fallback would charge the user, surface a confirm dialog first.
      const fallbackResult = await executeTxWithFallback({
        tx,
        senderAddress: account.address,
        client: suiClient as any,
        signAndExecute: async (t) => {
          const res = await signAndExecuteWallet({ transaction: t as any })
          return { digest: res.digest }
        },
        onSelfPaidFallback: (estMist) =>
          new Promise<boolean>((resolve) => {
            const estSui = formatSui(estMist)
            setSelfPaidConfirm({ estSui, resolve })
          }),
      })

      let digest: string
      if (fallbackResult.mode === 'sponsored') {
        // 4. User signs the sponsored TX block
        const sponsoredTx = Transaction.from(fallbackResult.sponsoredTxBytes)
        const { signature: userSignature } = await signTransaction({
          transaction: sponsoredTx as any,
        })
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
      setPhase('success')
    } catch (err: any) {
      if (err?.message === USER_DECLINED_SELF_PAID) {
        // User cancelled the self-paid confirmation — keep their answers, surface the warning
        setGasMode('self_paid_warning')
        setPhase('review')
        return
      }
      const friendly = translateMoveAbort(err.message)
      setSubmitError(friendly || err.message || t.errSubmitFailed)
      setPhase('review')
    }
  }

  function handleAnswerChange(qId: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
    setValidationError(null)
  }

  if (!account && phase !== 'loading' && phase !== 'closed') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 text-center flex flex-col items-center animate-fadeIn w-full">
          <h1 className="text-h1">{t.connectWalletTitle}</h1>
          <p className="text-muted leading-relaxed">
            {t.connectWalletDesc}
          </p>
          <div className="my-3 scale-110">
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

  if (phase === 'need_pass') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-xl mx-auto flex items-center justify-center">
        <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl overflow-hidden p-8 sm:p-10 space-y-6 animate-fadeIn w-full">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-200 border border-blue-200 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <IdCard size={24} />
            </div>
            <h2 className="text-h2">
              {t.needPassTitle}
            </h2>
            <p className="text-muted mt-2 leading-relaxed">
              {t.needPassDesc}
            </p>
          </div>

          {!account ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                {t.needPassConnectHint}
              </p>
              <div className="flex justify-center my-2">
                <ConnectButton />
              </div>
              <button
                type="button"
                onClick={() => setPhase('filling')}
                className="text-xs text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:text-neutral-300 transition-colors underline block mx-auto"
              >
                {t.backToSurvey}
              </button>
            </div>
          ) : otpStep === 'input' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="form-label">
                  {t.emailLabel}
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="respondent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              {issuingError && (
                <div role="alert" className="alert-error">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{issuingError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPhase('filling')}
                  className="btn-outline w-1/3"
                >
                  {t.backModify}
                </button>
                <button
                  type="submit"
                  disabled={issuingPass}
                  className="w-2/3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm hover:brightness-110 shadow-md"
                >
                  {issuingPass ? t.sendingOtp : t.getOtp}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndMint} className="space-y-4">
              <div className="space-y-1.5">
                <label className="form-label">
                  {t.inputOtpLabel}
                </label>
                <input
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="form-input text-center font-mono tracking-widest"
                  required
                />
                {debugOtp && (
                  <p className="text-[10px] text-blue-700 dark:text-blue-300 mt-2 bg-blue-50/50 dark:bg-blue-950/30 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900 font-medium leading-relaxed">
                    {t.devOtpHintPrefix}<span className="font-bold font-mono">{debugOtp}</span>{t.devOtpHintSuffix}
                  </p>
                )}
              </div>

              {issuingError && (
                <div role="alert" className="alert-error">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{issuingError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep('input')
                    setDebugOtp(null)
                  }}
                  className="btn-outline w-1/3"
                >
                  {t.backModify}
                </button>
                <button
                  type="submit"
                  disabled={issuingPass}
                  className="w-2/3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm hover:brightness-110 shadow-md"
                >
                  {issuingPass ? t.verifying : t.verifyMint}
                </button>
              </div>
            </form>
          )}
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
            <div className="text-sm warning-box rounded-xl px-4 py-3 leading-relaxed w-full">
              <span>{t.selfPaidPrefix}</span>{t.selfPaidNotice('')}
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
            {survey.encryptAnswers === false && (
              <div className="warning-box rounded-2xl p-4 text-sm leading-relaxed mt-3">
                {t.warnUnencryptedAnswers}
              </div>
            )}
          </div>

          <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
            {survey.questions.map((q, i) => (
              <div key={q.id} className="bg-slate-50/50 dark:bg-neutral-900/30 border border-slate-100 dark:border-neutral-800 rounded-2xl p-5 space-y-3 shadow-sm transition-colors hover:bg-slate-50 dark:hover:bg-neutral-800/40">
                <div className="flex items-center justify-between border-b pb-2 border-slate-200/60 dark:border-neutral-700/60">
                  <span className="text-sm font-semibold text-slate-700 dark:text-neutral-200">{t.questionNum(i + 1)}</span>
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
                gasMode === 'self_paid_warning'
                  ? 'btn-danger w-full sm:w-2/3 flex items-center justify-center gap-1.5 disabled:opacity-50'
                  : 'w-full sm:w-2/3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 text-sm shadow-md flex items-center justify-center gap-1.5'
              }
            >
              {phase === 'submitting'
                ? t.submitting
                : gasMode === 'self_paid_warning'
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
                    {t.gasSelfPaidConfirmTitle}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-neutral-400 mt-1 leading-relaxed">
                    {t.gasSelfPaidConfirmDesc(selfPaidConfirm.estSui)}
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
      </main>
    )
  }

  // ── filling ───────────────────────────────────────────────────────────────
  const isPassResolving = isWalletConnecting || isPassLoading
  const isPassRevoked = !!activePass && activePass.status === 3
  const isPassExpired =
    !!activePass && activePass.expiresAt > 0 && activePass.expiresAt <= Date.now()
  const isTierInsufficient =
    !!activePass && !isPassRevoked && !isPassExpired && activePass.effectiveTier < surveyMinTier
  const isPassValid =
    !isPassResolving && !!activePass && !isPassRevoked && !isPassExpired

  // Repeat-submission gate
  const repeatsEnabled = !!survey && survey.repeat_reward > 0
  const maxTotalSubmissions = survey ? (repeatsEnabled ? 1 + survey.repeat_max_times : 1) : 1
  const remainingSubmissions = Math.max(0, maxTotalSubmissions - myClaimCount)
  const atSubmissionLimit = myClaimCount >= maxTotalSubmissions

  const submitDisabled =
    (phase as string) === 'submitting' ||
    isPassResolving ||
    !isPassValid ||
    isTierInsufficient ||
    atSubmissionLimit

  const submitLabel = atSubmissionLimit
    ? t.submitLabelLimit
    : isPassRevoked
      ? t.submitLabelRevoked
      : isPassExpired
        ? t.submitLabelExpired
        : !isPassValid || isTierInsufficient
          ? t.submitLabelNeedAuth
          : myClaimCount > 0
            ? t.submitLabelPreviewRepeat
            : t.submitLabelPreview

  if (!survey) return null

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto">
      <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6 animate-fadeIn">

        {/* 頂部問卷標題與說明區 */}
        <div className="space-y-3 bg-slate-50/50 dark:bg-neutral-900/30 border border-slate-100 dark:border-neutral-800 p-5 rounded-2xl animate-fadeIn">
          <h1 className="text-h1 overflow-x-auto whitespace-nowrap pb-1.5">{survey.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-500 dark:text-neutral-400 border-b border-slate-200/60 dark:border-neutral-700/60 pb-3">
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

        {(survey.encryptAnswers === false || (account && myClaimCount > 0)) && (
          <div className="flex flex-col gap-3">
            {survey.encryptAnswers === false && (
              <div className="warning-box rounded-2xl p-4 text-sm leading-relaxed shadow-sm">
                {t.warnUnencryptedAnswers}
              </div>
            )}

            {/* Repeat-submission status banner */}
            {account && myClaimCount > 0 && (
              <div
                data-testid="repeat-banner"
                className={`rounded-2xl px-5 py-3.5 text-sm shadow-sm ${atSubmissionLimit
                  ? 'warning-box'
                  : 'border border-blue-100 bg-blue-50/50 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-200'
                  }`}
              >
                {atSubmissionLimit ? (
                  <p className="font-normal">
                    <span>{t.submissionLimitReached}</span>{t.submissionLimitMsg(myClaimCount, repeatsEnabled ? t.submissionLimitSuffix(maxTotalSubmissions) : '')}
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
                      {t.permanentNotice}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!account && !isWalletConnecting && (
          <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="text-blue-800 dark:text-blue-200 text-left font-semibold">
              <strong>{t.connectWalletShort}</strong>{t.connectWalletShortDesc}
            </div>
            <ConnectButton />
          </div>
        )}

        {isPassValid && (
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
                  <span className={`text-sm font-semibold transition-colors ${q.required ? 'text-rose-800 dark:text-rose-400/80' : 'text-slate-700 dark:text-neutral-200'}`}>
                    {t.questionNum(i + 1)}
                  </span>
                  {q.required && (
                    <span className="chip-required">
                      {t.required}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 rounded-full">
                  {typeLabel(q.type as QuestionType)}
                </span>
              </div>

              <p className="text-body">{q.prompt}</p>

              <div className="mt-1">
                {q.type === 'single_choice' && q.options_json && (
                  <div className="space-y-2">
                    {q.options_json.map((opt) => {
                      const isChecked = answers[q.id] === opt
                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-2.5 text-sm font-medium cursor-pointer border rounded-xl px-3.5 py-2.5 transition-all w-full ${isChecked
                            ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 font-semibold'
                            : 'bg-slate-50/50 dark:bg-neutral-900/30 border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800/40 text-slate-600 dark:text-neutral-300'
                            }`}
                        >
                          <input
                            type="radio"
                            name={q.id}
                            value={opt}
                            checked={isChecked}
                            onChange={() => handleAnswerChange(q.id, opt)}
                            className="radio-dark"
                            aria-label={opt}
                          />
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'multi_choice' && q.options_json && (
                  <div className="space-y-2">
                    {q.options_json.map((opt) => {
                      const selected = (answers[q.id] as string[] | undefined) ?? []
                      const isChecked = selected.includes(opt)
                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-2.5 text-sm font-medium cursor-pointer border rounded-xl px-3.5 py-2.5 transition-all w-full ${isChecked
                            ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 font-semibold'
                            : 'bg-slate-50/50 dark:bg-neutral-900/30 border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800/40 text-slate-600 dark:text-neutral-300'
                            }`}
                        >
                          <input
                            type="checkbox"
                            value={opt}
                            checked={isChecked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selected, opt]
                                : selected.filter((s) => s !== opt)
                              handleAnswerChange(q.id, next)
                            }}
                            className="checkbox-dark checked:bg-blue-600 checked:border-blue-600"
                            aria-label={opt}
                          />
                          <span>{opt}</span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {q.type === 'text' && (
                  <textarea
                    className="w-full border border-slate-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2.5 text-sm text-slate-800 dark:text-neutral-100 bg-white dark:bg-neutral-900 placeholder:text-slate-400 dark:placeholder:text-neutral-500 font-mono transition-all"
                    rows={3}
                    value={(answers[q.id] as string | undefined) ?? ''}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    aria-label={q.prompt}
                    placeholder={t.textPlaceholder}
                  />
                )}

                {q.type === 'scale' && (
                  <div className="flex flex-wrap gap-3">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const isChecked = answers[q.id] === String(n)
                      return (
                        <label
                          key={n}
                          className={`flex flex-col items-center justify-center gap-1.5 cursor-pointer border rounded-xl p-3 w-12 h-14 transition-all ${isChecked
                            ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 ring-2 ring-blue-500/20 dark:ring-blue-400/30'
                            : 'bg-slate-50/50 dark:bg-neutral-900/30 border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800/40 text-slate-600 dark:text-neutral-300'
                            }`}
                        >
                          <span className={`text-xs font-bold ${isChecked ? 'text-blue-700 dark:text-blue-300' : 'text-slate-400 dark:text-neutral-500'}`}>{n}</span>
                          <input
                            type="radio"
                            name={q.id}
                            value={String(n)}
                            checked={isChecked}
                            onChange={() => handleAnswerChange(q.id, String(n))}
                            className="radio-dark"
                            aria-label={String(n)}
                          />
                        </label>
                      )
                    })}
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
          ) : !account ? null : (
            (!isPassValid || isTierInsufficient) && (
              <div className="mt-4">
                {isPassRevoked ? (
                  <div className="bg-rose-50/50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-rose-800 dark:text-rose-200 text-left">
                      <span>{t.passRevokedPrompt}</span>{t.passRevokedDesc}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep('input')
                        setPhase('need_pass')
                      }}
                      className="bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md whitespace-nowrap"
                    >
                      {t.renewPassBtn}
                    </button>
                  </div>
                ) : isPassExpired ? (
                  <div className="warning-box rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-left">
                      <span>{t.passExpiredPrompt}</span>{t.passExpiredDesc}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep('input')
                        setPhase('need_pass')
                      }}
                      className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md whitespace-nowrap animate-pulse"
                    >
                      {t.renewPassBtn}
                    </button>
                  </div>
                ) : !activePass ? (
                  <div className="bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-blue-800 dark:text-blue-200 text-left">
                      <span>{t.needPassPrompt}</span>{t.needPassPromptDesc}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep('input')
                        setPhase('need_pass')
                      }}
                      className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md whitespace-nowrap animate-pulse"
                    >
                      {t.getPassBtn}
                    </button>
                  </div>
                ) : (
                  <div className="warning-box rounded-2xl p-5 text-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-left">
                      <span>{t.tierTooLowPrompt}</span>{t.tierTooLowDesc(surveyMinTier, activePass.effectiveTier)}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep('input')
                        setPhase('need_pass')
                      }}
                      className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md whitespace-nowrap"
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
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3.5 rounded-xl transition-all w-full sm:w-1/2 disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md"
              >
                {submitLabel}
              </button>
              <Link
                to={`/results/${survey.vaultObjectId}`}
                className="btn-primary w-full sm:w-1/2 inline-flex items-center justify-center py-3.5 text-sm font-semibold rounded-xl transition-all shadow-md"
              >
                {t.viewResultsBtn}
              </Link>
            </div>
          ) : (
            <button
              type="submit"
              disabled={submitDisabled}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:brightness-110 text-white font-semibold py-3.5 rounded-xl transition-all shadow-md w-full disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
