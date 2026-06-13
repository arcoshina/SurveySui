import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpen, ChevronDown } from 'lucide-react'
import { renderMarkdown } from '../../lib/markdown'
import { listDocs, loadDocBody } from '../../lib/docsContent'
import { useLanguage } from '../../context/LanguageContext'
import { useT } from '../../i18n'

type Status = 'loading' | 'ready' | 'error'

export default function DocumentsPage() {
  const t = useT('docs')
  const { lang } = useLanguage()
  const docs = useMemo(() => listDocs(lang), [lang])

  const [selectedSlug, setSelectedSlug] = useState<string | null>(docs[0]?.slug ?? null)
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<Status>('loading')
  const [navOpen, setNavOpen] = useState(false) // 手機版選單收合狀態（md+ 永遠展開）
  const mainRef = useRef<HTMLDivElement>(null)
  const asideRef = useRef<HTMLElement>(null)

  // 從正文解析 h2 標題（剛好兩個 #，自動排除 h3+），供左欄目錄使用
  const headings = useMemo(() => {
    const result: string[] = []
    for (const line of body.split(/\r?\n/)) {
      const m = /^##\s+(.+)$/.exec(line)
      if (m) result.push(m[1].trim())
    }
    return result
  }, [body])

  // 點目錄第 i 項 → 捲動到右側對應的第 i 個 <h2>（清單與內容同源、順序一致）
  const scrollToHeading = (index: number) => {
    mainRef.current?.querySelectorAll('h2')[index]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  // 切換語言後當前 slug 可能在新語系不存在（各語系獨立、不後備）→ 自動退回該語系第一篇
  const activeSlug = docs.some((d) => d.slug === selectedSlug) ? selectedSlug : (docs[0]?.slug ?? null)

  useEffect(() => {
    if (activeSlug !== selectedSlug) setSelectedSlug(activeSlug)
  }, [activeSlug, selectedSlug])

  useEffect(() => {
    if (!activeSlug) return
    let cancelled = false
    setStatus('loading')
    loadDocBody(lang, activeSlug)
      .then((md) => {
        if (cancelled) return
        if (md == null) {
          setStatus('error')
          return
        }
        setBody(md)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [lang, activeSlug])

  // 雙向 sticky：側欄比視窗高時，往下捲跟著走並黏在底部（頁腳上方），往上捲黏回頂端。
  // 純 CSS sticky 一次只能黏一邊，故用 transform 位移；僅桌機（md+）啟用，手機維持單欄堆疊。
  useEffect(() => {
    const aside = asideRef.current
    const container = aside?.parentElement
    if (!aside || !container) return
    const NAVBAR = 64 // 對應 top-16（4rem）

    let translate = 0
    let frame = 0

    const apply = () => {
      frame = 0
      // 手機版（單欄堆疊）不黏附，還原位移
      if (!window.matchMedia('(min-width: 768px)').matches) {
        if (translate !== 0) {
          translate = 0
          aside.style.transform = ''
        }
        return
      }
      const vh = window.innerHeight
      const asideH = aside.offsetHeight
      // 去掉目前位移後的自然視窗頂端位置
      const naturalTop = aside.getBoundingClientRect().top - translate
      // 渲染後頂端可落在 [lo, hi]：頂端最高黏在 NAVBAR；側欄較高時最低讓底部貼齊視窗底
      const lo = Math.min(NAVBAR, vh - asideH)
      const renderedTop = Math.min(NAVBAR, Math.max(lo, naturalTop))
      // 不可超出容器（避免蓋到頁腳）
      const maxTranslate = Math.max(0, container.offsetHeight - asideH)
      translate = Math.min(Math.max(renderedTop - naturalTop, 0), maxTranslate)
      aside.style.transform = `translateY(${translate}px)`
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }

    apply()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // 內容高度變化（展開 h2 目錄、切換文章）時重算
    const ro = new ResizeObserver(schedule)
    ro.observe(aside)
    ro.observe(container)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="flex-1 bg-white text-slate-800 dark:bg-neutral-950 dark:text-neutral-300 transition-colors duration-200">
      <div className="mx-auto max-w-6xl px-6 py-12 flex flex-col md:flex-row gap-8">
        {/* 左側選單（由 manifest 自動產生） */}
        <aside ref={asideRef} className="w-full md:w-64 shrink-0 space-y-2 self-start will-change-transform">
          <button
            onClick={() => setNavOpen((v) => !v)}
            className="w-full flex items-center justify-between text-sm font-normal text-slate-400 dark:text-neutral-500 uppercase tracking-wider px-3 mb-3 md:pointer-events-none"
          >
            <span className="flex items-center gap-2">
              <BookOpen size={16} />
              {t.navHeading}
            </span>
            <ChevronDown
              size={16}
              className={`md:hidden transition-transform ${navOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <div className={`${navOpen ? 'block' : 'hidden'} md:block space-y-2`}>
          {docs.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400 dark:text-neutral-500">{t.empty}</div>
          ) : (
            docs.map((doc) => (
              <div key={doc.slug}>
                <button
                  onClick={() => {
                    setSelectedSlug(doc.slug)
                    setNavOpen(false) // 手機版選文章後自動收合
                  }}
                  className={`w-full text-left px-6 py-1 rounded-xl text-sm font-normal flex items-center gap-2 transition-all cursor-pointer ${
                    activeSlug === doc.slug
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-medium'
                      : 'hover:bg-slate-50 dark:hover:bg-neutral-900 text-slate-600 dark:text-neutral-400'
                  }`}
                >
                  <span>{doc.title}</span>
                </button>
                {activeSlug === doc.slug && status === 'ready' && headings.length > 0 && (
                  <ul className="pl-9 mt-1 space-y-1">
                    {headings.map((heading, i) => (
                      <li key={i}>
                        <button
                          onClick={() => scrollToHeading(i)}
                          className="w-full text-left text-xs text-slate-500 dark:text-neutral-500 hover:text-slate-800 dark:hover:text-neutral-300 transition-colors cursor-pointer py-0.5"
                        >
                          {heading}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-3 mt-4 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span>{t.backToHome}</span>
          </Link>
        </aside>

        {/* 右側文件內容 */}
        <main className="flex-1 bg-slate-50/50 dark:bg-neutral-900/20 border border-slate-100 dark:border-neutral-900/60 rounded-3xl p-6 sm:p-10 transition-colors">
          {docs.length === 0 ? (
            <p className="text-slate-500 dark:text-neutral-400">{t.empty}</p>
          ) : status === 'loading' ? (
            <p className="text-slate-400 dark:text-neutral-500">{t.loading}</p>
          ) : status === 'error' ? (
            <p className="text-slate-500 dark:text-neutral-400">{t.loadError}</p>
          ) : (
            <div
              ref={mainRef}
              className="prose prose-slate dark:prose-invert max-w-none
                [&>h1]:text-3xl [&>h1]:font-normal [&>h1]:text-slate-900 dark:[&>h1]:text-white [&>h1]:mb-6
                [&>h2]:text-xl [&>h2]:font-normal [&>h2]:text-slate-900 dark:[&>h2]:text-neutral-200 [&>h2]:mt-8 [&>h2]:mb-4 [&>h2]:scroll-mt-32
                [&>p]:text-base [&>p]:leading-relaxed [&>p]:mb-4 [&>p]:text-slate-600 dark:[&>p]:text-neutral-400
                [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-2 [&>ul]:mb-6 [&>ul]:text-slate-600 dark:[&>ul]:text-neutral-400
                [&>ul_strong]:text-slate-800 dark:[&>ul_strong]:text-neutral-200
                [&_code]:bg-slate-100 dark:[&_code]:bg-neutral-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
            />
          )}
        </main>
      </div>

    </div>
  )
}
