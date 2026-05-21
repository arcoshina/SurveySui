import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCurrentAccount, useSuiClientQuery } from '@mysten/dapp-kit'
import { renderMarkdown } from '../lib/markdown'
import { parseFrontmatter } from '../lib/frontmatter'
import { estimateFundCostV2 } from '../lib/ptb'
import { formatSssr } from '../lib/format'

function makeTemplate(): string {
  // 在 frontmatter 內加 draftStamp 自訂欄位，確保每張新草稿的 content_hash 不同 ——
  // 避免合約端 EDuplicateSurvey；parser 只認識 perResponse/maxResponses/deadline，
  // 其他 key 自動忽略，因此不影響業務邏輯，但會進入 SHA-256(完整 markdown)。
  const stamp = new Date().toISOString()
  return `---
draftStamp: "${stamp}"
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
  - id: q3
    type: MULTI_CHOICE
    prompt: "複選測試"
    required: false
    options:
      - A
      - B
---

在這裡撰寫問卷說明文字...
`
}

const DRAFT_KEY_PREFIX = 'surveysui:draft:'

function makeDraftId(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined
  if (cryptoObj?.randomUUID) return `draft-${cryptoObj.randomUUID()}`
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export default function CreatePage() {
  const navigate = useNavigate()
  const [content, setContent] = useState(makeTemplate)
  const [error, setError] = useState<string | null>(null)
  const [encrypt, setEncrypt] = useState(true)

  const account = useCurrentAccount()
  const packageId = import.meta.env.VITE_PACKAGE_ID ?? ''
  const poolId = import.meta.env.VITE_AMM_POOL_ID ?? ''

  const parsed = useMemo(() => parseFrontmatter(content), [content])

  const { data: poolData } = useSuiClientQuery(
    'getObject',
    { id: poolId, options: { showContent: true } },
    { enabled: !!poolId },
  )

  const { data: coinsData } = useSuiClientQuery(
    'getCoins',
    {
      owner: account?.address ?? '',
      coinType: `${packageId}::stacked_survey_reward::STACKED_SURVEY_REWARD`,
    },
    { enabled: !!account && !!packageId },
  )

  const totalSuiInvested = useMemo<bigint>(() => {
    if (poolData?.data?.content?.dataType !== 'moveObject') return 0n
    const fields = (poolData.data.content as { fields: Record<string, string> }).fields
    return BigInt(fields.total_sui_invested ?? '0')
  }, [poolData])

  const feeConfig = useMemo(() => {
    if (poolData?.data?.content?.dataType !== 'moveObject') {
      return { totalFeeBps: 2000n, discountBps: 5000n }
    }
    const fields = (poolData.data.content as { fields: Record<string, any> }).fields
    const feeFields = fields?.fee_config?.fields
    if (!feeFields) {
      return { totalFeeBps: 2000n, discountBps: 5000n }
    }
    return {
      totalFeeBps: BigInt(feeFields.total_fee_bps ?? '2000'),
      discountBps: BigInt(feeFields.discount_bps ?? '5000'),
    }
  }, [poolData])

  const creatorSssrBalance = useMemo(() => {
    if (!coinsData) return 0n
    return coinsData.data.reduce((sum, c) => sum + BigInt(c.balance), 0n)
  }, [coinsData])

  const [costBreakdown, setCostBreakdown] = useState<{
    netSssrBase: bigint
    effectiveFeeBps: bigint
    grossSssrBase: bigint
    offsetIn: bigint
    minted: bigint
    suiToInvest: bigint
  } | null>(null)

  useEffect(() => {
    if (!parsed.ok) {
      setCostBreakdown(null)
      return
    }

    const timer = setTimeout(() => {
      try {
        const est = estimateFundCostV2({
          perResponse: BigInt(parsed.data.perResponse),
          maxResponses: parsed.data.maxResponses,
          totalSuiInvested,
          feeConfig,
          creatorSssrBalance,
        })
        setCostBreakdown(est)
      } catch (e) {
        console.error(e)
        setCostBreakdown(null)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [parsed, totalSuiInvested, feeConfig, creatorSssrBalance])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) {
      setError('請填寫問卷內容')
      return
    }
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)

    const draftId = makeDraftId()
    window.localStorage.setItem(
      `${DRAFT_KEY_PREFIX}${draftId}`,
      JSON.stringify({ contentMd: content, encrypt, savedAt: Date.now() }),
    )
    navigate(`/fund/${draftId}`)
  }

  const previewHtml = renderMarkdown(content)
  const deadlineIso = parsed.ok ? new Date(parsed.data.deadlineMs).toISOString() : null

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">建立問卷</h1>

      <p className="text-sm text-gray-600 mb-6">
        在 Markdown frontmatter 中填寫獎勵設定：
        <code className="bg-gray-100 px-1 rounded">perResponse</code>（每份獎勵 sSSR 數量）、
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

          <div className="flex-1 flex flex-col gap-3">
            <div
              aria-label="獎勵設定預覽"
              className="border rounded p-4 bg-blue-50 text-sm space-y-1"
            >
              {parsed.ok ? (
                <>
                  <p>
                    <span className="font-semibold">perResponse：</span>
                    <span>{parsed.data.perResponse}</span> sSSR / 份
                  </p>
                  <p>
                    <span className="font-semibold">maxResponses：</span>
                    <span>{parsed.data.maxResponses}</span> 份
                  </p>
                  <p>
                    <span className="font-semibold">deadline：</span>
                    <time dateTime={deadlineIso!}>{deadlineIso}</time>
                  </p>
                  {costBreakdown && (
                    <div className="border-t border-blue-200 mt-2 pt-2 space-y-1 text-xs text-gray-700">
                      <p>
                        <span className="font-semibold">既有 sSSR 折抵：</span>
                        <span>{formatSssr(costBreakdown.offsetIn)}</span> sSSR
                      </p>
                      <p>
                        <span className="font-semibold">需新鑄 sSSR (AMM)：</span>
                        <span>{formatSssr(costBreakdown.minted)}</span> sSSR
                      </p>
                      <p>
                        <span className="font-semibold">平台手續費 (fee)：</span>
                        <span>{formatSssr(costBreakdown.grossSssrBase * costBreakdown.effectiveFeeBps / 10000n)}</span> sSSR ({Number(costBreakdown.effectiveFeeBps) / 100}%)
                      </p>
                      <p className="text-blue-700 font-semibold mt-1">
                        <span className="font-semibold">預估 SUI 消耗：</span>
                        <span>{(Number(costBreakdown.suiToInvest) / 1e9).toFixed(4)}</span> SUI
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-red-600">frontmatter 尚未通過：{parsed.error}</p>
              )}
            </div>

            <div className="flex-1 flex flex-col">
              <span className="font-semibold mb-1">Markdown 預覽</span>
              <div
                aria-label="markdown 預覽"
                className="flex-1 border rounded p-4 overflow-y-auto bg-gray-50 prose max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <input
            id="encrypt-survey"
            type="checkbox"
            checked={encrypt}
            onChange={(e) => setEncrypt(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
          />
          <label htmlFor="encrypt-survey" className="text-sm font-medium text-gray-700 cursor-pointer">
            加密問卷題目（推薦，防範鏈上窺探並保護隱私）
          </label>
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
