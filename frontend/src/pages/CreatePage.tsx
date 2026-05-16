import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { renderMarkdown } from '../lib/markdown'

type FormErrors = {
  content?: string
  perResponse?: string
  maxResponses?: string
  deadline?: string
}

export default function CreatePage() {
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [perResponse, setPerResponse] = useState('')
  const [maxResponses, setMaxResponses] = useState('')
  const [deadline, setDeadline] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [surveyId, setSurveyId] = useState<string | null>(null)

  function validate(): FormErrors {
    const errs: FormErrors = {}
    if (!content.trim()) errs.content = '請填寫問卷內容'
    const pr = Number(perResponse)
    if (!perResponse || isNaN(pr) || pr <= 0) errs.perResponse = '獎勵金額須大於 0'
    const mr = Number(maxResponses)
    if (!maxResponses || isNaN(mr) || !Number.isInteger(mr) || mr <= 0)
      errs.maxResponses = '名額須為正整數'
    if (!deadline) {
      errs.deadline = '請選擇截止日'
    } else if (new Date(deadline) <= new Date()) {
      errs.deadline = '截止日須為未來時間'
    }
    return errs
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_md: content,
          per_response: Number(perResponse),
          max_responses: Number(maxResponses),
          deadline: new Date(deadline).toISOString(),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSurveyId(data.id ?? null)
      setSubmitSuccess(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const previewHtml = renderMarkdown(content)

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">建立問卷</h1>

      {submitSuccess && (
        <div role="status" className="bg-green-100 text-green-800 p-4 rounded mb-6">
          問卷已成功建立！
          {surveyId && (
            <button
              type="button"
              onClick={() =>
                navigate(`/fund/${surveyId}`, {
                  state: {
                    perResponse: Number(perResponse),
                    maxResponses: Number(maxResponses),
                    deadlineMs: new Date(deadline).getTime(),
                  },
                })
              }
              className="ml-4 underline font-semibold"
            >
              前往注資 →
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="flex gap-4 mb-6" style={{ height: '400px' }}>
          <div className="flex-1 flex flex-col">
            <label htmlFor="content" className="font-semibold mb-1">
              問卷內容（Markdown）
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 border rounded p-2 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={'# 問卷標題\n\n## 問題 1\n請描述您的看法...'}
            />
            {errors.content && (
              <p role="alert" className="text-red-500 text-sm mt-1">
                {errors.content}
              </p>
            )}
          </div>

          <div className="flex-1 flex flex-col">
            <span className="font-semibold mb-1">預覽</span>
            <div
              aria-label="markdown 預覽"
              className="flex-1 border rounded p-4 overflow-y-auto bg-gray-50 prose max-w-none"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label htmlFor="perResponse" className="block font-semibold mb-1">
              每份獎勵（RWD）
            </label>
            <input
              id="perResponse"
              type="number"
              value={perResponse}
              onChange={(e) => setPerResponse(e.target.value)}
              className="w-full border rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              min="1"
              placeholder="10"
            />
            {errors.perResponse && (
              <p role="alert" className="text-red-500 text-sm mt-1">
                {errors.perResponse}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="maxResponses" className="block font-semibold mb-1">
              名額上限
            </label>
            <input
              id="maxResponses"
              type="number"
              value={maxResponses}
              onChange={(e) => setMaxResponses(e.target.value)}
              className="w-full border rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              min="1"
              placeholder="100"
            />
            {errors.maxResponses && (
              <p role="alert" className="text-red-500 text-sm mt-1">
                {errors.maxResponses}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="deadline" className="block font-semibold mb-1">
              截止日期
            </label>
            <input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full border rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {errors.deadline && (
              <p role="alert" className="text-red-500 text-sm mt-1">
                {errors.deadline}
              </p>
            )}
          </div>
        </div>

        {submitError && (
          <p role="alert" className="text-red-500 mb-4">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? '提交中...' : '建立問卷'}
        </button>
      </form>
    </main>
  )
}
