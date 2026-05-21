import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  useCurrentAccount,
  useSignTransaction,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { buildClaimPtb, executeSponsoredTx, executeTxWithFallback } from '../lib/sponsoredTx'
import { decryptSurveyContent, encryptAnswers, base64urlToBytes } from '../lib/crypto'
import { parseFullSurveyMarkdown } from '../lib/frontmatter'
import { encodeAnswers, computeSchemaHash, bytesToHex, normalizeBytes } from '../lib/answerCodec'
import { buildMintPassPtb } from '../lib/ptb'

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID ?? ''

function normalizeSuiId(id: string): string {
  if (!id) return ''
  let cleaned = id.toLowerCase().trim()
  if (cleaned.startsWith('0x')) {
    cleaned = cleaned.slice(2)
  }
  return cleaned.padStart(64, '0')
}

interface Question {
  id: string
  type: 'single_choice' | 'multi_choice' | 'text' | 'scale'
  prompt: string
  options_json: string[] | null
  required: boolean
}

interface Survey {
  id: string
  title: string
  status: 'ACTIVE' | 'CLOSED'
  deadline: string
  per_response: number
  vaultObjectId: string // Add vaultObjectId for claiming
  questions: Question[]
  schemaHash: string
}

type Answers = Record<string, string | string[]>
type Phase = 'loading' | 'filling' | 'review' | 'submitting' | 'success' | 'error' | 'need_pass'

