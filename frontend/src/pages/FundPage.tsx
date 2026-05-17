import { useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { estimateSuiCost, buildFundSurveyPtb } from '../lib/ptb'

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID ?? ''
const POOL_ID = import.meta.env.VITE_AMM_POOL_ID ?? ''
const ADMIN_ADDRESS = import.meta.env.VITE_ADMIN_ADDRESS ?? ''
const RWD_DECIMALS = 1_000_000_000n

interface SurveyParams {
  perResponse: number
  maxResponses: number
  deadlineMs: number
}

export default function FundPage() {
  const { surveyId } = useParams<{ surveyId: string }>()
  const location = useLocation()
  const params = location.state as SurveyParams | undefined

  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()

  const [txStatus, setTxStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [txDigest, setTxDigest] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: poolData } = useSuiClientQuery(
    'getObject',
    { id: POOL_ID, options: { showContent: true } },
    { enabled: !!POOL_ID },
  )

  // 從 pool 物件取得儲備量並估算 SUI 消耗
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
      // 加 1% 滑點緩衝
      suiToSpend = (estimated * 101n) / 100n
    } catch {
      suiToSpend = null
    }
  }

  function handleFund() {
    if (!params || !account || !suiToSpend) return

    setTxStatus('loading')
    setErrorMsg(null)

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
        onSuccess: (result) => {
          setTxDigest(result.digest)
          setTxStatus('success')
        },
        onError: (err) => {
          setErrorMsg(err.message)
          setTxStatus('error')
        },
      },
    )
  }

  if (!params) {
    return (
      <main className="min-h-screen p-8 max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">注資</h1>
        <p className="text-red-500">找不到問卷參數，請從建立問卷頁面進入。</p>
      </main>
    )
  }

  const totalRwd = params.perResponse * params.maxResponses

  return (
    <main className="min-h-screen p-8 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">注資問卷金庫</h1>

      <div className="bg-gray-50 border rounded p-4 mb-6 space-y-2 text-sm">
        <p>
          <span className="font-semibold">問卷 ID：</span>
          {surveyId}
        </p>
        <p>
          <span className="font-semibold">每份獎勵：</span>
          {params.perResponse} RWD
        </p>
        <p>
          <span className="font-semibold">名額上限：</span>
          {params.maxResponses}
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
          注資成功！TX：{txDigest}
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
