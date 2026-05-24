import { useState, useEffect } from 'react'
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit'
import { IdCard, AlertTriangle, Check } from 'lucide-react'
import { Transaction } from '@mysten/sui/transactions'
import { buildMintPassPtb, buildUpdatePassCredentialPtb, buildDeletePassPtb } from '../lib/ptb'
import { fetchActivePass, SurveyPassData } from '../lib/surveyPass'
import { translateMoveAbort } from '../lib/moveAbort'
import { useLanguage } from '../context/LanguageContext'

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16)
  }
  return bytes
}

const content = {
  ZH: {
    title: 'SurveyPass 真人認證',
    subtitle: '透過去中心化身份驗證（KYC），取得專屬 SurveyPass。解鎖高等級問卷，防範女巫攻擊與虛假填答。',
    connectWalletTitle: '請先連接錢包',
    connectWalletDesc: '要鑄造、更新或查看您的 SurveyPass，您需要連接您的 Sui 錢包以進行簽章。',
    txDigestLabel: '交易哈希 (Digest)：',
    txSuccess: '執行成功',
    passStatusTitle: '您的 SurveyPass 狀態',
    loadingPass: '正在查詢鏈上憑證...',
    trustTier: '有效等級 (Trust Tier)',
    certSource: '認證來源',
    noPass: '無憑證',
    ownerAddress: '憑證對象 (Owner Address)',
    expires: '有效期限 (Expires)',
    neverExpire: '永不過期',
    noPassTitle: '您尚未擁有 SurveyPass',
    noPassDesc: '您需要至少經過一種途徑（如 Email OTP）驗證以向 BFF 取得憑證 Ticket，並在鏈上鑄造您的 SurveyPass。',
    gdprTitle: 'GDPR 隱私與憑證管理',
    gdprDesc: '本系統設計遵循 GDPR 隱私標準。已被吊銷的憑證可由 Owner 一鍵銷毀。一經銷毀，鏈上所有 PII 映射與憑證欄位將被完全移除。',
    btnDeletePass: '完全銷毀 (Delete Pass)',
    btnRevokePass: '模擬 Admin 吊銷 (Revoke)',
    revokeNotice: '* 註：必須先執行「模擬 Admin 吊銷」將 Status 變為 Revoked 後，Owner 方能點擊「完全銷毀」。',
    upgradeTitle: '憑證更新與升級',
    mintTitle: '申請全新 SurveyPass',
    emailVerification: '電子郵件驗證 (Email Verification)',
    sendingOtp: '正在發送驗證碼...',
    btnGetOtp: '獲取驗證碼 →',
    otpCodeLabel: '驗證碼 (6 位數字)',
    devTip: '開發者提示（免登收信）：輸入 {code} 即可。',
    btnBack: '返回修改',
    submitting: '提交中...',
    btnUpdatePass: '更新憑證',
    btnVerifyAndMint: '驗證並鑄造',
    footer: 'SurveySui 去中心化真人憑證認證中心',
    selfReport: '自我申報 (Self Report)',
    emailOtp: '郵件認證 (Email OTP)',
    socialAuth: '社群媒體 (OAuth/Social)',
    selfProtocol: '自我協議 (Self Protocol)',
    worldId: 'World ID',
    unknown: '未知',
    revokeSuccess: 'SurveyPass 吊銷成功（限 Admin 發送）',
    deleteSuccess: 'SurveyPass 已成功從鏈上銷毀，個人隱私資料已完全移除！',
    revokeFailed: '吊銷失敗（請確認您是否使用 Admin 錢包）',
    deleteFailed: '只有已被吊銷 (Revoked) 的 Pass 才能被完全銷毀',
    txFailed: '交易執行失敗',
    authFailed: '認證或交易發送失敗',
    upgradeSuccess: '憑證更新成功！',
    mintSuccess: 'SurveyPass 鑄造成功！',
    destroyFailed: '銷毀失敗',
    ptbBuildFailed: 'PTB 建構失敗',
    emailInvalid: '請輸入有效的電子郵件地址',
    otpSentSuccess: '驗證碼已發送，請檢查您的信箱',
    otpSendFailed: '發送 OTP 失敗',
    otpRequestError: '發送請求時出錯',
    otp6Digits: '請輸入 6 位數驗證碼',
    errVerifyFailed: '驗證失敗',
  },
  EN: {
    title: 'SurveyPass Identity Center',
    subtitle: 'Claim your unique SurveyPass through decentralized identity verification (KYC) to unlock higher-tier surveys and prevent Sybil attacks.',
    connectWalletTitle: 'Please Connect Wallet First',
    connectWalletDesc: 'To mint, update, or view your SurveyPass, connect your Sui wallet for signature verification.',
    txDigestLabel: 'Transaction Digest:',
    txSuccess: 'Success',
    passStatusTitle: 'Your SurveyPass Status',
    loadingPass: 'Querying credential on chain...',
    trustTier: 'Trust Tier',
    certSource: 'Verification Source',
    noPass: 'No Credential',
    ownerAddress: 'Owner Address',
    expires: 'Expires',
    neverExpire: 'Never Expires',
    noPassTitle: 'No SurveyPass Found',
    noPassDesc: 'You need at least one verification method (e.g. Email OTP) to get a ticket from the BFF and mint your SurveyPass on chain.',
    gdprTitle: 'GDPR Privacy & Credential Management',
    gdprDesc: 'This system follows GDPR privacy standards. Revoked passes can be deleted permanently by the owner. Once deleted, all PII mappings and credential fields will be removed.',
    btnDeletePass: 'Delete Pass (GDPR)',
    btnRevokePass: 'Simulate Admin Revocation',
    revokeNotice: '* Note: The status must be Revoked before the owner can delete the pass.',
    upgradeTitle: 'Update & Upgrade Pass',
    mintTitle: 'Claim New SurveyPass',
    emailVerification: 'Email Verification',
    sendingOtp: 'Sending code...',
    btnGetOtp: 'Get Code →',
    otpCodeLabel: 'OTP Code (6 digits)',
    devTip: 'Dev Tip: Enter {code} to verify.',
    btnBack: 'Go Back',
    submitting: 'Submitting...',
    btnUpdatePass: 'Update Pass',
    btnVerifyAndMint: 'Verify & Mint',
    footer: 'SurveySui Decentralized Identity Center',
    selfReport: 'Self Report',
    emailOtp: 'Email OTP',
    socialAuth: 'Social Media (OAuth)',
    selfProtocol: 'Self Protocol',
    worldId: 'World ID',
    unknown: 'Unknown',
    revokeSuccess: 'SurveyPass Revoked (Admin only)',
    deleteSuccess: 'SurveyPass deleted from chain. All PII has been removed!',
    revokeFailed: 'Revocation failed (Check if you are using the admin wallet)',
    deleteFailed: 'Only revoked passes can be deleted',
    txFailed: 'Transaction failed',
    authFailed: 'Verification or transaction failed',
    upgradeSuccess: 'Pass updated successfully!',
    mintSuccess: 'SurveyPass minted successfully!',
    destroyFailed: 'Failed to destroy pass',
    ptbBuildFailed: 'Failed to build transaction',
    emailInvalid: 'Please enter a valid email address',
    otpSentSuccess: 'Verification code sent. Please check your inbox.',
    otpSendFailed: 'Failed to send OTP code',
    otpRequestError: 'Error sending request',
    otp6Digits: 'Please enter a 6-digit verification code',
    errVerifyFailed: 'Verification failed',
  }
}

