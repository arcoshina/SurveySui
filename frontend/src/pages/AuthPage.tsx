import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCurrentAccount, useSignPersonalMessage, useSuiClient } from '@mysten/dapp-kit'
import { IdCard, AlertTriangle, Check } from 'lucide-react'
import { ProviderIcon } from '../components/ProviderIcon'
import { Transaction } from '@mysten/sui/transactions'
import { fromBase64 } from '@mysten/sui/utils'
import {
  buildMintPassPtb,
  buildMintPassWithExtraCredentialsPtb,
  buildDeletePassPtb,
  buildSelfDeleteSponsoredPassPtb,
} from '../lib/ptb'
import { fetchActivePass, fetchPassCredentials, SurveyPassData, CredentialInfo } from '../lib/surveyPass'
import { translateMoveAbort } from '../lib/moveAbort'
import { useT } from '../i18n'
import { useLanguage } from '../context/LanguageContext'
import { executeTxWithFallback, executeSponsoredTx, USER_DECLINED_SELF_PAID, probeGasSponsorHealth } from '../lib/sponsoredTx'
import { ConnectButton } from '@mysten/dapp-kit'
import { useOAuthResult } from '../lib/useOAuthResult'
import { bcs } from '@mysten/sui/bcs'
import { DIRECT_OAUTH_PROVIDERS } from '../lib/authProviders'
import { useActiveSigner } from '../lib/useActiveSigner'
import type { ActiveSigner } from '../lib/useActiveSigner'
import { IDKitRequestWidget, proofOfHuman } from '@worldcoin/idkit'
import type { IDKitResult, RpContext } from '@worldcoin/idkit'
import { fetchWorldIdSignRequest, submitWorldIdProof, WorldIdError } from '../lib/worldId'

// 僅接受站內問卷路徑（/s/...），避免 open-redirect
function isSafeReturnPath(p: string | null): p is string {
  return !!p && p.startsWith('/s/') && !p.startsWith('//') && !p.startsWith('/\\')
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16)
  }
  return bytes
}

// 須與合約 survey_pass::REBATE_FEE_FLOOR 一致（MIST）。自付逃生門時附給項目方的費用下限。
const REBATE_FEE_FLOOR_MIST = 10_000_000n

// 與後端 buildDeleteAuthMessage 完全一致的授權訊息格式（用 passId 原字串，不正規化）
function buildDeleteAuthMessage(passId: string, signedTimestamp: number): string {
  return `surveysui:delete-pass:${passId}:${signedTimestamp}`
}

