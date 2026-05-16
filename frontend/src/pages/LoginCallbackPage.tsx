import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

type SbtStatus = 'PENDING' | 'ACTIVE' | 'REVOKED' | 'NONE'
type Phase = 'finalizing' | 'pending_sbt' | 'active' | 'error'

const POLL_INTERVAL_MS = 2000

export default function LoginCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('finalizing')
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const idToken = searchParams.get('id_token')

    if (!idToken) {
      setError('缺少登入憑證，請重新登入')
      setPhase('error')
      return
    }

    fetch('/auth/zklogin/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_token: idToken }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text())
        setPhase('pending_sbt')
        startPolling()
      })
      .catch((err: Error) => {
        setError(err.message || '登入驗證失敗')
        setPhase('error')
      })

    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startPolling() {
    intervalRef.current = setInterval(() => {
      fetch('/me/sbt-status')
        .then((r) => r.json())
        .then((data: { status: SbtStatus }) => {
          if (data.status === 'ACTIVE') {
            stopPolling()
            setPhase('active')
          }
        })
        .catch(() => {})
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  if (phase === 'error') {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <p role="alert" className="text-red-500">
            {error ?? '登入失敗，請重試'}
          </p>
          <a href="/login" className="text-blue-600 hover:underline text-sm">
            重新登入
          </a>
        </div>
      </main>
    )
  }

  if (phase === 'active') {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-6">
          <p aria-label="sbt-status" className="text-green-600 font-semibold text-xl">
            護照已啟用！
          </p>
          <p className="text-gray-600">您現在可以參與問卷並獲得 RWD 獎勵</p>
          <button
            type="button"
            onClick={() => void navigate('/')}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            開始瀏覽問卷
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-4">
        {phase === 'finalizing' ? (
          <p aria-live="polite">驗證登入中…</p>
        ) : (
          <>
            <p aria-live="polite" aria-label="sbt-status">
              SBT 申請中，請稍候…
            </p>
            <p className="text-sm text-gray-500">正在鏈上發行您的參與護照，通常需要 10–30 秒</p>
          </>
        )}
      </div>
    </main>
  )
}
