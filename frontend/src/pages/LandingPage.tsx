import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, ClipboardList, Gift, Globe, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'
import type { EventId } from '@mysten/sui/client'
import { parseFullSurveyMarkdown } from '../lib/frontmatter'
import { useLanguage } from '../context/LanguageContext'
import { useT } from '../i18n'

const stepsIcons = [FileText, ClipboardList, Gift]
const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID ?? ''

/** SurveyRegistered 事件 parsedJson 中本頁用到的欄位。 */
type RegisteredEvent = { survey_id?: string; vault_id?: string; registered_at_ms?: string | number }
/** SurveyClaimed 事件 parsedJson 中本頁用到的欄位。 */
type ClaimedEvent = { respondent?: string; vault_id?: string }
/** Sui 物件 moveObject content 的動態 fields 包裝。 */
type MoveContent = { dataType?: string; fields?: Record<string, unknown> }

interface PublicSurveyItem {
  surveyId: string
  vaultId: string
  title: string
  description: string
  perResponse: number
  maxResponses: number
  claimedCount: number
  deadlineMs: number
  language: string
  allowedSources: number[]
  allowedNftType: string | null
  registeredAtMs: number
}

function normalizeSuiId(id: string): string {
  if (!id) return ''
  let cleaned = id.toLowerCase().trim()
  if (cleaned.startsWith('0x')) {
    cleaned = cleaned.slice(2)
  }
  return cleaned.padStart(64, '0')
}

// 簡單高效的 Unicode 自動語系偵測
function detectLang(text: string): string {
  let zhCount = 0
  let jaCount = 0
  let koCount = 0
  let esCount = 0

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i)
    
    // 諺文 (韓文)
    if (
      (charCode >= 0xac00 && charCode <= 0xd7af) ||
      (charCode >= 0x1100 && charCode <= 0x11ff) ||
      (charCode >= 0x3130 && charCode <= 0x318f)
    ) {
      koCount++
    }
    // 平假名/片假名 (日文)
    else if (
      (charCode >= 0x3040 && charCode <= 0x309f) ||
      (charCode >= 0x30a0 && charCode <= 0x30ff)
    ) {
      jaCount++
    }
    // CJK 統一漢字 (中日韓，無假名或諺文時傾向中文)
    else if (charCode >= 0x4e00 && charCode <= 0x9fff) {
      zhCount++
    }
    // 西班牙文特有字元 (á, é, í, ó, ú, ü, ñ, ¿, ¡)
    else if (/[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/.test(text[i])) {
      esCount++
    }
  }

  if (koCount > 0 && koCount >= jaCount && koCount >= zhCount) {
    return 'ko'
  }
  if (jaCount > 0) {
    return 'ja'
  }
  if (zhCount > 0) {
    return 'zh'
  }
  if (esCount > 0) {
    return 'es'
  }
  return 'en'
}

