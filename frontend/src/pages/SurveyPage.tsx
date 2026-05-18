import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useCurrentAccount, useSignTransaction, useSuiClient } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { buildClaimPtb, dryRunAndSponsorTx, executeSponsoredTx } from '../lib/sponsoredTx'
import { decryptSurveyContent, encryptAnswers, base64urlToBytes } from '../lib/crypto'
import { parseFullSurveyMarkdown } from '../lib/frontmatter'

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

  // Wallet & Client integration
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutateAsync: signTransaction } = useSignTransaction()

  // SurveyPass SBT State
  const [email, setEmail] = useState('')
  const [passObjectId, setPassObjectId] = useState(() => sessionStorage.getItem('survey_pass_id') || '')
  const [subHash, setSubHash] = useState(() => sessionStorage.getItem('survey_sub_hash') || '')
  const [issuingPass, setIssuingPass] = useState(false)
  const [issuingError, setIssuingError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const surveyId: string = id

    setPhase('loading')

    async function loadSurvey() {
      try {
        const hash = window.location.hash.substring(1)

        // Fetch survey object from chain
        const obj = await suiClient.getObject({
          id: surveyId,
          options: { showContent: true },
        })

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

        setSurvey({
          id: surveyId,
          title: parsed.data.title,
          status: status === 0 ? 'ACTIVE' : 'CLOSED',
          deadline: new Date(parsed.data.deadlineMs).toISOString(),
          per_response: parsed.data.perResponse,
          vaultObjectId: vault_id,
          questions: parsed.data.questions,
        })
        setCreatorPubKey(creatorPublicKeyBytes)
        setPhase('filling')
      } catch (err: any) {
        console.error('Failed to load survey:', err)
        setSubmitError(err.message || '載入問卷失敗')
        setPhase('error')
      }
    }

    loadSurvey()
  }, [id, suiClient])

  async function handleIssuePass() {
    if (!account) {
      setIssuingError('請先連接您的錢包！')
      return
    }
    if (!email || !email.includes('@')) {
      setIssuingError('請輸入有效的 Email 格式！')
      return
    }
    setIssuingPass(true)
    setIssuingError(null)
    try {
      const res = await fetch('/api/pass/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: account.address, email }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || '發行 SurveyPass 失敗')
      }
      const data = await res.json()
      setPassObjectId(data.passObjectId)
      setSubHash(data.subHash)
      sessionStorage.setItem('survey_pass_id', data.passObjectId)
      sessionStorage.setItem('survey_sub_hash', data.subHash)
      setPhase('filling')
    } catch (err: any) {
      setIssuingError(err.message || '發行 SurveyPass 失敗，請重試')
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

    // Check if SurveyPass exists; if not, go to need_pass
    if (!passObjectId || !subHash) {
      setPhase('need_pass')
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
    if (!passObjectId || !subHash) {
      setPhase('need_pass')
      return
    }

    setPhase('submitting')
    setSubmitError(null)

    try {
      // 1. Encrypt answers using ECIES
      if (!creatorPubKey) {
        throw new Error('未載入問卷建立者金鑰，無法加密答案')
      }
      const encryptedAnswersBytes = await encryptAnswers(JSON.stringify(answers), creatorPubKey)
      const encryptedAnswersHex = Array.from(encryptedAnswersBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      // 2. Build Claim PTB
      const tx = buildClaimPtb({
        packageId: import.meta.env.VITE_PACKAGE_ID ?? '0x0ea99e456f8bd47d42dbf1b2d4a27cbfc559deab28255974d0266906bb053787',
        vaultId: survey.vaultObjectId,
        passId: passObjectId,
        subHash,
        encryptedAnswers: encryptedAnswersHex,
      })

      // 3. Request Gas Sponsorship from backend proxy (dry-run pre-flight runs inside)
      const { sponsoredTxBytes, sponsorSignature } = await dryRunAndSponsorTx({
        tx,
        senderAddress: account.address,
        client: suiClient as any,
        backendUrl: '',
      })

      // 4. Prompt user to sign the sponsored transaction block
      const sponsoredTx = Transaction.from(sponsoredTxBytes)
      const { signature: userSignature } = await signTransaction({
        transaction: sponsoredTx as any,
      })

      // 5. Broadcast to Sui Network
      const txResult = await executeSponsoredTx({
        client: suiClient as any,
        sponsoredTxBytes,
        userSignature,
        sponsorSignature,
      })

      const digest = txResult.digest

      // 6. Submit answers and tx hash to backend DB
      const res = await fetch(`/surveys/${id}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subHash,
          suiAddress: account.address,
          answersJson: answers,
          claimedTx: digest,
        }),
      })

      if (!res.ok) {
        throw new Error(await res.text())
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
        <div className="bg-white border rounded-xl p-8 max-w-md w-full shadow-lg space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800">首次填答，請先領取通行證</h2>
            <p className="text-sm text-gray-500 mt-2">
              SurveyPass 是您的鏈上隱私參與憑證 (SBT)，我們已為您全額代付 Gas，只需輸入 Email 即可免費自動取得。
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                輸入 Email 地址以發行
              </label>
              <input
                id="email"
                type="email"
                placeholder="respondent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {issuingError && (
              <p role="alert" className="text-red-500 text-xs font-medium">
                {issuingError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPhase('filling')}
                className="w-1/3 border py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                返回
              </button>
              <button
                type="button"
                onClick={() => void handleIssuePass()}
                disabled={issuingPass}
                className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                {issuingPass ? '自動代簽領取中...' : '確認免費領取'}
              </button>
            </div>
          </div>
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
  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 text-gray-800">{survey.title}</h1>
      <p className="text-sm text-gray-500 mb-6">
        截止日期：{new Date(survey.deadline).toLocaleDateString('zh-TW')}
      </p>

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
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold shadow-sm w-full sm:w-auto"
        >
          預覽答案
        </button>
      </form>
    </main>
  )
}
