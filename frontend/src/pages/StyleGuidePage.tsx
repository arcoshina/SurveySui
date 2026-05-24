import React from 'react'
import { useTheme } from '../context/ThemeContext'
import { useLanguage } from '../context/LanguageContext'
import { Info, AlertCircle, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function StyleGuidePage() {
  const { isDark, toggleTheme } = useTheme()
  const { lang } = useLanguage()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 text-slate-800 dark:text-neutral-100 transition-colors duration-200 pb-20">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 py-8 px-6 transition-colors shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link to="/dashboard" className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
                <ArrowLeft size={14} /> 返回儀表板
              </Link>
            </div>
            <h1 className="text-3xl font-normal tracking-tight text-slate-800 dark:text-white">
              SurveySui 樣式指引與展示頁 (Style Guide Showcase)
            </h1>
            <p className="text-slate-500 dark:text-neutral-300 mt-1 text-sm">
              此頁面用於展示並調整全站字型、按鈕、輸入框及卡片在<strong>亮色模式</strong>與<strong>暗色模式</strong>下的配色。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 transition-all border border-slate-200 dark:border-neutral-700 shadow-sm"
            >
              切換全站主題：現在是 {isDark ? '🌙 暗黑模式' : '☀️ 亮色模式'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 mt-10 space-y-12">
        {/* Section: Typography */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-8 shadow-sm transition-colors">
          <h2 className="text-xl font-normal border-b pb-4 mb-6 border-slate-100 dark:border-neutral-850 text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></span>
            1. 字型與文字層級 (Typography)
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Light Mode Preview (Forced Light) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 text-slate-800">
              <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider block mb-4">亮色模式樣式 (Light Mode)</span>
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">H1 (.text-3xl.font-extrabold.text-slate-900)</span>
                  <h1 className="text-2xl font-normal text-slate-900">問卷大標題 Title</h1>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">H2 (.text-xl.font-bold.text-slate-800)</span>
                  <h2 className="text-xl font-normal text-slate-900">區塊副標題 Subtitle</h2>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">H3 (.text-sm.font-semibold.text-slate-700)</span>
                  <h3 className="text-lg font-normal text-slate-900">小標題 / 選單項目</h3>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">Body (.text-sm.text-slate-600.leading-relaxed)</span>
                  <p className="text-base text-slate-800 font-normal leading-relaxed">
                    這是主內容字體。為了確保易讀性，亮色模式下建議使用 Slate-600 或 Slate-700，避免使用純黑。
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">Muted (.text-xs.text-slate-400)</span>
                  <p className="text-sm text-slate-600">這是輔助或說明字體，例如時間、提示等次要資訊。</p>
                </div>
              </div>
            </div>

            {/* Dark Mode Preview (Forced Dark) */}
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 text-neutral-100 dark">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-4">暗色模式樣式 (Dark Mode)</span>
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">H1 (.text-3xl.font-extrabold.text-white)</span>
                  <h1 className="text-2xl font-normal text-neutral-100">問卷大標題 Title</h1>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">H2 (.text-xl.font-bold.text-neutral-100)</span>
                  <h2 className="text-xl font-normal text-neutral-200">區塊副標題 Subtitle</h2>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">H3 (.text-sm.font-semibold.text-neutral-300)</span>
                  <h3 className="text-lg font-normal text-neutral-200">小標題 / 選單項目</h3>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">Body (.text-sm.text-neutral-400.leading-relaxed)</span>
                  <p className="text-base text-neutral-300 leading-relaxed">
                    這是主內容字體。為了防止刺眼，暗色模式下建議使用 Neutral-300 或 Neutral-400，而非純白色。
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">Muted (.text-xs.text-neutral-500)</span>
                  <p className="text-sm text-neutral-400">這是輔助或說明字體，例如時間、提示等次要資訊。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Buttons */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-8 shadow-sm transition-colors">
          <h2 className="text-xl font-bold border-b pb-4 mb-6 border-slate-100 dark:border-neutral-850 text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></span>
            2. 按鈕狀態與配色 (Buttons)
          </h2>

          <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6">
            此處列出目前全站常使用的三種主要按鈕樣式。您可以修改顏色，檢視深色背景下的對比度是否足夠（WCAG AAA 級標準）。
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Light Mode Preview */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6 text-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">亮色模式按鈕 (Light Mode)</span>

              {/* Primary Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 block font-mono">1. 主按鈕 (Primary: bg-blue-600 hover:bg-blue-700 text-white)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="bg-blue-700 hover:bg-blue-800 text-neutral-100 font-normal px-5 py-2 rounded-xl transition-all text-base">
                    主要操作
                  </button>
                  <button className="bg-blue-700/50 text-neutral-200 font-normal px-5 py-2 rounded-xl text-base" disabled>
                    已停用
                  </button>
                </div>
              </div>

              {/* Secondary Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 block font-mono">2. 次要按鈕 (Secondary: bg-slate-100 hover:bg-slate-200 text-slate-700)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-normal px-5 py-2 rounded-xl transition-all text-base">
                    次要操作
                  </button>
                  <button className="bg-slate-50 text-slate-400 font-normal px-5 py-2 rounded-xl text-base" disabled>
                    已停用
                  </button>
                </div>
              </div>

              {/* Outline Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 block font-mono">3. 邊框按鈕 (Outline: border border-slate-200 hover:bg-slate-50 text-slate-600)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="border border-slate-200 hover:bg-slate-100 text-slate-600 font-normal px-5 py-2 rounded-xl transition-all text-base">
                    邊框操作
                  </button>
                  <button className="border border-slate-100 text-slate-300 font-normal px-5 py-2 rounded-xl text-base" disabled>
                    已停用
                  </button>
                </div>
              </div>

              {/* Danger Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 block font-mono">4. 警告/刪除按鈕 (Danger: bg-rose-600 hover:bg-rose-700 text-white)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="bg-rose-800 hover:bg-rose-600 text-white font-normal px-5 py-2 rounded-xl transition-all text-base">
                    危險操作
                  </button>
                </div>
              </div>
            </div>

            {/* Dark Mode Preview */}
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 space-y-6 text-neutral-100">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">暗色模式按鈕 (Dark Mode)</span>

              {/* Primary Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-neutral-600 block font-mono">1. 主按鈕 (Primary: dark:bg-blue-700 dark:hover:bg-blue-600 dark:text-neutral-100)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="bg-blue-800 hover:bg-blue-600 text-neutral-200 font-normal px-5 py-2 rounded-xl transition-all text-base">
                    主要操作
                  </button>
                  <button className="bg-blue-900/30 text-neutral-600 font-normal px-5 py-2 rounded-xl text-base" disabled>
                    已停用
                  </button>
                </div>
              </div>

              {/* Secondary Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-neutral-600 block font-mono">2. 次要按鈕 (Secondary: dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="bg-neutral-700 hover:bg-neutral-600 text-neutral-300 font-normal px-5 py-2 rounded-xl transition-all text-base">
                    次要操作
                  </button>
                  <button className="bg-neutral-800 text-neutral-600 font-normal px-5 py-2 rounded-xl text-base" disabled>
                    已停用
                  </button>
                </div>
              </div>

              {/* Outline Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-neutral-600 block font-mono">3. 邊框按鈕 (Outline: dark:border-neutral-800 dark:hover:bg-neutral-900 dark:text-neutral-300)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="bg-neutral-800 hover:bg-neutral-600 text-neutral-300 font-normal px-5 py-2 rounded-xl transition-all text-base">
                    邊框操作
                  </button>
                  <button className="bg-neutral-800/70 text-neutral-700 font-normal px-5 py-2 rounded-xl text-base" disabled>
                    已停用
                  </button>
                </div>
              </div>

              {/* Danger Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-neutral-600 block font-mono">4. 警告/刪除按鈕 (Danger: dark:bg-rose-700 dark:hover:bg-rose-600)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="bg-rose-800 hover:bg-rose-700 text-neutral-200 font-narmal px-5 py-2 rounded-xl transition-all text-base">
                    危險操作
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Form Elements */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-8 shadow-sm transition-colors">
          <h2 className="text-xl font-bold border-b pb-4 mb-6 border-slate-100 dark:border-neutral-850 text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></span>
            3. 輸入框與表單元件 (Form Inputs)
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Light Mode Preview */}
            <div className="bg-slate-100 p-6 rounded-2xl border border-slate-300 space-y-4 text-slate-800">
              <span className="text-s font-bold text-slate-400 uppercase tracking-wider block mb-2">亮色模式輸入框 (Light Mode)</span>

              <div>
                <label className="block text-sm font-normal text-slate-600 uppercase tracking-wider mb-1">文字輸入框</label>
                <input
                  type="text"
                  placeholder="請輸入文字..."
                  className="w-full border border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent rounded-xl px-4 py-2 text-sm font-normal bg-white text-slate-800 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">聚焦/有外框狀態 (Focus Style)</label>
                <input
                  type="text"
                  defaultValue="正在輸入的內容..."
                  className="w-full border-transparent ring-1 ring-blue-500 focus:outline-none rounded-xl px-4 py-2 text-sm font-normal bg-white text-slate-800 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">已停用輸入框</label>
                <input
                  type="text"
                  disabled
                  value="此輸入框已停用"
                  className="w-full border border-slate-100 rounded-xl px-4 py-2 text-sm font-normal bg-slate-50 text-slate-400 transition-colors"
                />
              </div>
            </div>

            {/* Dark Mode Preview */}
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 space-y-4 text-neutral-100">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-2">暗色模式輸入框 (Dark Mode)</span>

              <div>
                <label className="block text-sm font-normal text-neutral-300 uppercase tracking-wider mb-1.5">文字輸入框</label>
                <input
                  type="text"
                  placeholder="請輸入文字..."
                  className="w-full border border-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-transparent rounded-xl px-4 py-2 text-sm font-normal bg-neutral-900 text-neutral-200 placeholder:text-neutral-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-450 uppercase tracking-wider mb-1.5">聚焦/有外框狀態 (Focus Style)</label>
                <input
                  type="text"
                  defaultValue="正在輸入的內容..."
                  className="w-full border-transparent ring-1 ring-blue-300 focus:outline-none rounded-xl px-4 py-2 text-sm font-normal bg-neutral-900 text-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-450 uppercase tracking-wider mb-1.5">已停用輸入框</label>
                <input
                  type="text"
                  disabled
                  value="此輸入框已停用"
                  className="w-full border border-neutral-800 rounded-xl px-4 py-2 text-sm font-normal bg-neutral-800/50 text-neutral-500 transition-colors"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Section: Status & Feedback Alerts */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-8 shadow-sm transition-colors">
          <h2 className="text-xl font-bold border-b pb-4 mb-6 border-slate-100 dark:border-neutral-850 text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></span>
            4. 狀態反饋與提示框 (Alerts)
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Light Mode Preview */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 text-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">亮色模式提示 (Light Mode)</span>

              {/* Success */}
              <div className="flex items-start gap-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl p-4 text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-semibold text-emerald-900">成功提示！</p>
                  <p className="text-sm text-emerald-700 font-normal">問卷發佈成功，交易雜湊已廣播至網路。</p>
                </div>
              </div>

              {/* Warning/Error */}
              <div className="flex items-start gap-3 bg-rose-50 text-rose-800 border border-rose-100 rounded-xl p-4 text-sm font-semibold">
                <AlertCircle className="w-5 h-5 text-rose-550 shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-semibold text-rose-900">錯誤提示！</p>
                  <p className="text-sm text-rose-800 font-normal">請先連接錢包，或輸入正確的認證資訊。</p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-3 bg-blue-50 text-blue-800 border border-blue-100 rounded-xl p-4 text-sm font-semibold">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-semibold text-blue-900">一般資訊</p>
                  <p className="text-sm text-blue-800 font-normal">此問卷填寫預估耗時約 3 分鐘。</p>
                </div>
              </div>
            </div>

            {/* Dark Mode Preview */}
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 space-y-4 text-neutral-100">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-2">暗色模式提示 (Dark Mode)</span>

              {/* Success */}
              <div className="flex items-start gap-3 bg-emerald-950/20 text-emerald-300 border border-emerald-900/30 rounded-xl p-4 text-sm font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
                <div>
                  <p className="text-base font-semibold text-emerald-400">成功提示！</p>
                  <p className="text-sm text-emerald-400 font-normal">問卷發佈成功，交易雜湊已廣播至網路。</p>
                </div>
              </div>

              {/* Warning/Error */}
              <div className="flex items-start gap-3 bg-rose-900/20 text-rose-300 border border-rose-900/30 rounded-xl p-4 text-sm font-semibold">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <p className="text-base font-semibold text-rose-400">錯誤提示！</p>
                  <p className="text-sm text-rose-400 font-normal">請先連接錢包，或輸入正確的認證資訊。</p>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-3 bg-blue-900/20 text-blue-300 border border-blue-900/30 rounded-xl p-4 text-sm font-semibold">
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-base font-semibold text-blue-400">一般資訊</p>
                  <p className="text-sm text-blue-400 font-normal">此問卷填寫預估耗時約 3 分鐘。</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