export default function LandingPage() {
  const t = useT('landing')
  const tExplore = useT('explore')
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { lang: uiLang } = useLanguage()

  const [loading, setLoading] = useState(true)
  const [surveys, setSurveys] = useState<PublicSurveyItem[]>([])
  const [claimedVaults, setClaimedVaults] = useState<Set<string>>(new Set())

  const [currentPage, setCurrentPage] = useState(0)
  const [cardsPerPage, setCardsPerPage] = useState(3)

  // 監聽視窗寬度調整每頁卡片數量
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1024) {
        setCardsPerPage(3)
      } else if (window.innerWidth >= 640) {
        setCardsPerPage(2)
      } else {
        setCardsPerPage(1)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 1. 載入並解析公開問卷
  useEffect(() => {
    if (!PACKAGE_ID) return
    let cancelled = false
    setLoading(true)

    async function loadExploreData() {
      try {
        const timeLimit = Date.now() - 7 * 86400000
        let cursor: EventId | null | undefined = null
        let registeredEvents: RegisteredEvent[] = []
        let hasNext = true

        // 降序查詢註冊事件，7 天時間窗口截斷
        while (hasNext && !cancelled) {
          const res = await suiClient.queryEvents({
            query: { MoveEventType: `${PACKAGE_ID}::survey_registry::SurveyRegistered` },
            cursor,
            limit: 50,
            order: 'descending',
          })
          let hitDeadline = false
          for (const ev of res.data) {
            const j = ev.parsedJson as RegisteredEvent | null
            if (!j) continue
            const regTime = Number(j.registered_at_ms || 0)
            if (regTime < timeLimit) {
              hitDeadline = true
              break
            }
            registeredEvents.push(j)
          }
          if (hitDeadline || !res.hasNextPage) {
            break
          }
          cursor = res.nextCursor
        }

        if (cancelled || registeredEvents.length === 0) {
          setSurveys([])
          setLoading(false)
          return
        }

        // 批次加載 Survey 與 Vault 物件
        const surveyIds = registeredEvents.map((e) => String(e.survey_id ?? ''))
        const vaultIds = registeredEvents.map((e) => String(e.vault_id ?? ''))

        const chunk = <T,>(arr: T[], size: number): T[][] =>
          Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
            arr.slice(i * size, i * size + size)
          )

        const surveyChunks = chunk(surveyIds, 50)
        const vaultChunks = chunk(vaultIds, 50)

        let surveyObjects: Awaited<ReturnType<typeof suiClient.multiGetObjects>> = []
        let vaultObjects: Awaited<ReturnType<typeof suiClient.multiGetObjects>> = []

        for (const c of surveyChunks) {
          if (cancelled) return
          const res = await suiClient.multiGetObjects({ ids: c, options: { showContent: true } })
          surveyObjects = [...surveyObjects, ...res]
        }
        for (const c of vaultChunks) {
          if (cancelled) return
          const res = await suiClient.multiGetObjects({ ids: c, options: { showContent: true } })
          vaultObjects = [...vaultObjects, ...res]
        }

        const items: PublicSurveyItem[] = []

        // 解析與過濾
        for (let i = 0; i < registeredEvents.length; i++) {
          const event = registeredEvents[i]
          const sObj = surveyObjects[i]
          const vObj = vaultObjects[i]

          if (!sObj?.data || sObj.error || !vObj?.data || vObj.error) continue

          const sFields = (sObj.data.content as MoveContent | null | undefined)?.fields
          const vFields = (vObj.data.content as MoveContent | null | undefined)?.fields
          if (!sFields || !vFields) continue

          // 狀態過濾 (已結束/已刪除)
          if (Number(vFields.status) !== 0) continue

          // 額滿過濾
          const claimedCount = Number(vFields.claimed_count || 0)
          const maxResponses = Number(vFields.max_responses || 0)
          if (claimedCount >= maxResponses) continue

          // 儲存位置過濾：跳過 Walrus 託管問卷，保證極速載入
          const getOptionVec = (opt: unknown): Uint8Array | null => {
            if (!opt) return null
            if (Array.isArray(opt)) {
              if (opt.length === 0) return null
              const first = opt[0]
              if (Array.isArray(first)) return new Uint8Array(first.map(Number))
              if (typeof first === 'string') {
                return new Uint8Array(first.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || [])
              }
              return new Uint8Array(opt.map(Number))
            }
            const o = opt as { fields?: { vec?: unknown }; vec?: unknown }
            const vec = o.fields?.vec || o.vec
            if (!Array.isArray(vec) || vec.length === 0) return null
            const first = vec[0]
            if (Array.isArray(first)) return new Uint8Array(first.map(Number))
            if (typeof first === 'string') {
              return new Uint8Array(first.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || [])
            }
            return new Uint8Array(vec.map(Number))
          }

          const surveyBlobIdBytes = getOptionVec(sFields.survey_blob_id)
          if (surveyBlobIdBytes) continue // Walrus 忽略

          // 格式校驗與明文判定 (首 Byte 須為 0x00)
          const rawContent = getOptionVec(sFields.encrypted_content)
          if (!rawContent || rawContent[0] !== 0x00) continue

          // 解析明文 markdown 與 frontmatter
          try {
            const md = new TextDecoder().decode(rawContent.slice(1))
            const parsed = parseFullSurveyMarkdown(md)
            if (!parsed.ok) continue

            const fm = parsed.data
            // 期限過濾
            if (fm.deadlineMs <= Date.now()) continue

            // 語系優先序
            let language = fm.language ? fm.language.toLowerCase() : ''
            if (!language) {
              // 無設定，由內容自動偵測
              const contentToDetect = `${parsed.data.title} ${parsed.data.description}`
              language = detectLang(contentToDetect)
            }

            const allowedNftTypeBytes = getOptionVec(vFields.allowed_nft_type)
            const allowedNftType = allowedNftTypeBytes ? new TextDecoder().decode(allowedNftTypeBytes) : null

            items.push({
              surveyId: String(event.survey_id ?? ''),
              vaultId: String(event.vault_id ?? ''),
              title: fm.title,
              description: fm.description,
              perResponse: fm.perResponse,
              maxResponses: fm.maxResponses,
              claimedCount,
              deadlineMs: fm.deadlineMs,
              language,
              allowedSources: fm.allowedSources,
              allowedNftType,
              registeredAtMs: Number(event.registered_at_ms || 0),
            })
          } catch (e) {
            console.warn('Failed to parse survey markdown:', event.survey_id, e)
          }
        }

        if (!cancelled) {
          setSurveys(items)
          setLoading(false)
        }
      } catch (err) {
        console.error('Failed to load explore surveys:', err)
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadExploreData()
    return () => {
      cancelled = true
    }
  }, [suiClient])

  // 2. 當錢包連接時，批次查詢使用者已填過哪些 Vault
  useEffect(() => {
    if (!account?.address || !PACKAGE_ID) {
      setClaimedVaults(new Set())
      return
    }

    let cancelled = false
    async function checkMyClaims() {
      try {
        const myAddrNorm = normalizeSuiId(account!.address)
        const claimedSet = new Set<string>()
        let evCursor: EventId | null | undefined = null
        let page = 0

        while (!cancelled) {
          const res = await suiClient.queryEvents({
            query: { MoveEventType: `${PACKAGE_ID}::survey_vault::SurveyClaimed` },
            cursor: evCursor,
            limit: 50,
          })
          for (const ev of res.data) {
            const j = ev.parsedJson as ClaimedEvent | null
            if (!j) continue
            if (normalizeSuiId(j.respondent ?? '') === myAddrNorm) {
              claimedSet.add(normalizeSuiId(j.vault_id ?? ''))
            }
          }
          if (!res.hasNextPage || page >= 5) break
          evCursor = res.nextCursor
          page++
        }

        if (!cancelled) {
          setClaimedVaults(claimedSet)
        }
      } catch (e) {
        console.warn('Failed to query user claimed history:', e)
      }
    }

    void checkMyClaims()
    return () => {
      cancelled = true
    }
  }, [account?.address, suiClient])

  // 3. 篩選邏輯
  const filteredSurveys = useMemo(() => {
    const targetLang = uiLang.toLowerCase()
    return surveys.filter((item) => {
      // 填答狀態過濾：已填過則在廣場中過濾隱藏
      if (claimedVaults.has(normalizeSuiId(item.vaultId))) {
        return false
      }
      return item.language === targetLang
    })
  }, [surveys, claimedVaults, uiLang])

  // 4. 限制最多顯示 5 頁的問卷
  const displayedSurveys = useMemo(() => {
    return filteredSurveys.slice(0, 5 * cardsPerPage)
  }, [filteredSurveys, cardsPerPage])

  // 5. 將問卷分頁
  const pages = useMemo(() => {
    const result = []
    for (let i = 0; i < displayedSurveys.length; i += cardsPerPage) {
      result.push(displayedSurveys.slice(i, i + cardsPerPage))
    }
    return result
  }, [displayedSurveys, cardsPerPage])

  // 6. 分頁邊界校正
  useEffect(() => {
    if (currentPage >= pages.length && pages.length > 0) {
      setCurrentPage(pages.length - 1)
    }
  }, [pages.length, currentPage])

  return (
    <div className="flex-1 bg-white text-slate-800 dark:bg-neutral-950 dark:text-neutral-300 animate-fadeIn transition-colors">
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-normal leading-tight mb-6 text-slate-900 dark:text-white">
          {t.heroTitle}
        </h1>
        <p className="text-lg text-slate-500 dark:text-neutral-400 max-w-2xl mx-auto mb-10 font-normal">
          {t.heroDesc}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/docs"
            className="btn-secondary"
          >
            {t.btnDocs}
          </Link>
          <a
            href="/guide"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            {t.btnGuide}
          </a>
          <Link
            to="/create"
            className="btn-primary"
          >
            {t.btnCreate}
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-slate-100/50 dark:bg-neutral-900/70 border-y border-slate-100 dark:border-neutral-900 py-16 transition-colors">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-normal text-slate-900 dark:text-white text-center mb-12">{t.stepsTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {t.steps.map((step, index) => {
              const Icon = stepsIcons[index]
              return (
                <div key={index} className="text-center flex flex-col items-center">
                  <div className="text-blue-700 dark:text-blue-400 mb-3 flex items-center justify-center h-12 w-12 bg-white dark:bg-blue-900/30 border border-slate-200 dark:border-blue-900/30 rounded-full">
                    <Icon size={24} />
                  </div>
                  <div className="inline-block bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-normal rounded-full px-3 py-1 mb-3">
                    {t.stepLabel} {index + 1}
                  </div>
                  <h3 className="text-lg font-normal text-slate-900 dark:text-white mb-2">{step.title}</h3>
                  <p className="text-slate-600 dark:text-neutral-400 text-sm leading-relaxed font-normal">{step.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>


      {/* Explore Plaza Section */}
      <section id="explore-section" className="border-t border-slate-100 dark:border-neutral-900 py-16 transition-colors">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-normal text-slate-900 dark:text-white mb-3">
              {tExplore.pageTitle}
            </h2>
            <p className="text-slate-500 dark:text-neutral-400 max-w-2xl mx-auto font-normal text-sm">
              {tExplore.pageDesc}
            </p>
          </div>

          {/* 載入中狀態 (骨架屏) */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="bg-slate-100 dark:bg-neutral-950 border border-slate-300 dark:border-neutral-800 rounded-2xl p-5 space-y-4 animate-pulse"
                >
                  <div className="h-5 bg-slate-200 dark:bg-neutral-800 rounded w-2/3" />
                  <div className="space-y-2">
                    <div className="h-4 bg-slate-200 dark:bg-neutral-800 rounded w-full" />
                    <div className="h-4 bg-slate-200 dark:bg-neutral-800 rounded w-5/6" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <div className="h-6 bg-slate-200 dark:bg-neutral-800 rounded w-16" />
                    <div className="h-6 bg-slate-200 dark:bg-neutral-800 rounded w-20" />
                  </div>
                  <div className="h-10 bg-slate-200 dark:bg-neutral-800 rounded w-full pt-4" />
                </div>
              ))}
            </div>
          ) : filteredSurveys.length === 0 ? (
            // 空狀態提示
            <div className="bg-slate-50/50 dark:bg-neutral-900/10 border border-dashed border-slate-200 dark:border-neutral-800 rounded-3xl p-12 text-center transition-colors">
              <div className="text-neutral-400 dark:text-neutral-500 mb-3 flex justify-center">
                <Globe size={32} />
              </div>
              <p className="text-muted text-sm font-normal">
                {tExplore.emptyState}
              </p>
            </div>
          ) : (
            <div>
              {/* Carousel Container */}
              <div className="relative px-1 md:px-2">
                {/* 左右換頁按鈕 (桌面端與平板端) */}
                {pages.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                      disabled={currentPage === 0}
                      className="absolute left-0 lg:-left-14 top-1/2 -translate-y-1/2 p-2 rounded-full border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-900 disabled:opacity-30 disabled:pointer-events-none transition-colors z-10 hidden md:flex items-center justify-center cursor-pointer"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(pages.length - 1, prev + 1))}
                      disabled={currentPage === pages.length - 1}
                      className="absolute right-0 lg:-right-14 top-1/2 -translate-y-1/2 p-2 rounded-full border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-900 disabled:opacity-30 disabled:pointer-events-none transition-colors z-10 hidden md:flex items-center justify-center cursor-pointer"
                      aria-label="Next page"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </>
                )}

                {/* 滾動視窗 */}
                <div className="overflow-hidden">
                  <div
                    className="flex transition-transform duration-500 ease-in-out"
                    style={{ transform: `translateX(-${currentPage * 100}%)` }}
                  >
                    {pages.map((pageSurveys, pageIndex) => (
                      <div key={pageIndex} className="w-full shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-1">
                        {pageSurveys.map((item) => {
                          const remaining = item.maxResponses - item.claimedCount
                          return (
                            <Link
                              key={item.vaultId}
                              to={`/s/${item.surveyId}`}
                              className="bg-slate-100 dark:bg-neutral-700 border border-slate-300 dark:border-neutral-600 rounded-2xl p-5 flex flex-col justify-between transition-colors hover:bg-slate-200 dark:hover:bg-neutral-600 hover:border-slate-400 dark:hover:border-neutral-500 cursor-pointer no-underline block text-inherit"
                            >
                              {/* 標題與說明 */}
                              <div className="mb-3">
                                <h3 className="text-h3 text-slate-900 dark:text-neutral-100 line-clamp-1 mb-1 font-normal">
                                  {item.title}
                                </h3>
                                <p className="text-slate-700 dark:text-neutral-350 text-sm line-clamp-2 leading-normal font-normal">
                                  {item.description || '—'}
                                </p>
                              </div>

                              {/* 問卷細節 (統一推到底部對齊) */}
                              <div className="mt-auto pt-2 border-t border-slate-200/50 dark:border-neutral-900 space-y-2 font-normal">
                                {/* 獎勵列 */}
                                <div className="flex justify-between items-center text-sm">
                                  <span className="text-slate-500 dark:text-neutral-450">{tExplore.rewardLabel}</span>
                                  <span className="text-body text-slate-800 dark:text-neutral-300 font-mono">{item.perResponse} SSR</span>
                                </div>
                                {/* 截止日期與剩餘份數 */}
                                <div className="flex justify-between items-end pt-2 border-t border-slate-200/50 dark:border-neutral-900">
                                  <div className="flex flex-col">
                                    <span className="text-slate-500 dark:text-neutral-450 text-sm mb-0.5">
                                      {tExplore.deadlineLabel}
                                    </span>
                                    <span className="text-body text-slate-800 dark:text-neutral-300 font-mono">
                                      {new Date(item.deadlineMs).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-end">
                                    <span className="text-slate-500 dark:text-neutral-450 text-sm mb-0.5">
                                      {tExplore.remainingLabel}
                                    </span>
                                    <span className="text-body text-slate-800 dark:text-neutral-300 font-mono">
                                      {remaining > 100 ? '>100' : remaining}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 頁數圓點顯示區 (含手機端輔助按鈕) */}
              {pages.length > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                  {/* 手機端換頁按鈕 */}
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                    disabled={currentPage === 0}
                    className="p-1 rounded-full text-slate-400 dark:text-neutral-600 hover:text-slate-700 dark:hover:text-neutral-300 disabled:opacity-30 disabled:pointer-events-none md:hidden cursor-pointer"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={20} />
                  </button>

                  {/* 圓點 */}
                  {pages.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentPage(index)}
                      className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                        currentPage === index
                          ? 'w-6 bg-blue-600 dark:bg-blue-500'
                          : 'w-2 bg-slate-300 dark:bg-neutral-700 hover:bg-slate-400 dark:hover:bg-neutral-600'
                      }`}
                      aria-label={`Go to page ${index + 1}`}
                    />
                  ))}

                  {/* 手機端換頁按鈕 */}
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(pages.length - 1, prev + 1))}
                    disabled={currentPage === pages.length - 1}
                    className="p-1 rounded-full text-slate-400 dark:text-neutral-600 hover:text-slate-700 dark:hover:text-neutral-300 disabled:opacity-30 disabled:pointer-events-none md:hidden cursor-pointer"
                    aria-label="Next page"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-100/50 dark:bg-neutral-900/70 border-t border-slate-100 dark:border-neutral-900 py-16 transition-colors">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-2xl font-normal text-slate-900 dark:text-white text-center mb-12">{t.faqTitle}</h2>
          <div className="space-y-8">
            {t.faqs.map((faq, index) => (
              <div key={index}>
                <p className="font-normal text-slate-900 dark:text-white mb-2 text-lg">{faq.q}</p>
                <p className="text-slate-600 dark:text-neutral-400 text-sm leading-relaxed font-normal">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}
