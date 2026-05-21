import { useState, useEffect } from 'react'
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import {
  buildMintPassPtb,
  buildUpdatePassCredentialPtb,
  buildDeletePassPtb,
} from '../lib/ptb'
import { fetchActivePass, SurveyPassData } from '../lib/surveyPass'
import { translateMoveAbort } from '../lib/moveAbort'

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16)
  }
  return bytes
}

export default function AuthPage() {
  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const suiClient = useSuiClient()

  const packageId = import.meta.env.VITE_PACKAGE_ID ?? ''
  const registryId = import.meta.env.VITE_NULLIFIER_REGISTRY_ID ?? import.meta.env.VITE_PASS_REGISTRY_ID ?? ''
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
      setErrorMsg('請輸入有效的電子郵件地址')
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
        throw new Error(data.error || '發送 OTP 失敗')
      }

      setStep('verify')
      setSuccessMsg('驗證碼已發送，請檢查您的信箱')
      if (data.code) {
        setDebugOtp(data.code) // Dev mode auto-suggest
      }
    } catch (err: any) {
      setErrorMsg(err.message || '發送請求時出錯')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP and Mint/Update Pass
  async function handleVerifyAndMint(e: React.FormEvent) {
    e.preventDefault()
    if (!otpCode || otpCode.length !== 6) {
      setErrorMsg('請輸入 6 位數驗證碼')
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
        throw new Error(data.error || '驗證失敗')
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
            setSuccessMsg(activePass ? '憑證更新成功！' : 'SurveyPass 鑄造成功！')
            setEmail('')
            setOtpCode('')
            setStep('input')
            setDebugOtp(null)
            try {
              await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } })
            } catch (e) {
              console.error(e)
            }
            await fetchPass()
          },
          onError: (err) => {
            const friendly = translateMoveAbort(err.message)
            setErrorMsg(friendly || err.message || '交易執行失敗')
          },
        },
      )
    } catch (err: any) {
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || '認證或交易發送失敗')
    } finally {
      setLoading(false)
    }
  }

  // Owner action: Delete Pass (Only allowed when Status is Revoked)
  function handleDeletePass() {
    if (!activePass || !account) return
    if (activePass.status !== 3) {
      setErrorMsg('只有已被吊銷 (Revoked) 的 Pass 才能被完全銷毀')
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
            setSuccessMsg('SurveyPass 已成功從鏈上銷毀，個人隱私資料已完全移除！')
            try {
              await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } })
            } catch (e) {
              console.error(e)
            }
            await fetchPass()
          },
          onError: (err) => {
            const friendly = translateMoveAbort(err.message)
            setErrorMsg(friendly || err.message || '銷毀失敗')
          },
        },
      )
    } catch (err: any) {
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || 'PTB 建構失敗')
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
        arguments: [
          transaction.object(activePass.objectId),
          transaction.object(configId),
        ],
      })

      signAndExecute(
        { transaction: transaction as any },
        {
          onSuccess: async (result) => {
            setTxDigest(result.digest)
            setSuccessMsg('SurveyPass 吊銷成功（限 Admin 發送）')
            try {
              await suiClient.waitForTransaction({ digest: result.digest, options: { showEffects: true } })
            } catch (e) {
              console.error(e)
            }
            await fetchPass()
          },
          onError: (err) => {
            const friendly = translateMoveAbort(err.message)
            setErrorMsg(friendly || err.message || '吊銷失敗（請確認您是否使用 Admin 錢包）')
          },
        },
      )
    } catch (err: any) {
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || '吊銷失敗')
    } finally {
      setLoading(false)
    }
  }

  const getSourceLabel = (src: number) => {
    switch (src) {
      case 1: return '自我申報 (Self Report)'
      case 2: return '郵件認證 (Email OTP)'
      case 3: return '社群媒體 (OAuth/Social)'
      case 4: return '自我協議 (Self Protocol)'
      case 5: return 'World ID'
      default: return '未知'
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 min-h-screen flex flex-col justify-between text-neutral-800">
      <div className="w-full">
        {/* Title Header */}
        <div className="border-b pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              SurveyPass 真人認證
            </h1>
            <p className="mt-2 text-lg text-neutral-500">
              透過去中心化身份驗證（KYC），取得專屬 SurveyPass。解鎖高等級問卷，防範女巫攻擊與虛假填答。
            </p>
          </div>
        </div>

        {/* Global Warnings & Success States */}
        <div className="space-y-4 mb-8">
          {!account && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm text-center">
              <h3 className="text-lg font-bold text-amber-800 mb-2">請先連接錢包</h3>
              <p className="text-sm text-amber-700 mb-4 max-w-md mx-auto">
                要鑄造、更新或查看您的 SurveyPass，您需要連接您的 Sui 錢包以進行簽章。
              </p>
            </div>
          )}

          {successMsg && (
            <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-6 rounded-2xl shadow-sm space-y-2">
              <h3 className="text-base font-bold flex items-center gap-2 text-emerald-700">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 font-bold">✓</span>
                執行成功
              </h3>
              <p className="text-sm text-emerald-600">{successMsg}</p>
              {txDigest && (
                <div className="bg-white/80 border border-emerald-100 rounded-lg p-3 text-xs font-mono break-all mt-2">
                  <span className="font-semibold text-emerald-600">交易哈希 (Digest)：</span>
                  {txDigest}
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl shadow-sm text-sm font-semibold break-all">
              ⚠️ {errorMsg}
            </div>
          )}
        </div>

        {account && (
          <div className="grid gap-8 md:grid-cols-12">
            {/* Left Column: User Pass Information */}
            <div className="md:col-span-7 space-y-6">
              <h2 className="text-xl font-extrabold text-neutral-800">您的 SurveyPass 狀態</h2>

              {isPassLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-neutral-400">正在查詢鏈上憑證...</p>
                </div>
              ) : activePass ? (
                /* Card UI */
                <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-8 shadow-xl border border-indigo-900 flex flex-col justify-between min-h-80 transition-transform duration-300 hover:scale-[1.01]">
                  {/* Glowing background decor */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                  <div className="space-y-6 z-10">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-extrabold uppercase tracking-widest text-indigo-400">SURVEYSUI IDENTITY</span>
                        <h3 className="text-2xl font-black mt-1 tracking-tight">SurveyPass V2</h3>
                      </div>
                      <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                        activePass.status === 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {activePass.status === 0 ? '● Active' : '● Revoked'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-indigo-300 block uppercase tracking-wider font-bold">有效等級 (Trust Tier)</span>
                        <span className="text-3xl font-black text-white">Tier {activePass.effectiveTier}</span>
                      </div>
                      <div>
                        <span className="text-xs text-indigo-300 block uppercase tracking-wider font-bold">認證來源</span>
                        <span className="text-sm font-semibold text-white">
                          {activePass.credentialSources.length > 0
                            ? activePass.credentialSources.map((src: number) => getSourceLabel(src)).join(', ')
                            : '無憑證'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-4 text-xs text-indigo-200 z-10">
                    <div>
                      <span className="block font-medium">憑證對象 (Owner Address)</span>
                      <span className="font-mono text-white select-all">{activePass.objectId}</span>
                    </div>
                    <div className="sm:text-right">
                      <span className="block font-medium">有效期限 (Expires)</span>
                      <span className="text-white font-semibold">
                        {activePass.expiresAt > 0
                          ? new Date(activePass.expiresAt).toLocaleString()
                          : '永不過期'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* No Pass State */
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 text-center shadow-inner">
                  <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">📇</div>
                  <h3 className="text-lg font-bold text-neutral-700">您尚未擁有 SurveyPass</h3>
                  <p className="text-sm text-neutral-500 mt-2 max-w-sm mx-auto">
                    您需要至少經過一種途徑（如 Email OTP）驗證以向 BFF 取得憑證 Ticket，並在鏈上鑄造您的 SurveyPass。
                  </p>
                </div>
              )}

              {/* GDPR Controls */}
              {activePass && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-3xl p-6 space-y-4 shadow-sm">
                  <h3 className="text-lg font-bold text-neutral-800 flex items-center gap-2">
                    🛡️ GDPR 隱私與憑證管理
                  </h3>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    本系統設計遵循 GDPR 隱私標準。已被吊銷的憑證可由 Owner 一鍵銷毀。一經銷毀，鏈上所有 PII 映射與憑證欄位將被完全移除。
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={loading || activePass.status !== 3}
                      onClick={handleDeletePass}
                      className={`px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wider transition-all duration-200 ${
                        activePass.status === 3
                          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      🗑️ 完全銷毀 (Delete Pass)
                    </button>

                    <button
                      type="button"
                      disabled={loading || activePass.status === 3}
                      onClick={handleRevokePass}
                      className={`px-4 py-2.5 rounded-xl text-xs font-semibold tracking-wider transition-all duration-200 ${
                        activePass.status === 0
                          ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      🚫 模擬 Admin 吊銷 (Revoke)
                    </button>
                  </div>
                  {activePass.status !== 3 && (
                    <p className="text-[10px] text-amber-600 font-medium">
                      * 註：必須先執行「模擬 Admin 吊銷」將 Status 變為 Revoked 後，Owner 方能點擊「完全銷毀」。
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Verification & Update Flow */}
            <div className="md:col-span-5">
              <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-md space-y-6">
                <h3 className="text-xl font-extrabold text-neutral-800">
                  {activePass ? '🔄 憑證更新與升級' : '✨ 申請全新 SurveyPass'}
                </h3>

                {step === 'input' ? (
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    <div>
                      <label htmlFor="email" className="block text-xs font-bold text-neutral-500 mb-1.5 uppercase tracking-wide">
                        電子郵件驗證 (Email Verification)
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="example@email.com"
                        className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow"
                    >
                      {loading ? '正在發送驗證碼...' : '獲取驗證碼 →'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyAndMint} className="space-y-4">
                    <div>
                      <span className="block text-xs font-bold text-neutral-500 mb-1.5 uppercase tracking-wide">
                        驗證碼 (6 位數字)
                      </span>
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm text-center font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      {debugOtp && (
                        <p className="text-xs text-blue-600 mt-2 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
                          ⚙️ 開發者提示（免登收信）：輸入 <span className="font-bold font-mono text-sm">{debugOtp}</span> 即可。
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
                        className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold border border-neutral-200 hover:bg-neutral-50 transition-colors"
                      >
                        返回修改
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3 px-4 rounded-xl text-sm font-semibold hover:shadow"
                      >
                        {loading ? '提交中...' : activePass ? '更新憑證' : '驗證並鑄造'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-16 text-center text-xs text-neutral-400 font-medium">
        SurveySui 去中心化真人憑證認證中心 &copy; {new Date().getFullYear()}
      </footer>
    </main>
  )
}