export default function AuthPage() {
  const account = useCurrentAccount()
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage()
  const suiClient = useSuiClient()
  const t = useT('auth')
  const { lang } = useLanguage()

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // 從問卷導向時帶回的回程路徑；存入 sessionStorage 以跨 OAuth round-trip
  const [returnTo, setReturnTo] = useState<string | null>(
    () => sessionStorage.getItem('surveysui:returnTo')
  )

  const activeSigner = useActiveSigner()
  // 有效地址：連接的 Sui 錢包
  const activeAddress = account?.address

  const packageId = import.meta.env.VITE_PACKAGE_ID ?? ''
  const registryId =
    import.meta.env.VITE_NULLIFIER_REGISTRY_ID ?? import.meta.env.VITE_PASS_REGISTRY_ID ?? ''
  const configId = import.meta.env.VITE_ISSUER_CONFIG_ID ?? ''

  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [step, setStep] = useState<'input' | 'verify'>('input')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [otpSentNotice, setOtpSentNotice] = useState<string | null>(null)
  const [canReturnToSurvey, setCanReturnToSurvey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [txDigest, setTxDigest] = useState<string | null>(null)

  const [selfPaidConfirm, setSelfPaidConfirm] = useState<{
    estSui: string
    resolve: (ok: boolean) => void
    isLimitReached?: boolean
  } | null>(null)

  const [pendingMsg, setPendingMsg] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const [activePass, setActivePass] = useState<SurveyPassData | null>(null)
  const [credentials, setCredentials] = useState<CredentialInfo[]>([])
  // 證件夾展開動畫三段：collapsed（扇形）→ converging（先收合重疊）→ expanded（往下攤開）
  const [deckPhase, setDeckPhase] = useState<'collapsed' | 'converging' | 'expanded'>('collapsed')
  const [deckHover, setDeckHover] = useState(false)
  const [isPassLoading, setIsPassLoading] = useState(false)
  const [verifyMethod, setVerifyMethod] = useState<'email' | 'social' | 'worldId'>(() => {
    const stored = sessionStorage.getItem('surveysui:verifyMethod')
    const valid = ['email', 'social', 'worldId']
    return (valid.includes(stored ?? '') ? stored : 'email') as 'email' | 'social' | 'worldId'
  })
  const [sponsorQuota, setSponsorQuota] = useState<{ count: number; maxLimit: number; remaining: number } | null>(null)

  // World ID 4.0 widget 狀態
  const [worldIdOpen, setWorldIdOpen] = useState(false)
  // 重入守衛：onSuccess 回調可能在同一 tick 內被 widget 重複觸發，loading（非同步 state）擋不住，需用 ref 同步擋
  const worldIdSubmittingRef = useRef(false)
  const oauthSubmittingRef = useRef(false)
  const [worldIdConfig, setWorldIdConfig] = useState<{
    app_id: `app_${string}`
    action: string
    rp_context: RpContext
  } | null>(null)

  const { oauthResult, clearOAuthResult } = useOAuthResult()

  const fetchPass = async () => {
    if (!activeAddress || !registryId) {
      setActivePass(null)
      setCredentials([])
      return
    }
    setIsPassLoading(true)
    try {
      const pass = await fetchActivePass(suiClient, activeAddress, registryId)
      setActivePass(pass)
      if (pass) {
        const creds = await fetchPassCredentials(suiClient, pass.objectId)
        setCredentials(creds)
      } else {
        setCredentials([])
      }
    } catch (err) {
      console.error('Failed to fetch active pass:', err)
      setActivePass(null)
      setCredentials([])
    } finally {
      setIsPassLoading(false)
    }
  }

  const fetchSponsorQuota = async () => {
    if (!activeAddress) {
      setSponsorQuota(null)
      return
    }
    try {
      const res = await fetch(`/api/gas/sponsor-count?address=${activeAddress}`)
      if (res.ok) {
        const data = await res.json()
        setSponsorQuota(data)
      }
    } catch (err) {
      console.error('Failed to fetch sponsor quota:', err)
    }
  }

  useEffect(() => {
    fetchPass()
    fetchSponsorQuota()
  }, [activeAddress, registryId])

  // 問卷導向時帶 ?returnTo=/s/:id；驗證為站內問卷路徑後存起來，鑄造成功後返回
  useEffect(() => {
    const rt = searchParams.get('returnTo')
    if (rt && isSafeReturnPath(rt)) {
      setReturnTo(rt)
      sessionStorage.setItem('surveysui:returnTo', rt)
    }
  }, [searchParams])

  // 當 OAuth callback 帶回 tickets 時自動消費（標準 Social OAuth）
  useEffect(() => {
    if (!oauthResult || !account || !activeSigner) return
    if (oauthSubmittingRef.current) return
    oauthSubmittingRef.current = true
    setPendingMsg(t.oauthSuccess)
    handleMintOrUpdateWithTickets(oauthResult.tickets, account.address, activeSigner).finally(() => {
      oauthSubmittingRef.current = false
      setPendingMsg(null)
      clearOAuthResult()
    })
  }, [oauthResult, account, activeSigner])

  // ── 共用 mint/update handler ──────────────────────────────────────────────

  async function executeAndBroadcast(tx: Transaction, owner: string, signer: ActiveSigner) {
    const fallbackResult = await executeTxWithFallback({
      tx,
      senderAddress: owner,
      client: suiClient as any,
      signAndExecute: async (t) => signer.signAndExecute(t as Transaction),
      onSelfPaidFallback: (estMist, bffError) =>
        new Promise<boolean>((resolve) => {
          const estSui = (Number(estMist) / 1_000_000_000).toFixed(4)
          const isLimitReached = bffError?.message === 'PLATFORM_SPONSOR_LIMIT_REACHED'
          setSelfPaidConfirm({ estSui, resolve, isLimitReached })
        }),
    })

    let digest: string
    if (fallbackResult.mode === 'sponsored') {
      const txBytes = fromBase64(fallbackResult.sponsoredTxBytes)
      const userSignature = await signer.signTxBytes(txBytes)
      const txResult = await executeSponsoredTx({
        client: suiClient as any,
        sponsoredTxBytes: fallbackResult.sponsoredTxBytes,
        userSignature,
        sponsorSignature: fallbackResult.sponsorSignature,
      })
      digest = txResult.digest
    } else {
      digest = fallbackResult.digest
    }

    setTxDigest(digest)
    try {
      await suiClient.waitForTransaction({ digest, options: { showEffects: true } })
    } catch (e) {
      console.error(e)
    }
  }

  async function handleMintOrUpdateWithTickets(
    tickets: Array<{
      nullifiers: string[]
      bff_sig: string
      expires_at: string
      source: number
    }>,
    owner: string,
    signer: ActiveSigner
  ) {
    if (tickets.length === 0) return
    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    setOtpSentNotice(null)
    setCanReturnToSurvey(false)

    try {
      const resolvedPass = activePass ?? (await fetchActivePass(suiClient, owner, registryId))

      if (resolvedPass) {
        // 如果 Pass 存在，我們在同一個交易中連續寫入所有 Tickets
        const tx = new Transaction()
        const passObj = tx.object(resolvedPass.objectId)
        for (const ticket of tickets) {
          const nullifiers = ticket.nullifiers.map((hex) => hexToBytes(hex))
          const commitment = new Uint8Array(0)
          const bffSig = hexToBytes(ticket.bff_sig)

          tx.moveCall({
            target: `${packageId}::survey_pass::update_pass_credential`,
            arguments: [
              passObj,
              tx.object(registryId),
              tx.object(configId),
              tx.pure.u8(ticket.source),
              tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(nullifiers.map((n) => Array.from(n))).toBytes()),
              tx.pure.vector('u8', Array.from(commitment)),
              tx.pure.u64(BigInt(ticket.expires_at).toString()),
              tx.pure.vector('u8', Array.from(bffSig)),
              tx.object('0x6'), // Clock
            ],
          })
        }

        await executeAndBroadcast(tx, owner, signer)
      } else {
        const firstTicket = tickets[0]
        const nullifiers = firstTicket.nullifiers.map((hex) => hexToBytes(hex))
        const commitment = new Uint8Array(0)
        const bffSig = hexToBytes(firstTicket.bff_sig)

        const health = await probeGasSponsorHealth({})
        const willSelfPay =
          !health.available || !health.sponsorAddress || (sponsorQuota != null && sponsorQuota.remaining <= 0)
        const depositPayer = willSelfPay ? owner : health.sponsorAddress!

        const mintBase = {
          packageId,
          registryId,
          configId,
          owner,
          depositPayer,
          source: firstTicket.source,
          nullifiers,
          commitment,
          expiresAt: firstTicket.expires_at,
          bffSig,
        }

        const tx =
          tickets.length > 1
            ? buildMintPassWithExtraCredentialsPtb({
                ...mintBase,
                extraTickets: tickets.slice(1).map((ticket) => ({
                  source: ticket.source,
                  nullifiers: ticket.nullifiers.map((hex) => hexToBytes(hex)),
                  commitment: new Uint8Array(0),
                  expiresAt: ticket.expires_at,
                  bffSig: hexToBytes(ticket.bff_sig),
                })),
              })
            : buildMintPassPtb(mintBase)

        await executeAndBroadcast(tx, owner, signer)
      }

      setSuccessMsg(resolvedPass ? t.upgradeSuccess : t.mintSuccess)

      await fetchPass()
      await fetchSponsorQuota()

      // 若由問卷導向而來，鑄造/升級成功後返回原問卷
      const rt = sessionStorage.getItem('surveysui:returnTo')
      if (isSafeReturnPath(rt)) {
        setCanReturnToSurvey(true)
        sessionStorage.removeItem('surveysui:returnTo')
        setTimeout(() => navigate(rt), 1200)
      }
    } catch (err: any) {
      if (err.message === USER_DECLINED_SELF_PAID) return
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || t.authFailed)
    } finally {
      setLoading(false)
      setPendingMsg(null)
    }
  }

  // ── Step 1: Request OTP ────────────────────────────────────────────────────

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !email.includes('@')) {
      setErrorMsg(t.emailInvalid)
      return
    }

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    setOtpSentNotice(null)
    setCanReturnToSurvey(false)

    try {
      const res = await fetch('/auth/email/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, lang }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t.otpSendFailed)
      }

      setStep('verify')
      setOtpSentNotice(t.otpSentSuccess)
    } catch (err: any) {
      setErrorMsg(err.message || t.otpRequestError)
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────

  async function handleVerifyAndMint(e: React.FormEvent) {
    e.preventDefault()
    if (!otpCode || otpCode.length !== 6) {
      setErrorMsg(t.otp6Digits)
      return
    }
    if (!account || !activeSigner) return

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    setOtpSentNotice(null)

    try {
      const res = await fetch('/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode, owner: account.address }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t.errVerifyFailed || '驗證失敗')
      }

      // data.nullifiers 是 hex 陣列
      await handleMintOrUpdateWithTickets([data], account.address, activeSigner)

      setEmail('')
      setOtpCode('')
      setStep('input')
    } catch (err: any) {
      if (err.message === USER_DECLINED_SELF_PAID) return
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || t.authFailed)
    } finally {
      setLoading(false)
    }
  }

  // ── Social OAuth ──────────────────────────────────────────────────────────

  function handleSocialLogin(providerId: string) {
    if (!account) return
    window.location.href = `/auth/${providerId}/authorize?owner=${account.address}`
  }

  // ── World ID 4.0 (Tier 2, Orb only) ───────────────────────────────────────

  // Step 1: 向 BFF 取 RP 簽名 context，再開啟 IDKit widget
  async function handleWorldIdStart() {
    if (!account) {
      setErrorMsg(t.worldIdConnectFirst)
      return
    }
    setErrorMsg(null)
    setSuccessMsg(null)
    setPendingMsg(t.worldIdVerifying)
    try {
      const cfg = await fetchWorldIdSignRequest()
      setWorldIdConfig(cfg)
      setWorldIdOpen(true)
    } catch (err: any) {
      setErrorMsg(err?.message || t.worldIdError)
    } finally {
      setPendingMsg(null)
    }
  }

  // Step 2: widget 驗證成功 → 把 proof payload 交回 BFF 驗證並鑄造
  async function handleWorldIdSuccess(result: IDKitResult) {
    if (!account || !activeSigner) return
    // 重入守衛：避免回調重複觸發導致 mint 流程跑兩次（簽兩次）
    if (worldIdSubmittingRef.current) return
    worldIdSubmittingRef.current = true
    // 進場立刻關閉 widget，避免 onSuccess 再次發射（雙保險）
    setWorldIdOpen(false)
    setPendingMsg(t.worldIdMinting)
    try {
      const ticket = await submitWorldIdProof(account.address, result)
      await handleMintOrUpdateWithTickets([ticket], account.address, activeSigner)
    } catch (err: any) {
      if (err.message === USER_DECLINED_SELF_PAID) return
      if (err instanceof WorldIdError) {
        setErrorMsg(err.code === 'orb_required' ? t.worldIdOrbRequired : err.message || t.worldIdError)
        return
      }
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || t.worldIdError)
    } finally {
      worldIdSubmittingRef.current = false
      setPendingMsg(null)
    }
  }

  // ── Pass Management ───────────────────────────────────────────────────────

  // 自付鑄造的 Pass（deposit_payer == owner）：使用者自付 delete_pass，拿回自己的押金
  async function deleteSelfFundedPass() {
    if (!activePass || !activeSigner) return
    const tx = buildDeletePassPtb({
      packageId,
      registryId,
      passId: activePass.objectId,
    })
    const { digest } = await activeSigner.signAndExecute(tx as Transaction)
    setTxDigest(digest)
    setSuccessMsg(t.deleteSuccess)
    try {
      await suiClient.waitForTransaction({ digest, options: { showEffects: true } })
    } catch (e) {
      console.error(e)
    }
    await fetchPass()
  }

  // 代付鑄造的 Pass（deposit_payer == sponsor）：請後端以 admin 代為刪除（免 gas，返還回項目方）。
  // 後端不可用時，提供自付逃生門：自付 + 附 ≥ 儲存返還 的費用回項目方（無利可圖）。
  async function deleteSponsoredPass() {
    if (!activePass || !activeSigner) return
    const passId = activePass.objectId
    const signedTimestamp = Date.now()
    const message = buildDeleteAuthMessage(passId, signedTimestamp)
    const { signature } = await signPersonalMessage({
      message: new TextEncoder().encode(message),
    })

    let res: Response
    try {
      res = await fetch('/api/pass/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passId, signedTimestamp, signature }),
      })
    } catch {
      // 網路層失敗 → 視為代付不可用，提供逃生門
      return offerEscapeHatch()
    }

    if (res.ok) {
      const data = await res.json()
      setTxDigest(data.digest)
      setSuccessMsg(t.deleteSuccess)
      try {
        await suiClient.waitForTransaction({ digest: data.digest, options: { showEffects: true } })
      } catch (e) {
        console.error(e)
      }
      await fetchPass()
      return
    }

    // sponsor 金鑰未設定 / 餘額不足等 → 代付不可用 → 逃生門
    if (res.status === 503) {
      return offerEscapeHatch()
    }
    const data = await res.json().catch(() => ({}))
    setErrorMsg(translateMoveAbort(data?.message) || data?.message || t.destroyFailed)
  }

  // 自付逃生門：使用者自付刪除代付 Pass，附 REBATE_FEE_FLOOR 費用回項目方
  async function offerEscapeHatch() {
    if (!activePass || !activeSigner) return
    const credentialsCount = BigInt(activePass.credentialSources?.length ?? 1)
    const dynamicFeeMist = REBATE_FEE_FLOOR_MIST * (1n + credentialsCount)
    const estSui = (Number(dynamicFeeMist) / 1_000_000_000).toFixed(4)
    const ok = window.confirm(t.deleteEscapeHatchPrompt(estSui))
    if (!ok) {
      setErrorMsg(t.deleteSponsorUnavailable)
      return
    }
    const tx = buildSelfDeleteSponsoredPassPtb({
      packageId,
      registryId,
      passId: activePass.objectId,
      feeMist: dynamicFeeMist,
    })
    const { digest } = await activeSigner.signAndExecute(tx as Transaction)
    setTxDigest(digest)
    setSuccessMsg(t.deleteSuccess)
    try {
      await suiClient.waitForTransaction({ digest, options: { showEffects: true } })
    } catch (e) {
      console.error(e)
    }
    await fetchPass()
  }

  async function handleDeletePass() {
    if (!activePass || !activeSigner) return

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    try {
      const sponsorAddr = activePass.depositPayer?.toLowerCase()
      const ownerAddr = activePass.owner?.toLowerCase()
      // deposit_payer == owner → 自付鑄造，使用者自刪；否則為代付鑄造，走後端代刪
      if (sponsorAddr && ownerAddr && sponsorAddr === ownerAddr) {
        await deleteSelfFundedPass()
      } else {
        await deleteSponsoredPass()
      }
    } catch (err: any) {
      const friendly = translateMoveAbort(err.message)
      setErrorMsg(friendly || err.message || t.destroyFailed)
    } finally {
      setLoading(false)
    }
  }

  const getSourceLabel = (src: number) => {
    switch (src) {
      case 1: return t.selfReport
      case 2: return t.emailOtp
      case 3: return t.socialAuth // 舊資料／未知 provider 的泛稱
      case 6: return 'Google'     // SRC_SOCIAL_GOOGLE（品牌名不翻譯）
      case 7: return 'GitHub'     // SRC_SOCIAL_GITHUB
      case 4: return t.selfProtocol
      case 5: return t.worldId
      default: return t.unknown
    }
  }

  // 將毫秒時間戳格式化為「日期 / 時間 + 時區」兩行；0 = 永不過期。
  const formatExpiry = (ms: number) => {
    if (!ms || ms <= 0) {
      return { dateStr: t.neverExpire, timeStr: '' }
    }
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const offsetMin = -d.getTimezoneOffset()
    const sign = offsetMin >= 0 ? '+' : '-'
    const oh = Math.floor(Math.abs(offsetMin) / 60)
    const om = Math.abs(offsetMin) % 60
    const tz = om === 0 ? `UTC${sign}${oh}` : `UTC${sign}${oh}:${pad(om)}`
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${tz}`
    return { dateStr, timeStr }
  }

  // 證件夾內各憑證，依 Tier 降序（平手再以到期時間遠者優先）排序，供扇形堆疊與展開列表共用。
  const sortedCredentials = [...credentials].sort(
    (a, b) => b.tier - a.tier || b.expiresAt - a.expiresAt
  )

  // 單張通行證卡片（證件夾 = 多張此卡堆疊）。per-credential 與聚合 fallback 共用此 shell。
  const renderPassCard = (params: {
    tier: number
    expiresAt: number
    sourceText: string
    isExpired: boolean
    showObjectId?: boolean
    onCardClick?: () => void
    bgClass?: string
  }) => {
    const { tier, expiresAt, sourceText, isExpired, showObjectId, onCardClick, bgClass } = params
    const isRevoked = activePass?.status === 3
    const badgeClass = isRevoked
      ? 'bg-rose-500/20 dark:bg-rose-500/10 text-rose-300 border border-rose-500/30'
      : isExpired
        ? 'bg-amber-500/20 dark:bg-amber-500/10 text-amber-300 border border-amber-500/30'
        : 'bg-emerald-500/20 dark:bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
    const label = isRevoked ? t.statusRevoked : isExpired ? t.statusExpired : t.statusActive
    const { dateStr, timeStr } = formatExpiry(expiresAt)
    // 過期憑證：整卡灰階淡化，Tier 加刪除線
    const dimClass = isExpired && !isRevoked ? 'grayscale opacity-70' : ''
    return (
      <div
        onClick={onCardClick}
        className={`relative overflow-hidden ${bgClass ?? 'bg-gradient-to-br from-slate-900 to-indigo-950'} text-white rounded-3xl p-6 flex flex-col justify-between w-112 h-70 shrink-0 ${onCardClick ? 'cursor-pointer' : ''} ${dimClass}`}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <div className="space-y-4 z-10">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-sm font-normal uppercase tracking-widest text-indigo-400">
                SurveyPass IDENTITY
              </span>
              <h3 className="text-2xl font-normal mt-1 tracking-tight">SurveySui</h3>
            </div>
            <span className={`text-xs font-normal px-3 py-1.5 rounded-full ${badgeClass}`}>
              {label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-indigo-300 block uppercase tracking-wider font-normal">{t.trustTier}</span>
              <span className={`text-2xl font-normal text-indigo-200 ${isExpired && !isRevoked ? 'line-through decoration-2' : ''}`}>Tier {tier}</span>
            </div>
            <div>
              <span className="text-sm text-indigo-300 block uppercase tracking-wider font-normal">{t.expires}</span>
              {timeStr ? (
                <span className="block font-normal text-indigo-200">
                  <span className="block text-base">{dateStr}</span>
                  <span className="block text-sm">{timeStr}</span>
                </span>
              ) : (
                <span className="text-base font-normal text-indigo-200">{dateStr}</span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-sm text-indigo-200 z-10">
          {showObjectId && activePass ? (
            <div className="min-w-0 flex-1">
              <span className="block font-normal">{t.ownerAddress}</span>
              <span
                onClick={(e) => e.stopPropagation()}
                className="font-mono text-indigo-200 select-all cursor-text flex items-center max-w-full"
                title={activePass.objectId}
              >
                <span className="truncate">{activePass.objectId.slice(0, -6)}</span>
                <span className="flex-none">{activePass.objectId.slice(-6)}</span>
              </span>
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          <div className="sm:text-right flex-none">
            <span className="block font-normal">{t.certSource}</span>
            <span className="text-indigo-200 font-normal">{sourceText || t.noPass}</span>
          </div>
        </div>
      </div>
    )
  }

  // 將單一憑證轉成卡片 props
  const credCardParams = (c: CredentialInfo, showObjectId = false) => ({
    tier: c.tier,
    expiresAt: c.expiresAt,
    sourceText: getSourceLabel(c.source),
    isExpired: c.expiresAt > 0 && c.expiresAt <= Date.now(),
    showObjectId,
  })

  // 點卡面空白處展開/收合；若使用者正在選取文字（拖選複製）則不切換。
  // 展開動畫：先 converging（扇形收合重疊）→ 延遲後 expanded（渲染真實卡片並往下快速攤開）。
  const CONVERGE_MS = 100
  const handleDeckToggle = () => {
    const sel = typeof window !== 'undefined' ? window.getSelection()?.toString() : ''
    if (sel && sel.length > 0) return
    setDeckPhase((p) => {
      if (p === 'expanded') return 'collapsed' // 收合
      if (p === 'collapsed') {
        window.setTimeout(() => setDeckPhase('expanded'), CONVERGE_MS)
        return 'converging' // 先收合扇形
      }
      return p // converging 中忽略點擊
    })
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 min-h-screen flex flex-col justify-between text-slate-800 dark:text-neutral-200 animate-fadeIn transition-colors">
      <div className="w-full">
        {/* Title Header */}
        <div className="border-b pb-6 mb-8 border-slate-100 dark:border-neutral-800">
          <div>
            <h1 className="text-3xl font-normal tracking-tight sm:text-4xl text-slate-900 dark:text-white bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
              {t.title}
            </h1>
            <p className="mt-2 text-base sm:text-lg text-slate-600 dark:text-neutral-300 font-normal">
              {t.subtitle}
            </p>
          </div>
        </div>

        {/* Guest entry: 未連接錢包時，顯示連接錢包提示 */}
        {!activeAddress && (
          <div className="mb-8 space-y-4 max-w-lg mx-auto">
            <div className="warning-box rounded-2xl p-6 text-center flex flex-col items-center">
              <AlertTriangle size={24} className="mb-2 text-amber-600 dark:text-amber-500" />
              <h3 className="text-lg font-semibold mb-2">{t.connectWalletTitle}</h3>
              <p className="text-sm opacity-90 max-w-md mx-auto">
                {t.connectWalletDesc}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl p-6 flex justify-center transition-colors">
              <ConnectButton />
            </div>
          </div>
        )}

        {activeAddress && (
          <div className="grid gap-x-8 gap-y-6 min-[860px]:grid-cols-[30rem_minmax(0,1fr)]">
            <h2 className="text-h2 min-[860px]:col-start-1 min-[860px]:row-start-1">{t.passStatusTitle}</h2>

            {/* Pass status card */}
            <div className="min-[860px]:col-start-1 min-[860px]:row-start-2">
              {isPassLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3 min-h-70">
                  <div className="w-8 h-8 border-4 border-blue-700 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-slate-400 dark:text-neutral-500">{t.loadingPass}</p>
                </div>
              ) : activePass ? (
                (() => {
                  // 無逐一憑證資料（抓取失敗等）：退化為聚合摘要單卡（沿用 effectiveTier + 聚合 expiresAt + 所有來源）
                  if (sortedCredentials.length === 0) {
                    return renderPassCard({
                      tier: activePass.effectiveTier,
                      expiresAt: activePass.expiresAt,
                      sourceText: activePass.credentialSources.map((s) => getSourceLabel(s)).join(', '),
                      isExpired: activePass.expiresAt > 0 && activePass.expiresAt <= Date.now(),
                      showObjectId: true,
                    })
                  }
                  // 只有 1 張憑證：單卡，不顯示扇形 / 展開
                  if (sortedCredentials.length === 1) {
                    return renderPassCard(credCardParams(sortedCredentials[0], true))
                  }
                  // 多張憑證：單一掛載的真實卡片堆疊。卡片於首次渲染即掛載（藏在頂層卡後面），
                  // 展開時不必等待渲染。三階段：collapsed＝扇形、converging＝收合重疊（~100ms）、expanded＝往下攤開。
                  const converging = deckPhase === 'converging'
                  const expanded = deckPhase === 'expanded'
                  const count = sortedCredentials.length
                  const CARD_H = 17.5 // 卡片固定高度（rem），對應 h-70（448×280=1.6:1）
                  const SLOT = CARD_H + 1 // 每張卡的流式槽距（rem）≈ 卡高 + space-y-4(1rem)
                  // 頂層卡保留漸層；後方卡用不同純色，堆疊時逐層分明
                  const fanBg = ['bg-indigo-800', 'bg-slate-700', 'bg-violet-900']
                  // 第 i 張卡的 transform：抵銷流式位移使其重疊頂層，再依階段加扇形露邊 / 攤開。
                  const cardTransform = (i: number): string => {
                    if (i === 0) {
                      // hover：不改變大小，位移減半（-6→-3px）
                      return !expanded && !converging && deckHover
                        ? 'translateY(-3px)'
                        : 'translateY(0) scale(1)'
                    }
                    if (expanded) return 'translateY(0) translateX(0) rotate(0deg) scale(1)'
                    // hover 時的展開幅度減半（delta 取一半）
                    const peekY = converging ? 0 : i * (deckHover ? 15 : 12)
                    const overlapY = `translateY(calc(${-i * SLOT}rem - ${peekY}px))`
                    if (converging) return `${overlapY} translateX(0) rotate(0deg) scale(1)`
                    const tx = i * (deckHover ? 18.5 : 15)
                    const rot = i * (deckHover ? 3.3 : 2.6)
                    const scale = 1 - i * 0.04
                    return `${overlapY} translateX(${tx}px) rotate(${rot}deg) scale(${scale})`
                  }
                  return (
                    <div>
                      {/* 收合時容器只露出頂層卡（overflow 裁掉重疊在後方的卡）；展開時長到容納全部 */}
                      <div
                        className="relative overflow-hidden pt-10 pr-12 transition-[max-height] duration-300 ease-out"
                        style={{ maxHeight: expanded ? `${count * (CARD_H + 1.25) + 4}rem` : `${CARD_H + 3}rem` }}
                        onMouseEnter={() => setDeckHover(true)}
                        onMouseLeave={() => setDeckHover(false)}
                      >
                        <div className="space-y-4">
                          {sortedCredentials.map((c, i) => (
                            <div
                              key={`${c.source}-${i}`}
                              className="relative transition-transform ease-out"
                              style={{
                                transform: cardTransform(i),
                                zIndex: count - i,
                                // 收合 ~100ms、攤開 ~340ms（展開時逐張 stagger 製造往下攤開）
                                transitionDuration: converging ? '110ms' : '340ms',
                                transitionDelay: expanded ? `${i * 45}ms` : '0ms',
                              }}
                            >
                              {renderPassCard({
                                ...credCardParams(c, i === 0),
                                onCardClick: handleDeckToggle,
                                bgClass: i === 0 ? undefined : fanBg[(i - 1) % fanBg.length],
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 flex justify-center">
                        <p className="flex items-center gap-1.5 text-sm font-normal text-slate-400 dark:text-neutral-500">
                          {expanded ? (
                            t.collapseHint
                          ) : (
                            <>
                              {t.expandHint(count)} <span aria-hidden>⌄</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  )
                })()
              ) : (
                <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl p-8 text-center min-h-70 flex flex-col justify-center">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <IdCard size={32} />
                  </div>
                  <h3 className="text-h3">{t.noPassTitle}</h3>
                  <p className="text-sm text-slate-500 dark:text-neutral-400 mt-2 max-w-sm mx-auto font-normal">
                    {t.noPassDesc}
                  </p>
                </div>
              )}
            </div>

            {/* Verification card + GDPR controls（合併為右欄單格，避免左欄展開時把刪除區推開） */}
            <div className="min-[860px]:col-start-2 min-[860px]:row-start-2 space-y-6">
              <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl p-6 space-y-6 transition-colors">
                <h3 className="text-h3">
                  {activePass ? t.upgradeTitle : t.mintTitle}
                </h3>

                {/* Verification method selector */}
                <div>
                  <label htmlFor="verifyMethod" className="form-label">
                    {t.verifyMethodLabel}
                  </label>
                  <select
                    id="verifyMethod"
                    value={verifyMethod}
                    onChange={(e) => {
                      const v = e.target.value as typeof verifyMethod
                      setVerifyMethod(v)
                      sessionStorage.setItem('surveysui:verifyMethod', v)
                      setOtpSentNotice(null)
                      setCanReturnToSurvey(false)
                    }}
                    className="form-input"
                  >
                    {([
                      { value: 'email', label: t.emailOtp, available: true },
                      { value: 'social', label: t.socialAuth, available: true },
                      { value: 'worldId', label: t.worldId, available: true },
                    ] as const).map((m) => (
                      <option key={m.value} value={m.value} disabled={!m.available}>
                        {m.available ? m.label : `${m.label} (${t.comingSoon})`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Gas quota + status messages */}
                {sponsorQuota && (
                  <div className="text-sm space-y-1 animate-fadeIn">
                    <div className="text-slate-500 dark:text-neutral-400 font-normal">
                      {t.gasSponsorQuota(sponsorQuota.remaining, sponsorQuota.maxLimit)}
                    </div>
                    {sponsorQuota.remaining === 0 && (
                      <p className="text-rose-600 dark:text-rose-400 font-normal leading-normal flex items-center gap-1.5">
                        <AlertTriangle size={14} className="shrink-0" />
                        {t.gasSelfPaidNotice}
                      </p>
                    )}
                  </div>
                )}

                {pendingMsg && (
                  <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-neutral-400 bg-slate-50 dark:bg-neutral-900/50 border border-slate-200 dark:border-neutral-800 rounded-xl px-4 py-3">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>{pendingMsg}</span>
                  </div>
                )}

                {otpSentNotice && (
                  <div role="status" className="alert-info text-sm font-normal">
                    {otpSentNotice}
                  </div>
                )}

                {successMsg && (
                  <div role="status" className="alert-success space-y-2 flex-col items-start">
                    <h3 className="text-base font-semibold flex items-center gap-2 text-emerald-900 dark:text-emerald-400">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300">
                        <Check size={14} />
                      </span>
                      {t.txSuccess}
                    </h3>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 font-normal">{successMsg}</p>
                    {txDigest && (
                      <div className="bg-white/80 dark:bg-neutral-900/40 border border-emerald-100 dark:border-emerald-900/30 rounded-lg p-3 text-xs font-mono break-all mt-2 w-full text-left text-emerald-800 dark:text-emerald-300 font-normal">
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{t.txDigestLabel}</span>
                        {txDigest}
                      </div>
                    )}
                    {returnTo && canReturnToSurvey && (
                      <button
                        type="button"
                        onClick={() => {
                          sessionStorage.removeItem('surveysui:returnTo')
                          setCanReturnToSurvey(false)
                          navigate(returnTo)
                        }}
                        className="btn-primary w-full mt-2"
                      >
                        {t.backToSurvey}
                      </button>
                    )}
                  </div>
                )}

                {errorMsg && (
                  <div role="alert" className="alert-error text-sm font-normal break-all flex items-center gap-1.5">
                    <AlertTriangle size={14} className="shrink-0 text-rose-500" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Email OTP form */}
                {verifyMethod === 'email' && (
                  step === 'input' ? (
                    <form onSubmit={handleRequestOtp} className="space-y-4">
                      <div>
                        <label htmlFor="email" className="form-label">{t.emailVerification}</label>
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
                      <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center">
                        {loading ? t.sendingOtp : t.btnGetOtp}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyAndMint} className="space-y-4">
                      <div>
                        <span className="form-label">{t.otpCodeLabel}</span>
                        <input
                          type="text"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value)}
                          placeholder="123456"
                          maxLength={6}
                          className="form-input text-center font-mono font-normal tracking-widest"
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setStep('input'); setOtpSentNotice(null) }}
                          className="btn-secondary flex-1"
                        >
                          {t.btnBack}
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="btn-primary flex-1"
                        >
                          {loading ? t.submitting : (activePass ? t.btnUpdatePass : t.btnVerifyAndMint)}
                        </button>
                      </div>
                    </form>
                  )
                )}

                {/* Social OAuth provider buttons */}
                {verifyMethod === 'social' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-muted">{t.socialDirectTitle}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {DIRECT_OAUTH_PROVIDERS.map((provider) => (
                          <button
                            key={provider.id}
                            type="button"
                            disabled={loading || !account}
                            onClick={() => handleSocialLogin(provider.id)}
                            className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ProviderIcon provider={provider.id} size={16} />
                            {provider.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* World ID 4.0 (Tier 2, Orb only) */}
                {verifyMethod === 'worldId' && (
                  <div className="space-y-4">
                    <p className="text-muted">{t.worldIdDesc}</p>
                    <button
                      type="button"
                      disabled={loading || !account}
                      onClick={handleWorldIdStart}
                      className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <IdCard size={16} />
                      {t.worldIdButton}
                    </button>
                    {worldIdConfig && (
                      <IDKitRequestWidget
                        app_id={worldIdConfig.app_id}
                        action={worldIdConfig.action}
                        rp_context={worldIdConfig.rp_context}
                        allow_legacy_proofs={false}
                        preset={proofOfHuman()}
                        environment={(import.meta.env.VITE_WORLDCOIN_ENV as 'production' | 'staging') || 'production'}
                        open={worldIdOpen}
                        onOpenChange={setWorldIdOpen}
                        onSuccess={handleWorldIdSuccess}
                        onError={(code) => setErrorMsg(`${t.worldIdError}: ${code}`)}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* GDPR Controls */}
              {activePass && (
                <div className="bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-3xl p-6 space-y-4">
                  <h3 className="text-h3">
                    {t.gdprTitle}
                  </h3>
                  <p className="text-muted leading-relaxed">
                    {t.gdprDesc}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setDeleteConfirm(true)}
                      className="btn-danger"
                    >
                      {t.btnDeletePass}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {selfPaidConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => { selfPaidConfirm.resolve(false); setSelfPaidConfirm(null) }}
        >
          <div
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 max-w-md w-full p-6 space-y-4 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-600/20 dark:border-rose-400/70 dark:text-rose-400 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                  {selfPaidConfirm.isLimitReached ? t.gasLimitReachedConfirmTitle : t.gasSelfPaidConfirmTitle}
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
                onClick={() => { selfPaidConfirm.resolve(false); setSelfPaidConfirm(null) }}
              >
                {t.gasSelfPaidCancel}
              </button>
              <button
                type="button"
                className="btn-danger w-full sm:w-1/2"
                onClick={() => { selfPaidConfirm.resolve(true); setSelfPaidConfirm(null) }}
              >
                {t.gasSelfPaidContinue}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setDeleteConfirm(false)}
        >
          <div
            className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 max-w-md w-full p-6 space-y-4 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-600/20 dark:border-rose-400/70 dark:text-rose-400 shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-neutral-100">
                  {t.deleteConfirmTitle}
                </h2>
                <p className="text-sm text-slate-600 dark:text-neutral-400 mt-1 leading-relaxed">
                  {activePass && activePass.depositPayer?.toLowerCase() !== activePass.owner?.toLowerCase()
                    ? t.deleteConfirmDescSponsored
                    : t.deleteConfirmDesc}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                className="btn-outline w-full sm:w-1/2"
                onClick={() => setDeleteConfirm(false)}
              >
                {t.deleteConfirmCancel}
              </button>
              <button
                type="button"
                disabled={loading}
                className="btn-danger w-full sm:w-1/2"
                onClick={() => { setDeleteConfirm(false); handleDeletePass() }}
              >
                {t.deleteConfirmOk}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-16 text-center text-xs text-slate-400 dark:text-neutral-500 font-medium transition-colors">
        {t.footer} &copy; {new Date().getFullYear()}
      </footer>
    </main>
  )
}
