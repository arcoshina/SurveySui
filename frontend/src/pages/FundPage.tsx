import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { estimateSuiCost, buildFundSurveyPtb } from '../lib/ptb'
import { parseFrontmatter } from '../lib/frontmatter'

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID ?? ''
const POOL_ID = import.meta.env.VITE_AMM_POOL_ID ?? ''
const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS ?? ''
const RWD_DECIMALS = 1_000_000_000n

interface FundState {
  contentMd: string
}

export default function FundPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as FundState | undefined

  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()

  const [txStatus, setTxStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [txDigest, setTxDigest] = useState<string | null>(null)
  const [surveyId, setSurveyId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const contentMd = state?.contentMd ?? ''
  const frontmatter = contentMd ? parseFrontmatter(contentMd) : { ok: false as const, error: '缺少問卷內容' }
  const params = frontmatter.ok ? frontmatter.data : null

  const { data: poolData } = useSuiClientQuery(
    'getObject',
    { id: POOL_ID, options: { showContent: true } },
    { enabled: !!POOL_ID },
  )

  let suiToSpend: bigint | null = null
  if (params && poolData?.data?.content?.dataType === 'moveObject') {
    const fields = (poolData.data.content as { dataType: string; fields: Record<string, string> })
      .fields
    const reserveRwd = BigInt(fields.reserve_a ?? '0')
    const reserveSui = BigInt(fields.reserve_b ?? '0')
    const perResponseRwd = BigInt(params.perResponse) * RWD_DECIMALS

    try {
      const estimated = estimateSuiCost({
        perResponseRwd,
        maxResponses: params.maxResponses,
        reserveSui,
        reserveRwd,
      })
      suiToSpend = (estimated * 101n) / 100n
    } catch {
      suiToSpend = null
    }
  }

  async function postSurvey(vaultObjectId: string, creatorAddress: string): Promise<string | null> {
    try {
      const res = await fetch('/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentMd, vaultObjectId, creatorAddress }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { id: string }
      return data.id
    } catch (err) {
      throw err instanceof Error ? err : new Error('POST /surveys 失敗')
    }
  }

  function handleFund() {
    if (!params || !account || !suiToSpend) return

    setTxStatus('loading')
    setErrorMsg(null)

    const totalRwd = BigInt(params.perResponse) * BigInt(params.maxResponses) * RWD_DECIMALS

    let tx
    try {
      tx = buildFundSurveyPtb({
        packageId: PACKAGE_ID,
        poolId: POOL_ID,
        perResponseMist: BigInt(params.perResponse) * RWD_DECIMALS,
        maxResponses: params.maxResponses,
        deadlineMs: BigInt(params.deadlineMs),
        adminAddress: ADMIN_ADDRESS,
        suiToSpend,
        minRwdOut: totalRwd,
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PTB 建構失敗')
      setTxStatus('error')
      return
    }

    signAndExecute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { transaction: tx as any },
      {
        onSuccess: async (result) => {
          setTxDigest(result.digest)

          // 從 PTB effects 取得新建的 vault object id（T5.5 會精確過濾 type）
          const createdObjs = (result as { objectChanges?: Array<{ type: string; objectId?: string }> })
            .objectChanges
          const vaultObjectId =
            createdObjs?.find((c) => c.type === 'created')?.objectId ?? result.digest

          try {
            const id = await postSurvey(vaultObjectId, account.address)
            setSurveyId(id)
            setTxStatus('success')
          } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'POST /surveys 失敗')
            setTxStatus('error')
          }
        },
        onError: (err) => {
          setErrorMsg(err.message)
          setTxStatus('error')
        },
      },
    )
  }

  if (!state || !contentMd) {
    return (
      <main className="min-h-screen p-8 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">注資</h1>
        <p className="text-red-500">找不到問卷內容，請從建立問卷頁面進入。</p>
      </main>
    )
  }

  if (!frontmatter.ok) {
    return (
      <main className="min-h-screen p-8 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">注資</h1>
        <p className="text-red-500">Frontmatter 解析錯誤：{frontmatter.error}</p>
      </main>
    )
  }

  const totalRwd = params!.perResponse * params!.maxResponses

  return (
    <main className="min-h-screen p-8 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">注資問卷金庫</h1>

      <div className="bg-gray-50 border rounded p-4 mb-6 space-y-2 text-sm">
        <p>
          <span className="font-semibold">每份獎勵：</span>
          {params!.perResponse} RWD
        </p>
        <p>
          <span className="font-semibold">名額上限：</span>
          {params!.maxResponses}
        </p>
        <p>
          <span className="font-semibold">所需 RWD 總量：</span>
          {totalRwd} RWD
        </p>
        <p>
          <span className="font-semibold">預估 SUI 消耗：</span>
          {suiToSpend === null ? (
            <span className="text-gray-400">計算中…</span>
          ) : (
            <span aria-label="estimated-sui-cost">
              {(Number(suiToSpend) / 1e9).toFixed(4)} SUI（含 1% 滑點緩衝）
            </span>
          )}
        </p>
      </div>

      <div className="mb-4">
        <ConnectButton />
      </div>

      {txStatus === 'success' && txDigest && (
        <div role="status" className="bg-green-100 text-green-800 p-4 rounded mb-4 text-sm break-all">
          <p>注資成功！TX：{txDigest}</p>
          {surveyId && (
            <button
              type="button"
              onClick={() => navigate(`/dashboard/${surveyId}`)}
              className="mt-2 underline font-semibold"
            >
              前往問卷儀表板 →
            </button>
          )}
        </div>
      )}

      {txStatus === 'error' && errorMsg && (
        <p role="alert" className="text-red-500 mb-4 text-sm">
          {errorMsg}
        </p>
      )}

      <button
        type="button"
        onClick={handleFund}
        disabled={!account || !suiToSpend || txStatus === 'loading' || txStatus === 'success'}
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {txStatus === 'loading' ? '交易中...' : '一鍵注資'}
      </button>
    </main>
  )
}
