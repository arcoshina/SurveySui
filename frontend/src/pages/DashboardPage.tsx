import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useCurrentAccount, useSuiClientQuery } from '@mysten/dapp-kit'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface Distribution {
  question_id: string
  question: string
  data: Array<{ label: string; count: number }>
}

interface SurveyStats {
  response_count: number
  completion_rate: number
  distributions: Distribution[]
  vault_balance: string
}

interface SurveyMeta {
  id: string
  creator: string
  status: 'ACTIVE' | 'CLOSED'
  vault_object_id: string
  deadline: string
  per_response: number
  max_responses: number
}

export default function DashboardPage() {
  const { surveyId } = useParams<{ surveyId?: string }>()
  const account = useCurrentAccount()

  const [survey, setSurvey] = useState<SurveyMeta | null>(null)
  const [stats, setStats] = useState<SurveyStats | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [closeStatus, setCloseStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [closeError, setCloseError] = useState<string | null>(null)

  useEffect(() => {
    if (!surveyId) return
    setLoadError(null)
    Promise.all([
      fetch(`/surveys/${surveyId}`).then((r) => r.json()),
      fetch(`/surveys/${surveyId}/stats`).then((r) => r.json()),
    ])
      .then(([surveyData, statsData]) => {
        setSurvey(surveyData as SurveyMeta)
        setStats(statsData as SurveyStats)
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [surveyId])

  const { data: vaultData } = useSuiClientQuery(
    'getObject',
    { id: survey?.vault_object_id ?? '', options: { showContent: true } },
    { enabled: !!survey?.vault_object_id },
  )

  // 優先顯示鏈上即時餘額，不可用時 fallback 至 stats API
  let displayBalance: bigint | null = null
  if (vaultData?.data?.content?.dataType === 'moveObject') {
    const fields = (
      vaultData.data.content as { dataType: string; fields: Record<string, string> }
    ).fields
    displayBalance = BigInt(fields.balance ?? '0')
  } else if (stats) {
    displayBalance = BigInt(stats.vault_balance)
  }

  const isCreator = !!account && !!survey && account.address === survey.creator
  const isActive = survey?.status === 'ACTIVE'
  const canClose = isCreator && isActive && closeStatus === 'idle'

  async function handleClose() {
    if (!surveyId || !canClose) return
    setCloseStatus('loading')
    setCloseError(null)
    try {
      const res = await fetch(`/surveys/${surveyId}/close`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      setCloseStatus('success')
      setSurvey((prev) => (prev ? { ...prev, status: 'CLOSED' } : prev))
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : '結束失敗')
      setCloseStatus('error')
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">儀表板</h1>

      {!surveyId && (
        <p className="mt-2 text-gray-500">查看問卷回覆統計與 Vault 餘額。</p>
      )}

      {surveyId && loadError && (
        <p role="alert" className="text-red-500 mt-4">
          {loadError}
        </p>
      )}

      {surveyId && stats && survey && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
            <div className="bg-gray-50 border rounded p-4">
              <p className="text-sm text-gray-500">回覆數</p>
              <p className="text-2xl font-bold" aria-label="response-count">
                {stats.response_count}
              </p>
            </div>
            <div className="bg-gray-50 border rounded p-4">
              <p className="text-sm text-gray-500">完成率</p>
              <p className="text-2xl font-bold" aria-label="completion-rate">
                {(stats.completion_rate * 100).toFixed(1)}%
              </p>
            </div>
            <div className="bg-gray-50 border rounded p-4">
              <p className="text-sm text-gray-500">Vault 餘額（鏈上）</p>
              <p className="text-2xl font-bold" aria-label="vault-balance">
                {displayBalance !== null
                  ? `${(Number(displayBalance) / 1e9).toFixed(4)} RWD`
                  : '查詢中…'}
              </p>
            </div>
          </div>

          {stats.distributions.map((dist) => (
            <section key={dist.question_id} className="mb-8">
              <h2 className="text-lg font-semibold mb-2">{dist.question}</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dist.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </section>
          ))}

          <div className="mt-6 border-t pt-6">
            <p className="text-sm text-gray-500 mb-3">
              狀態：
              <span
                className={
                  survey.status === 'ACTIVE'
                    ? 'text-green-600 font-semibold'
                    : 'text-gray-500 font-semibold'
                }
              >
                {survey.status === 'ACTIVE' ? '進行中' : '已結束'}
              </span>
            </p>

            {closeStatus === 'success' && (
              <p role="status" className="text-green-700 mb-3 text-sm">
                活動已成功結束。
              </p>
            )}
            {closeStatus === 'error' && closeError && (
              <p role="alert" className="text-red-500 mb-3 text-sm">
                {closeError}
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleClose()}
              disabled={!canClose}
              className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {closeStatus === 'loading' ? '結束中...' : '結束活動'}
            </button>

            {!isCreator && survey.status === 'ACTIVE' && (
              <p className="text-xs text-gray-400 mt-2">僅限問卷建立者可結束活動。</p>
            )}
          </div>
        </>
      )}
    </main>
  )
}