export default function SurveyPage() {
  const { id } = useParams<{ id: string }>()
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
  const suiClient = useSuiClient()
  const { mutateAsync: signTransaction } = useSignTransaction()
  const { mutateAsync: signAndExecuteWallet } = useSignAndExecuteTransaction()
  const [selfPaidMode, setSelfPaidMode] = useState(false)

  // SurveyPass SBT & Verification States
  const registryId = import.meta.env.VITE_NULLIFIER_REGISTRY_ID ?? import.meta.env.VITE_PASS_REGISTRY_ID ?? ''
  const configId = import.meta.env.VITE_ISSUER_CONFIG_ID ?? ''

  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStep, setOtpStep] = useState<'input' | 'verify'>('input')
  const [debugOtp, setDebugOtp] = useState<string | null>(null)
  const [issuingPass, setIssuingPass] = useState(false)
  const [issuingError, setIssuingError] = useState<string | null>(null)

  // Fetch owned SurveyPass objects
  const { data: passObjects, isLoading: isPassLoading, refetch: refetchPass } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address ?? '',
      filter: {
        StructType: `${PACKAGE_ID}::survey_pass::SurveyPass`,
      },
      options: {
        showContent: true,
      },
    },
    { enabled: !!account && !!PACKAGE_ID },
  )

  // Parse the active SurveyPass from owned objects
  const activePass = useMemo(() => {
    if (!passObjects || passObjects.length === 0) return null
    const obj = passObjects[0]
    if (obj?.data?.content?.dataType === 'moveObject') {
      const fields = (obj.data.content as { fields: Record<string, any> }).fields
      return {
        objectId: obj.data.objectId,
        owner: fields.owner,
        effectiveTier: Number(fields.effective_tier),
        expiresAt: Number(fields.expires_at),
        status: Number(fields.status), // 0: Active, 3: Revoked
      }
    }
    return null
  }, [passObjects])

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
          console.log('[SurveyPage] Detected vaultId in URL. Querying on-chain registry events...')
          const events = await suiClient.queryEvents({
            query: {
              MoveEventType: `${PACKAGE_ID}::survey_registry::SurveyRegistered`,
            },
            limit: 50,
            order: 'descending',
          })
          const hit = events.data.find(
            (e: any) =>
              e.parsedJson &&
              normalizeSuiId(e.parsedJson.vault_id) === normalizeSuiId(finalSurveyId)
          )
          if (!hit) {
            throw new Error('找不到該金庫關聯的問卷登記記錄')
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
          throw new Error('找不到該問卷物件')
        }

        const fields = obj.data.content.fields as any
        const vault_id = fields.vault_id
        const status = fields.status // 0 = ACTIVE, 1 = ARCHIVED
        
        // Extract encrypted content
        let rawContent: Uint8Array
        if (Array.isArray(fields.encrypted_content)) {
          rawContent = new Uint8Array(fields.encrypted_content.map(Number))
        } else if (typeof fields.encrypted_content === 'string') {
          const str = fields.encrypted_content
          if (str.startsWith('0x')) {
            rawContent = new Uint8Array(
              str.slice(2).match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || []
            )
          } else {
            // Assume base64
            const binary = atob(str)
            rawContent = Uint8Array.from(binary, c => c.charCodeAt(0))
          }
        } else {
          throw new Error('無效的加密內容格式')
        }

        let markdown = ''
        let creatorPublicKeyBytes: Uint8Array

        if (hash) {
          // Decrypt content using hash key
          let contentKey: Uint8Array
          try {
            contentKey = base64urlToBytes(hash)
          } catch {
            throw new Error('解密金鑰格式無效')
          }

          const dec = await decryptSurveyContent(rawContent, contentKey)
          markdown = dec.markdown
          creatorPublicKeyBytes = dec.creatorPublicKeyBytes
        } else {
          // Unencrypted: first 32 bytes are public key, rest is plain text
          if (rawContent.length < 32) {
            throw new Error('問卷內容資料損壞')
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
          status: status === 0 ? 'ACTIVE' : 'CLOSED',
          deadline: new Date(parsed.data.deadlineMs).toISOString(),
          per_response: parsed.data.perResponse,
          vaultObjectId: vault_id,
          questions: parsed.data.questions,
          schemaHash: schemaHashHex,
        })
        setCreatorPubKey(creatorPublicKeyBytes)
        setSurveyMinTier(Number(fields.min_tier ?? 0))
        setPhase('filling')
      } catch (err: any) {
        console.error('Failed to load survey:', err)
        setSubmitError(err.message || '載入問卷失敗')
        setPhase('error')
      }
    }

    loadSurvey()
  }, [id, suiClient])

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      setIssuingError('請輸入有效的電子郵件地址')
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
        throw new Error(data.error || '發送 OTP 失敗')
      }

      setOtpStep('verify')
      if (data.code) {
        setDebugOtp(data.code)
      }
    } catch (err: any) {
      setIssuingError(err.message || '發送請求時出錯')
    } finally {
      setIssuingPass(false)
    }
  }

  async function handleVerifyAndMint(e: React.FormEvent) {
    e.preventDefault()
    if (!otpCode || otpCode.length !== 6) {
      setIssuingError('請輸入 6 位數驗證碼')
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
        throw new Error(data.error || '驗證失敗')
      }

      const nullifierHash = new Uint8Array(Buffer.from(data.nullifier_hash, 'hex'))
      const commitment = new Uint8Array(0)
      const bffSig = new Uint8Array(Buffer.from(data.bff_sig, 'hex'))

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
        throw new Error('交易執行失敗')
      }

      await refetchPass()
      setPhase('filling')
      setOtpStep('input')
      setDebugOtp(null)
      setOtpCode('')
      setEmail('')
    } catch (err: any) {
      setIssuingError(err.message || '認證或交易發送失敗')
    } finally {
      setIssuingPass(false)
    }
  }

  function getAnswerDisplay(q: Question): string {
    const ans = answers[q.id]
    if (!ans) return '（未填寫）'
    if (Array.isArray(ans)) return ans.length > 0 ? ans.join('、') : '（未填寫）'
    return ans.trim() !== '' ? ans : '（未填寫）'
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
      setValidationError(`請回答必填題：${missing.map((q) => q.prompt).join('、')}`)
      return
    }
    setValidationError(null)

    // Check if SurveyPass exists
    if (!activePass) {
      setPhase('need_pass')
    } else if (activePass.status === 3) {
      setValidationError('您的 SurveyPass 已被吊銷 (Revoked)，無法填寫問卷。請先前往真人認證重新發行。')
    } else if (activePass.expiresAt > 0 && activePass.expiresAt < Date.now()) {
      setValidationError('您的 SurveyPass 已過期，請先前往真人認證更新驗證。')
    } else {
      setPhase('review')
    }
  }

  async function handleSubmit() {
    if (!id || !survey) return
    if (!account) {
      setSubmitError('請連接錢包以進行簽名！')
      return
    }
    if (!activePass) {
      setPhase('need_pass')
      return
    }
    if (activePass.status === 3) {
      setSubmitError('您的 SurveyPass 已被吊銷 (Revoked)')
      return
    }
    if (activePass.expiresAt > 0 && activePass.expiresAt < Date.now()) {
      setSubmitError('您的 SurveyPass 已過期')
      return
    }

    setPhase('submitting')
    setSubmitError(null)

    try {
      // 1. Encrypt answers using ECIES
      if (!creatorPubKey) {
        throw new Error('未載入問卷建立者金鑰，無法加密答案')
      }
      const encodedPayload = encodeAnswers(answers, survey.questions, survey.schemaHash)
      const encryptedAnswersBytes = await encryptAnswers(JSON.stringify(encodedPayload), creatorPubKey)
      const encryptedAnswersHex = Array.from(encryptedAnswersBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      // 2. Build Claim PTB
      const tx = buildClaimPtb({
        packageId: PACKAGE_ID,
        vaultId: survey.vaultObjectId,
        passId: activePass.objectId,
        encryptedAnswers: encryptedAnswersHex,
      })

      // 3. Try sponsored path; auto-fallback to self-paid if BFF unreachable
      const fallbackResult = await executeTxWithFallback({
        tx,
        senderAddress: account.address,
        client: suiClient as any,
        signAndExecute: async (t) => {
          const res = await signAndExecuteWallet({ transaction: t as any })
          return { digest: res.digest }
        },
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

      setTxHash(digest)
      setPhase('success')
    } catch (err: any) {
      setSubmitError(err.message || '提交填答與領取獎勵失敗')
      setPhase('review')
    }
  }

  function handleAnswerChange(qId: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
    setValidationError(null)
  }

  // ── Wallet Check ──────────────────────────────────────────────────────────
  if (!account && phase !== 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
        <div className="bg-white border rounded-xl p-8 max-w-md w-full shadow-md text-center space-y-6">
          <h1 className="text-2xl font-bold text-gray-800">請連接錢包</h1>
          <p className="text-sm text-gray-600">
            本平台為確保填答真實性，需要使用您的 Sui 錢包進行零手續費交易與簽名。
          </p>
          <p className="text-xs text-gray-400">
            請點擊右上角連接錢包，或重整頁面。
          </p>
        </div>
      </main>
    )
  }

  // ── loading ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">填寫問卷</h1>
        <p aria-live="polite" className="text-gray-500">載入問卷中…</p>
      </main>
    )
  }

  // ── error ─────────────────────────────────────────────────────────────────
  if (phase === 'error' || !survey) {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">填寫問卷</h1>
        <p role="alert" className="text-red-500">
          問卷載入失敗，請稍後再試。
        </p>
      </main>
    )
  }

  // ── need_pass (SurveyPass 首次領取) ───────────────────────────────────────
  if (phase === 'need_pass') {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-3xl p-8 max-w-md w-full shadow-xl space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">📇</div>
            <h2 className="text-2xl font-black text-gray-800 tracking-tight">首次填答，請先驗證</h2>
            <p className="text-xs text-gray-500 mt-2">
              本系統需要真人憑證 (SurveyPass) 以防範女巫攻擊。請輸入 Email 獲取驗證碼以鑄造您專屬的 SBT 憑證卡。
            </p>
          </div>

          {otpStep === 'input' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  電子郵件地址
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="respondent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  required
                />
              </div>

              {issuingError && (
                <p role="alert" className="text-rose-500 text-xs font-semibold">
                  ⚠️ {issuingError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPhase('filling')}
                  className="w-1/3 border border-gray-200 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-xs font-bold text-gray-600"
                >
                  返回修改
                </button>
                <button
                  type="submit"
                  disabled={issuingPass}
                  className="w-2/3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-50 text-xs hover:shadow-sm"
                >
                  {issuingPass ? '正在發送...' : '獲取驗證碼 →'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndMint} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
                  請輸入 6 位數驗證碼
                </label>
                <input
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-center font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                {debugOtp && (
                  <p className="text-[10px] text-blue-600 mt-2 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                    ⚙️ 開發者提示：輸入 <span className="font-bold font-mono">{debugOtp}</span> 即可。
                  </p>
                )}
              </div>

              {issuingError && (
                <p role="alert" className="text-rose-500 text-xs font-semibold">
                  ⚠️ {issuingError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep('input')
                    setDebugOtp(null)
                  }}
                  className="w-1/3 border border-gray-200 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-xs font-bold text-gray-600"
                >
                  返回修改
                </button>
                <button
                  type="submit"
                  disabled={issuingPass}
                  className="w-2/3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-50 text-xs hover:shadow-sm"
                >
                  {issuingPass ? '正在驗證鑄造...' : '驗證並鑄造憑證'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    )
  }

  // ── success ───────────────────────────────────────────────────────────────
  if (phase === 'success') {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-gray-50">
        <div className="bg-white border rounded-xl p-8 max-w-md w-full shadow-lg text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-2">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">提交成功！</h1>
          {selfPaidMode && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              本次以自付 gas 模式完成（Gas Station 暫時不可用）
            </p>
          )}
          <p className="text-gray-600 text-sm">
            感謝您的熱心參與，填答完成驗證已在鏈上通過，RWD 獎勵已發放至您的錢包！
          </p>
          <div className="bg-gray-50 border rounded-lg p-4 text-left">
            <p className="text-xs text-gray-500 mb-1 font-semibold">交易雜湊（TX Hash）</p>
            <p aria-label="tx-hash" className="font-mono text-xs break-all text-blue-600">
              {txHash}
            </p>
          </div>
          <Link
            to="/"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm"
          >
            返回首頁
          </Link>
        </div>
      </main>
    )
  }

  // ── review / submitting ───────────────────────────────────────────────────
  if (phase === 'review' || phase === 'submitting') {
    return (
      <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">確認您的答案</h1>

        <div className="space-y-4 mb-8">
          {survey.questions.map((q, i) => (
            <div key={q.id} className="bg-gray-50 border rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">
                第 {i + 1} 題{q.required ? '（必填）' : '（選填）'}
              </p>
              <p className="font-medium mb-2 text-gray-800">{q.prompt}</p>
              <p className="text-blue-700 font-semibold">{getAnswerDisplay(q)}</p>
            </div>
          ))}
        </div>

        {submitError && (
          <p role="alert" className="text-red-500 mb-4 text-sm font-semibold">
            {submitError}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setPhase('filling')}
            disabled={phase === 'submitting'}
            className="border px-6 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors text-sm font-semibold"
          >
            返回修改
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={phase === 'submitting'}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-semibold flex-1"
          >
            {phase === 'submitting' ? '提交中…' : '確認提交'}
          </button>
        </div>
      </main>
    )
  }

  // ── filling ───────────────────────────────────────────────────────────────
  const isPassValid = !!activePass
    && activePass.status !== 3
    && (activePass.expiresAt === 0 || activePass.expiresAt > Date.now())

  const submitDisabled = phase === 'submitting'
    || (surveyMinTier > 0 && !isPassValid)
    || (isPassValid && activePass!.effectiveTier < surveyMinTier)

  const submitLabel = isPassValid ? '預覽答案' : '需要身分驗證才能填答'

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 text-gray-800">{survey.title}</h1>
      <p className="text-sm text-gray-500 mb-6">
        截止日期：{new Date(survey.deadline).toLocaleDateString('zh-TW')}
      </p>

      {isPassValid && (
        <span data-testid="tier-badge" className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 mb-4">
          ✓ {activePass!.effectiveTier === 0 ? 'Email 驗證'
              : activePass!.effectiveTier === 1 ? '社交帳號驗證'
              : '高階驗證'}
        </span>
      )}

      {validationError && (
        <p role="alert" className="text-red-500 mb-4 text-sm font-semibold">
          {validationError}
        </p>
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
          <fieldset key={q.id} className="border rounded-lg p-4 bg-white shadow-sm">
            <legend className="text-sm text-gray-500 px-2 font-medium">
              第 {i + 1} 題{q.required && <span className="text-red-500 ml-1">*</span>}
            </legend>
            <p className="font-medium mt-2 mb-3 text-gray-800">{q.prompt}</p>

            <div className="mt-1">
              {q.type === 'single_choice' && q.options_json && (
                <div className="space-y-2">
                  {q.options_json.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer text-gray-700">
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => handleAnswerChange(q.id, opt)}
                        aria-label={opt}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'multi_choice' && q.options_json && (
                <div className="space-y-2">
                  {q.options_json.map((opt) => {
                    const selected = (answers[q.id] as string[] | undefined) ?? []
                    return (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer text-gray-700">
                        <input
                          type="checkbox"
                          value={opt}
                          checked={selected.includes(opt)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selected, opt]
                              : selected.filter((s) => s !== opt)
                            handleAnswerChange(q.id, next)
                          }}
                          aria-label={opt}
                        />
                        {opt}
                      </label>
                    )
                  })}
                </div>
              )}

              {q.type === 'text' && (
                <textarea
                  className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  rows={3}
                  value={(answers[q.id] as string | undefined) ?? ''}
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                  aria-label={q.prompt}
                  placeholder="請輸入您的回答"
                />
              )}

              {q.type === 'scale' && (
                <div className="flex gap-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="flex flex-col items-center gap-1 cursor-pointer text-gray-700">
                      <input
                        type="radio"
                        name={q.id}
                        value={String(n)}
                        checked={answers[q.id] === String(n)}
                        onChange={() => handleAnswerChange(q.id, String(n))}
                        aria-label={String(n)}
                      />
                      {n}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </fieldset>
        ))}

        <button
          type="submit"
          disabled={submitDisabled}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold shadow-sm w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel}
        </button>
      </form>
    </main>
  )
}
