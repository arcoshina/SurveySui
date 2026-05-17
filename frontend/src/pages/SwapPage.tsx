import { useState } from 'react'
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { calcAmountOut, calcPriceImpact, buildSwapPtb } from '../lib/swap'

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID ?? ''
const POOL_ID = import.meta.env.VITE_AMM_POOL_ID ?? ''
const DECIMALS = 1_000_000_000n

type Direction = 'sui_to_rwd' | 'rwd_to_sui'

function parseToBase(str: string): bigint | null {
  const f = parseFloat(str)
  if (isNaN(f) || f <= 0) return null
  return BigInt(Math.floor(f * Number(DECIMALS)))
}

export default function SwapPage() {
  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()

  const [direction, setDirection] = useState<Direction>('sui_to_rwd')
  const [amountInStr, setAmountInStr] = useState('')
  const [txStatus, setTxStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [txDigest, setTxDigest] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: poolData, isLoading: poolLoading } = useSuiClientQuery(
    'getObject',
    { id: POOL_ID, options: { showContent: true } },
    { enabled: !!POOL_ID },
  )

  const { data: userRwdCoins } = useSuiClientQuery(
    'getCoins',
    {
      owner: account?.address ?? '',
      coinType: `${PACKAGE_ID}::reward_coin::REWARD_COIN`,
    },
    { enabled: !!account && direction === 'rwd_to_sui' },
  )

  const rwdCoinId = (
    userRwdCoins as { data?: Array<{ coinObjectId: string }> } | undefined
  )?.data?.[0]?.coinObjectId

  let reserveA = 0n // RWD
  let reserveB = 0n // SUI
  if (poolData?.data?.content?.dataType === 'moveObject') {
    const fields = (
      poolData.data.content as { dataType: string; fields: Record<string, string> }
    ).fields
    reserveA = BigInt(fields.reserve_a ?? '0')
    reserveB = BigInt(fields.reserve_b ?? '0')
  }

  const amountInBase = parseToBase(amountInStr)
  const [reserveIn, reserveOut] =
    direction === 'sui_to_rwd' ? [reserveB, reserveA] : [reserveA, reserveB]

  let amountOut: bigint | null = null
  let priceImpact = 0

  if (amountInBase !== null && reserveIn > 0n && reserveOut > 0n) {
    try {
      amountOut = calcAmountOut(amountInBase, reserveIn, reserveOut)
      priceImpact = calcPriceImpact(amountInBase, reserveIn, reserveOut)
    } catch {
      amountOut = null
    }
  }

  const amountOutDisplay =
    amountOut !== null ? (Number(amountOut) / Number(DECIMALS)).toFixed(6) : ''

  const inLabel = direction === 'sui_to_rwd' ? 'SUI' : 'RWD'
  const outLabel = direction === 'sui_to_rwd' ? 'RWD' : 'SUI'

  function toggleDirection() {
    setDirection((d) => (d === 'sui_to_rwd' ? 'rwd_to_sui' : 'sui_to_rwd'))
    setAmountInStr('')
    setTxStatus('idle')
    setErrorMsg(null)
    setTxDigest(null)
  }

  function handleSwap() {
    if (!account || !amountInBase || !amountOut) return

    if (direction === 'rwd_to_sui' && !rwdCoinId) {
      setErrorMsg('找不到 RWD 代幣，請確認您的錢包中有 RWD')
      setTxStatus('error')
      return
    }

    // 5% 滑點容忍：呼應 UI 警告閾值（line 197）
    const minAmountOut = (amountOut * 95n) / 100n

    let tx
    try {
      tx = buildSwapPtb({
        packageId: PACKAGE_ID,
        poolId: POOL_ID,
        amountIn: amountInBase,
        minAmountOut,
        direction,
        senderAddress: account.address,
        rwdCoinId: direction === 'rwd_to_sui' ? rwdCoinId : undefined,
      })
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PTB 建構失敗')
      setTxStatus('error')
      return
    }

    setTxStatus('loading')
    setErrorMsg(null)

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

  const canSwap =
    !!account &&
    amountOut !== null &&
    amountOut > 0n &&
    txStatus !== 'loading' &&
    txStatus !== 'success'

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-md mx-auto">
      <h1 className="text-3xl font-bold mb-6">兌換代幣</h1>

      {poolLoading && (
        <p aria-label="pool-loading" className="text-gray-400 mb-4 text-sm">
          載入池子資料中…
        </p>
      )}

      <div className="bg-gray-50 border rounded p-4 mb-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">投入 ({inLabel})</label>
          <input
            type="number"
            min="0"
            step="any"
            aria-label={`amount-in-${inLabel}`}
            value={amountInStr}
            onChange={(e) => {
              setAmountInStr(e.target.value)
              setTxStatus('idle')
              setErrorMsg(null)
            }}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="0.0"
          />
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            aria-label="toggle-direction"
            onClick={toggleDirection}
            className="text-xl select-none hover:opacity-70 transition-opacity"
          >
            ⇅
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            獲得（預估）({outLabel})
          </label>
          <input
            type="text"
            readOnly
            aria-label={`amount-out-${outLabel}`}
            value={amountOutDisplay}
            className="w-full border rounded px-3 py-2 text-sm bg-gray-100"
            placeholder="0.0"
          />
        </div>
      </div>

      {priceImpact > 5 && amountOut !== null && (
        <div
          role="alert"
          aria-label="slippage-warning"
          className="bg-yellow-100 border border-yellow-400 text-yellow-800 rounded p-3 mb-4 text-sm"
        >
          ⚠️ 價格影響過高：{priceImpact.toFixed(2)}%（超過 5%）
        </div>
      )}

      <div className="mb-4">
        <ConnectButton />
      </div>

      {txStatus === 'success' && txDigest && (
        <div
          role="status"
          className="bg-green-100 text-green-800 p-4 rounded mb-4 text-sm break-all"
        >
          兌換成功！TX：{txDigest}
        </div>
      )}

      {txStatus === 'error' && errorMsg && (
        <p role="alert" className="text-red-500 mb-4 text-sm">
          {errorMsg}
        </p>
      )}

      <button
        type="button"
        onClick={handleSwap}
        disabled={!canSwap}
        className="w-full bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {txStatus === 'loading' ? '交易中...' : `${inLabel} → ${outLabel} 兌換`}
      </button>
    </main>
  )
}
