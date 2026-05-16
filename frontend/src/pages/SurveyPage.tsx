import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

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
  questions: Question[]
}

type Answers = Record<string, string | string[]>
type Phase = 'loading' | 'filling' | 'review' | 'submitting' | 'success' | 'error'

export default function SurveyPage() {
  const { id } = useParams<{ id: string }>()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [answers, setAnswers] = useState<Answers>({})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/surveys/${id}`)
      .then((r) => r.json())
      .then((data: Survey) => {
        setSurvey(data)
        setPhase('filling')
      })
      .catch(() => setPhase('error'))
  }, [id])

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
    setPhase('review')
  }

  async function handleSubmit() {
    if (!id) return
    setPhase('submitting')
    setSubmitError(null)
    try {
      const res = await fetch(`/surveys/${id}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { tx_hash: string }
      setTxHash(data.tx_hash)
      setPhase('success')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失敗')
      setPhase('review')
    }
  }

  function handleAnswerChange(qId: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
    setValidationError(null)
  }

  // ── loading ───────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p aria-live="polite">載入問卷中…</p>
      </main>
    )
  }

  // ── error ─────────────────────────────────────────────────────────────────

  if (phase === 'error' || !survey) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <p role="alert" className="text-red-500">
          問卷載入失敗，請稍後再試。
        </p>
      </main>
    )
  }

  // ── success ───────────────────────────────────────────────────────────────

  if (phase === 'success') {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-green-600">提交成功！</h1>
          <p className="text-gray-600">感謝您的參與，獎勵已發放。</p>
          <div className="bg-gray-50 border rounded p-4 text-left max-w-md">
            <p className="text-sm text-gray-500 mb-1">交易雜湊（TX Hash）</p>
            <p aria-label="tx-hash" className="font-mono text-sm break-all text-blue-700">
              {txHash}
            </p>
          </div>
        </div>
      </main>
    )
  }

  // ── review / submitting ───────────────────────────────────────────────────

  if (phase === 'review' || phase === 'submitting') {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">確認您的答案</h1>

        <div className="space-y-4 mb-8">
          {survey.questions.map((q, i) => (
            <div key={q.id} className="bg-gray-50 border rounded p-4">
              <p className="text-sm text-gray-500 mb-1">
                第 {i + 1} 題{q.required ? '（必填）' : '（選填）'}
              </p>
              <p className="font-medium mb-2">{q.prompt}</p>
              <p className="text-blue-700">{getAnswerDisplay(q)}</p>
            </div>
          ))}
        </div>

        {submitError && (
          <p role="alert" className="text-red-500 mb-4 text-sm">
            {submitError}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setPhase('filling')}
            disabled={phase === 'submitting'}
            className="border px-6 py-2 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            返回修改
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={phase === 'submitting'}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {phase === 'submitting' ? '提交中…' : '確認提交'}
          </button>
        </div>
      </main>
    )
  }

  // ── filling ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">{survey.title}</h1>
      <p className="text-sm text-gray-500 mb-6">
        截止日期：{new Date(survey.deadline).toLocaleDateString('zh-TW')}
      </p>

      {validationError && (
        <p role="alert" className="text-red-500 mb-4 text-sm">
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
          <fieldset key={q.id} className="border rounded p-4">
            <legend className="text-sm text-gray-500 px-1">
              第 {i + 1} 題{q.required && <span className="text-red-500 ml-1">*</span>}
            </legend>
            <p className="font-medium mt-2 mb-3">{q.prompt}</p>

            <div className="mt-1">
              {q.type === 'single_choice' && q.options_json && (
                <div className="space-y-2">
                  {q.options_json.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
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
                      <label key={opt} className="flex items-center gap-2 cursor-pointer">
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
                  className="w-full border rounded p-2 text-sm"
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
                    <label key={n} className="flex flex-col items-center gap-1 cursor-pointer">
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
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          預覽答案
        </button>
      </form>
    </main>
  )
}