export default function AuthPage() {
  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const suiClient = useSuiClient()
  const { lang } = useLanguage()
  const t = content[lang]

  const packageId = import.meta.env.VITE_PACKAGE_ID ?? ''
  const registryId =
    import.meta.env.VITE_NULLIFIER_REGISTRY_ID ?? import.meta.env.VITE_PASS_REGISTRY_ID ?? ''
  const configId = import.meta.env.VITE_ISSUER_CONFIG_ID ?? ''

  // Local component states
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [step, setStep] = useState<'input' | 'verify'>('input')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [debugOtp, setDebugOtp] = useState<string | null>(null)
  const [txDigest, setTxDigest] = useState<string | null>(null)

  const [activePass, setActivePass] = useState<SurveyPassData | null>(null)
  const [isPassLoading, setIsPassLoading] = useState(false)

  const fetchPass = async () => {
    if (!account?.address || !registryId) {
      setActivePass(null)
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

  // Step 1: Request OTP via BFF
  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      setErrorMsg(t.emailInvalid)
      return
    }

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    setDebugOtp(null)

    try {
      const res = await fetch('/auth/email/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t.otpSendFailed)
      }

      setStep('verify')
      setSuccessMsg(t.otpSentSuccess)
      if (data.code) {
        setDebugOtp(data.code) // Dev mode auto-suggest
      }
    } catch (err: any) {
      setErrorMsg(err.message || t.otpRequestError)
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP and Mint/Update Pass
  async function handleVerifyAndMint(e: React.FormEvent) {
    e.preventDefault()
    if (!otpCode || otpCode.length !== 6) {
      setErrorMsg(t.otp6Digits)
      return
    }
    if (!account) return

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      // 1. BFF verify OTP and sign ticket
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
        throw new Error(data.error || t.errVerifyFailed || '驗證失敗')
      }

      // Convert hex strings from BFF back to Uint8Array
      const nullifierHash = hexToBytes(data.nullifier_hash)
      const commitment = new Uint8Array(0)
      const bffSig = hexToBytes(data.bff_sig)

      // 2. Build and sign transaction block on-chain
      let tx
      if (activePass) {
        tx = buildUpdatePassCredentialPtb({
          packageId,
          passId: activePass.objectId,
          registryId,
          configId,
          source: data.source,
          nullifierHash,
          commitment,
          expiresAt: data.expires_at,
          bffSig,
        })
      } else {
        tx = buildMintPassPtb({
          packageId,
          registryId,
          configId,
          owner: account.address,
          source: data.source,
          nullifierHash,
          commitment,
          expiresAt: data.expires_at,
          bffSig,
        })
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: async (result) => {
            setTxDigest(result.digest)
            setSuccessMsg(activePass ? t.upgradeSuccess : t.mintSuccess)
            setEmail('')
            setOtpCode('')
            setStep('input')
            setDebugOtp(null)
            try {
              await suiClient.waitForTransaction({
                digest: result.digest,
                options: { showEffects: true },
              })
            } catch (e) {
               console.error(e)
            }
            await fetchPass()
          },
          onError: (err) => {
            const friendly = translateMoveAbort(err.message)
            setErrorMsg(friendly || err.message || t.txFailed)
          },
        }
      )
    } catch (err: any) {
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || t.authFailed)
    } finally {
      setLoading(false)
    }
  }

  // Owner action: Delete Pass (Only allowed when Status is Revoked)
  function handleDeletePass() {
    if (!activePass || !account) return
    if (activePass.status !== 3) {
      setErrorMsg(t.deleteFailed)
      return
    }

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const tx = buildDeletePassPtb({
        packageId,
        registryId,
        passId: activePass.objectId,
      })

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: async (result) => {
            setTxDigest(result.digest)
            setSuccessMsg(t.deleteSuccess)
            try {
              await suiClient.waitForTransaction({
                digest: result.digest,
                options: { showEffects: true },
              })
            } catch (e) {
              console.error(e)
            }
            await fetchPass()
          },
          onError: (err) => {
            const friendly = translateMoveAbort(err.message)
            setErrorMsg(friendly || err.message || t.destroyFailed)
          },
        }
      )
    } catch (err: any) {
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || t.ptbBuildFailed)
    } finally {
      setLoading(false)
    }
  }

  // Admin action (Simulated): Revoke Pass
  function handleRevokePass() {
    if (!activePass || !account) return

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const transaction = new Transaction()
      transaction.moveCall({
        target: `${packageId}::survey_pass::revoke_pass`,
        arguments: [transaction.object(activePass.objectId), transaction.object(configId)],
      })

      signAndExecute(
        { transaction: transaction as any },
        {
          onSuccess: async (result) => {
            setTxDigest(result.digest)
            setSuccessMsg(t.revokeSuccess)
            try {
              await suiClient.waitForTransaction({
                digest: result.digest,
                options: { showEffects: true },
              })
            } catch (e) {
              console.error(e)
            }
            await fetchPass()
          },
          onError: (err) => {
            const friendly = translateMoveAbort(err.message)
            setErrorMsg(friendly || err.message || t.revokeFailed)
          },
        }
      )
    } catch (err: any) {
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || t.revokeFailed)
    } finally {
      setLoading(false)
    }
  }

  const getSourceLabel = (src: number) => {
    switch (src) {
      case 1:
        return t.selfReport
      case 2:
        return t.emailOtp
      case 3:
        return t.socialAuth
      case 4:
        return t.selfProtocol
      case 5:
        return t.worldId
      default:
        return t.unknown
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 min-h-screen flex flex-col justify-between text-slate-800 dark:text-neutral-200 animate-fadeIn transition-colors">
      <div className="w-full">
        {/* Title Header */}
        <div className="border-b pb-6 mb-8 border-slate-100 dark:border-neutral-850">
          <div>
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl text-slate-900 dark:text-white bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
              {t.title}
            </h1>
            <p className="mt-2 text-base sm:text-lg text-slate-600 dark:text-neutral-350 font-normal">
              {t.subtitle}
            </p>
          </div>
        </div>

        {/* Global Warnings & Success States */}
        <div className="space-y-4 mb-8">
          {!account && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 shadow-sm text-center">
              <h3 className="text-lg font-normal text-amber-800 dark:text-amber-400 mb-2">{t.connectWalletTitle}</h3>
              <p className="text-sm text-amber-700 dark:text-amber-400 mb-4 max-w-md mx-auto font-normal">
                {t.connectWalletDesc}
              </p>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="alert-success space-y-2 flex-col items-start"
            >
              <h3 className="text-base font-semibold flex items-center gap-2 text-emerald-900 dark:text-emerald-400">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300">
                  <Check size={14} />
                </span>
                {t.txSuccess}
              </h3>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 font-normal">{successMsg}</p>
              {txDigest && (
                <div className="bg-white/80 dark:bg-neutral-950/40 border border-emerald-100 dark:border-emerald-900/30 rounded-lg p-3 text-xs font-mono break-all mt-2 w-full text-left text-emerald-800 dark:text-emerald-350 font-normal">
                  <span className="font-semibold text-emerald-750 dark:text-emerald-405">{t.txDigestLabel}</span>
                  {txDigest}
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="alert-error text-sm font-normal break-all flex items-center gap-1.5"
            >
              <AlertTriangle size={14} className="shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {account && (
          <div className="grid gap-8 md:grid-cols-12">
            {/* Left Column: User Pass Information */}
            <div className="md:col-span-7 space-y-6">
              <h2 className="text-h2">{t.passStatusTitle}</h2>

              {isPassLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-slate-400 dark:text-neutral-500">{t.loadingPass}</p>
                </div>
              ) : activePass ? (
                /* Card UI */
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-8 shadow-xl border border-indigo-900 flex flex-col justify-between min-h-80 transition-transform duration-300 hover:scale-[1.01]">
                  {/* Glowing background decor */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                  <div className="space-y-6 z-10">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-normal uppercase tracking-widest text-indigo-400">
                          SURVEYSUI IDENTITY
                        </span>
                        <h3 className="text-2xl font-normal mt-1 tracking-tight">SurveyPass V2</h3>
                      </div>
                      <span
                        className={`text-xs font-normal px-3 py-1.5 rounded-full ${
                          activePass.status === 0
                            ? 'bg-emerald-500/20 dark:bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 dark:bg-rose-500/10 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {activePass.status === 0 ? '● Active' : '● Revoked'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-indigo-300 block uppercase tracking-wider font-normal">
                          {t.trustTier}
                        </span>
                        <span className="text-3xl font-normal text-white">
                          Tier {activePass.effectiveTier}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-indigo-300 block uppercase tracking-wider font-normal">
                          {t.certSource}
                        </span>
                        <span className="text-sm font-normal text-white">
                          {activePass.credentialSources.length > 0
                            ? activePass.credentialSources
                                .map((src: number) => getSourceLabel(src))
                                .join(', ')
                            : t.noPass}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-4 text-xs text-indigo-200 z-10">
                    <div>
                      <span className="block font-normal">{t.ownerAddress}</span>
                      <span className="font-mono text-white select-all">{activePass.objectId}</span>
                    </div>
                    <div className="sm:text-right">
                      <span className="block font-normal">{t.expires}</span>
                      <span className="text-white font-normal">
                        {activePass.expiresAt > 0
                          ? new Date(activePass.expiresAt).toLocaleString()
                          : t.neverExpire}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* No Pass State */
                <div className="bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-neutral-800/80 rounded-3xl p-8 text-center shadow-inner">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <IdCard size={32} />
                  </div>
                  <h3 className="text-h3">{t.noPassTitle}</h3>
                  <p className="text-sm text-slate-500 dark:text-neutral-400 mt-2 max-w-sm mx-auto font-normal">
                    {t.noPassDesc}
                  </p>
                </div>
              )}

              {/* GDPR Controls */}
              {activePass && (
                <div className="bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-neutral-800/80 rounded-3xl p-6 space-y-4 shadow-sm">
                  <h3 className="text-lg font-normal text-slate-900 dark:text-white flex items-center gap-2">
                    {t.gdprTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-neutral-400 leading-relaxed font-normal">
                    {t.gdprDesc}
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={loading || activePass.status !== 3}
                      onClick={handleDeletePass}
                      className={activePass.status === 3 ? 'btn-danger' : 'btn-secondary'}
                    >
                      {t.btnDeletePass}
                    </button>

                    <button
                      type="button"
                      disabled={loading || activePass.status === 3}
                      onClick={handleRevokePass}
                      className={
                        activePass.status === 0
                          ? 'bg-amber-700 hover:bg-amber-600 text-white font-normal px-5 py-2 rounded-xl transition-all text-base shadow-sm dark:bg-amber-800 dark:hover:bg-amber-600 dark:text-neutral-200'
                          : 'btn-secondary'
                      }
                    >
                      {t.btnRevokePass}
                    </button>
                  </div>
                  {activePass.status !== 3 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-normal">
                      {t.revokeNotice}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Verification & Update Flow */}
            <div className="md:col-span-5">
              <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800/80 rounded-3xl p-6 shadow-xl space-y-6 transition-colors">
                <h3 className="text-h2">
                  {activePass ? t.upgradeTitle : t.mintTitle}
                </h3>

                {step === 'input' ? (
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    <div>
                      <label
                        htmlFor="email"
                        className="form-label"
                      >
                        {t.emailVerification}
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="example@email.com"
                        className="form-input"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary w-full flex items-center justify-center"
                    >
                      {loading ? t.sendingOtp : t.btnGetOtp}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyAndMint} className="space-y-4">
                    <div>
                      <span className="form-label">
                        {t.otpCodeLabel}
                      </span>
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        className="form-input text-center font-mono font-normal tracking-widest"
                        required
                      />
                      {debugOtp && (
                        <p className="text-xs text-blue-700 dark:text-blue-400 mt-2 bg-blue-50/50 dark:bg-blue-900/20 p-2.5 rounded-xl border border-blue-105 dark:border-blue-900/30 font-normal leading-relaxed">
                          {t.devTip.replace('{code}', debugOtp)}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStep('input')
                          setDebugOtp(null)
                        }}
                        className="btn-secondary flex-1"
                      >
                        {t.btnBack}
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white py-3 px-4 rounded-xl text-sm font-semibold transition-all"
                      >
                        {loading ? t.submitting : (activePass ? t.btnUpdatePass : t.btnVerifyAndMint)}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-16 text-center text-xs text-slate-400 dark:text-neutral-500 font-medium transition-colors">
        {t.footer} &copy; {new Date().getFullYear()}
      </footer>
    </main>
  )
}
