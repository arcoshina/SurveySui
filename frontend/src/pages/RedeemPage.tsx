import { useState } from 'react'
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClientQuery,
} from '@mysten/dapp-kit'
import { buildRedeemPtb } from '../lib/ptb'
import { formatSssr } from '../lib/format'

export default function RedeemPage() {
  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()

  const packageId = import.meta.env.VITE_PACKAGE_ID ?? ''
  const poolId = import.meta.env.VITE_AMM_POOL_ID ?? ''
  const sssrTreasuryId = import.meta.env.VITE_SSSR_TREASURY_ID ?? ''

  const [txStatus, setTxStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [txDigest, setTxDigest] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [processingCoinId, setProcessingCoinId] = useState<string | null>(null)

  // Fetch user's stakedSurveySuiReward (sSSR) coins
  const { data: coinsData, isLoading, refetch } = useSuiClientQuery(
    'getCoins',
    {
      owner: account?.address ?? '',
      coinType: `${packageId}::stacked_survey_reward::STACKED_SURVEY_REWARD`,
    },
    { enabled: !!account && !!packageId },
  )

  const sssrCoins = coinsData?.data ?? []

  function handleRedeem(coinId: string) {
    if (!account) return

    setTxStatus('loading')
    setProcessingCoinId(coinId)
    setErrorMsg(null)
    setTxDigest(null)

    try {
      const tx = buildRedeemPtb({
        packageId,
        poolId,
        sssrTreasuryId,
        sssrCoinId: coinId,
        senderAddress: account.address,
      })

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            setTxDigest(result.digest)
            setTxStatus('success')
            setProcessingCoinId(null)
            void refetch() // refresh the coins list
          },
          onError: (err) => {
            setErrorMsg(err.message || '兌換失敗，請稍後再試')
            setTxStatus('error')
            setProcessingCoinId(null)
          },
        },
      )
    } catch (err: any) {
      setErrorMsg(err.message || 'PTB 建構失敗')
      setTxStatus('error')
      setProcessingCoinId(null)
    }
  }

  const formatBalance = (balanceStr: string) => {
    return formatSssr(balanceStr)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 min-h-screen flex flex-col justify-between">
      <div className="w-full">
        {/* Header Section */}
        <div className="border-b pb-6 mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            兌換 SurveySuiReward
          </h1>
          <p className="mt-3 text-lg text-neutral-600 max-w-2xl">
            列出您持有的 `stakedSurveySuiReward` 憑證。選擇後呼叫合約將 sSSR 憑證兌換成 `SurveySuiReward` (SSR) 代幣。
          </p>
        </div>

        {/* Global Wallet State & Status Alerts */}
        <div className="space-y-4 mb-8">
          {!account && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 shadow-sm text-center">
              <h3 className="text-lg font-semibold text-amber-800 mb-2">請先連接錢包</h3>
              <p className="text-sm text-amber-700 mb-4 max-w-md mx-auto">
                要查看或兌換您的 stakedSurveySuiReward 憑證，您需要連接您的 Sui 錢包。
              </p>
              <div className="inline-block">
                <ConnectButton />
              </div>
            </div>
          )}

          {txStatus === 'success' && txDigest && (
            <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-6 rounded-xl shadow-sm space-y-2">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 font-bold">✓</span>
                兌換成功！
              </h3>
              <p className="text-sm text-emerald-700">
                您的 sSSR 憑證已成功在 AMM 池中換回 SSR 代幣，並已發送回您的錢包。
              </p>
              <div className="bg-white/80 border border-emerald-100 rounded-lg p-3 text-xs font-mono break-all">
                <span className="font-semibold text-emerald-600">交易哈希：</span>
                {txDigest}
              </div>
            </div>
          )}

          {txStatus === 'error' && errorMsg && (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl shadow-sm text-sm font-semibold break-all">
              ⚠️ {errorMsg}
            </div>
          )}
        </div>

        {/* Coins List Section */}
        {account && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                您的 sSSR 憑證
                {sssrCoins.length > 0 && (
                  <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                    {sssrCoins.length} 個
                  </span>
                )}
              </h2>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                disabled={isLoading}
              >
                {isLoading ? '更新中…' : '整理列表'}
              </button>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-gray-500 font-medium animate-pulse">載入中，請稍候…</p>
              </div>
            ) : sssrCoins.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-2xl py-16 px-6 text-center shadow-inner">
                <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">📭</div>
                <h3 className="text-base font-bold text-gray-700">您目前沒有可兌換的 sSSR 憑證</h3>
                <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
                  完成填寫問卷活動後，您會獲得 stakedSurveySuiReward 憑證。屆時它們將會顯示在此處以供您進行兌換。
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {sssrCoins.map((coin) => {
                  const isProcessing = processingCoinId === coin.coinObjectId
                  const isAnyProcessing = txStatus === 'loading'
                  
                  return (
                    <div
                      key={coin.coinObjectId}
                      className={`relative overflow-hidden bg-white border border-gray-200 rounded-2xl p-6 transition-all duration-300 shadow-sm hover:shadow-md hover:border-blue-200 flex flex-col justify-between ${
                        isProcessing ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-bold tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                            質押憑證 sSSR
                          </span>
                          <span className="font-mono text-xs text-gray-400 select-all hover:text-gray-600" title={coin.coinObjectId}>
                            ID: {coin.coinObjectId.slice(0, 8)}...{coin.coinObjectId.slice(-6)}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">額度</span>
                          <span className="text-3xl font-extrabold text-gray-900 tabular-nums">
                            {formatBalance(coin.balance)} <span className="text-lg font-bold text-blue-600">sSSR</span>
                          </span>
                        </div>
                      </div>

                      <div className="mt-6">
                        <button
                          type="button"
                          disabled={isAnyProcessing}
                          onClick={() => handleRedeem(coin.coinObjectId)}
                          className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm flex items-center justify-center gap-2 ${
                            isProcessing
                              ? 'bg-blue-500 text-white cursor-not-allowed opacity-80'
                              : isAnyProcessing
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:shadow'
                          }`}
                        >
                          {isProcessing ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              兌換中…
                            </>
                          ) : (
                            '兌換'
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="mt-16 text-center text-xs text-gray-400 font-medium">
        SurveySui 區塊鏈問卷激勵系統 &copy; {new Date().getFullYear()}
      </footer>
    </main>
  )
}
