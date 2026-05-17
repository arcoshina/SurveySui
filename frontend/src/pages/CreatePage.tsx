import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { renderMarkdown } from '../lib/markdown'
import { parseFrontmatter } from '../lib/frontmatter'

const TEMPLATE = `---
title: "問卷標題"
perResponse: 10
maxResponses: 100
deadline: "2027-12-31T23:59:59Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "您最喜歡 Sui 的哪個特性？"
    required: true
    options:
      - Move 語言
      - Object model
      - 低 gas
  - id: q2
    type: SHORT_ANSWER
    prompt: "有什麼建議？"
    required: false
---

在這裡撰寫問卷說明文字...
`

export default function CreatePage() {
  const navigate = useNavigate()
  const [content, setContent] = useState(TEMPLATE)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) {
      setError('請填寫問卷內容')
      return
    }
    const result = parseFrontmatter(content)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    navigate('/fund', { state: { contentMd: content } })
  }

  const previewHtml = renderMarkdown(content)

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">建立問卷</h1>

      <p className="text-sm text-gray-600 mb-6">
        在 Markdown frontmatter 中填寫獎勵設定：
        <code className="bg-gray-100 px-1 rounded">perResponse</code>（每份獎勵 RWD 數量）、
        <code className="bg-gray-100 px-1 rounded">maxResponses</code>（名額上限）、
        <code className="bg-gray-100 px-1 rounded">deadline</code>（截止日，ISO 格式）。
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col md:flex-row gap-4 mb-6 md:h-100">
          <div className="flex-1 flex flex-col">
            <label htmlFor="content" className="font-semibold mb-1">
              問卷內容（Markdown with frontmatter）
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 border rounded p-2 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {error && (
              <p role="alert" className="text-red-500 text-sm mt-1">
                {error}
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

        <button
          type="submit"
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          下一步：前往注資 →
        </button>
      </form>
    </main>
  )
}
