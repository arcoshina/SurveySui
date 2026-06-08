import React from 'react'
import { useTheme } from '../context/ThemeContext'
import { Info, AlertCircle, CheckCircle2, AlertTriangle, ArrowLeft, Sun, Moon } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function StyleGuidePage() {
  const { isDark, toggleTheme } = useTheme()

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
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-200 transition-all border border-slate-200 dark:border-neutral-700 shadow-sm flex items-center gap-2"
            >
              {isDark ? (
                <>
                  <Sun size={16} /> 切換至亮色模式
                </>
              ) : (
                <>
                  <Moon size={16} /> 切換至暗色模式
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 mt-10 space-y-12">
        {/* Section: Typography */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-8 shadow-sm transition-colors">
          <h2 className="text-xl font-normal border-b pb-4 mb-6 border-slate-100 dark:border-neutral-800 text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></span>
            1. 字型與文字層級 (Typography)
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Light Mode Preview */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 text-slate-800">
              <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider block mb-4">亮色模式樣式 (Light Mode)</span>
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">H1 (.text-h1)</span>
                  <h1 className="text-h1">問卷大標題 Title</h1>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">H2 (.text-h2)</span>
                  <h2 className="text-h2">區塊副標題 Subtitle</h2>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">H3 (.text-h3)</span>
                  <h3 className="text-h3">小標題 / 選單項目</h3>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">Body (.text-body)</span>
                  <p className="text-body leading-relaxed">
                    這是主內容字體。為了確保易讀性，亮色模式下建議使用 Slate-600 或 Slate-700，避免使用純黑。
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-mono">Muted (.text-muted)</span>
                  <p className="text-muted">這是輔助或說明字體，例如時間、提示等次要資訊。</p>
                </div>
              </div>
            </div>

            {/* Dark Mode Preview */}
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 text-neutral-100 dark">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-4">暗色模式樣式 (Dark Mode)</span>
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">H1 (.text-h1)</span>
                  <h1 className="text-h1">問卷大標題 Title</h1>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">H2 (.text-h2)</span>
                  <h2 className="text-h2">區塊副標題 Subtitle</h2>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">H3 (.text-h3)</span>
                  <h3 className="text-h3">小標題 / 選單項目</h3>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">Body (.text-body)</span>
                  <p className="text-body leading-relaxed">
                    這是主內容字體。為了防止刺眼，暗色模式下建議使用 Neutral-300 或 Neutral-400，而非純白色。
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-600 font-mono">Muted (.text-muted)</span>
                  <p className="text-muted">這是輔助或說明字體，例如時間、提示等次要資訊。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Buttons */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-8 shadow-sm transition-colors">
          <h2 className="text-xl font-normal border-b pb-4 mb-6 border-slate-100 dark:border-neutral-800 text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></span>
            2. 按鈕狀態與配色 (Buttons)
          </h2>

          <p className="text-sm text-slate-500 dark:text-neutral-400 mb-6">
            此處列出目前全站常使用的四種主要按鈕樣式。所有按鈕皆採用 <code>font-normal</code>，且不使用 <code>shadow-md</code>。
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Light Mode Preview */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6 text-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">亮色模式按鈕 (Light Mode)</span>

              {/* Primary Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 block font-mono">1. 主按鈕 (Primary: .btn-primary)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary">主要操作</button>
                  <button className="btn-primary" disabled>已停用</button>
                </div>
              </div>

              {/* Secondary Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 block font-mono">2. 次要按鈕 (Secondary: .btn-secondary)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary">次要操作</button>
                  <button className="btn-secondary" disabled>已停用</button>
                </div>
              </div>

              {/* Outline Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 block font-mono">3. 邊框按鈕 (Outline: .btn-outline)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-outline">邊框操作</button>
                  <button className="btn-outline" disabled>已停用</button>
                </div>
              </div>

              {/* Danger Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400 block font-mono">4. 危險操作按鈕 (Danger: .btn-danger)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-danger">危險操作</button>
                </div>
              </div>
            </div>

            {/* Dark Mode Preview */}
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 space-y-6 text-neutral-100 dark">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">暗色模式按鈕 (Dark Mode)</span>

              {/* Primary Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-neutral-600 block font-mono">1. 主按鈕 (Primary: .btn-primary)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary">主要操作</button>
                  <button className="btn-primary" disabled>已停用</button>
                </div>
              </div>

              {/* Secondary Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-neutral-600 block font-mono">2. 次要按鈕 (Secondary: .btn-secondary)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary">次要操作</button>
                  <button className="btn-secondary" disabled>已停用</button>
                </div>
              </div>

              {/* Outline Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-neutral-600 block font-mono">3. 邊框按鈕 (Outline: .btn-outline)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-outline">邊框操作</button>
                  <button className="btn-outline" disabled>已停用</button>
                </div>
              </div>

              {/* Danger Button */}
              <div className="space-y-2">
                <span className="text-[10px] text-neutral-600 block font-mono">4. 危險操作按鈕 (Danger: .btn-danger)</span>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-danger">危險操作</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Form Elements */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-8 shadow-sm transition-colors">
          <h2 className="text-xl font-normal border-b pb-4 mb-6 border-slate-100 dark:border-neutral-800 text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></span>
            3. 輸入框與表單元件 (Form Inputs)
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Light Mode Preview */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 text-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">亮色模式表單元件 (Light Mode)</span>

              <div>
                <label className="form-label">文字輸入框 (.form-input)</label>
                <input
                  type="text"
                  placeholder="請輸入文字..."
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">已停用輸入框</label>
                <input
                  type="text"
                  disabled
                  value="此輸入框已停用"
                  className="form-input"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-normal text-slate-700">
                  <input type="checkbox" className="checkbox-dark" defaultChecked />
                  <span>核取方塊 (.checkbox-dark)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-normal text-slate-700">
                  <input type="radio" className="radio-dark" name="radio-demo-light" defaultChecked />
                  <span>單選按鈕 (.radio-dark)</span>
                </label>
              </div>
            </div>

            {/* Dark Mode Preview */}
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 space-y-4 text-neutral-100 dark">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block mb-2">暗色模式表單元件 (Dark Mode)</span>

              <div>
                <label className="form-label">文字輸入框 (.form-input)</label>
                <input
                  type="text"
                  placeholder="請輸入文字..."
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">已停用輸入框</label>
                <input
                  type="text"
                  disabled
                  value="此輸入框已停用"
                  className="form-input"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-normal text-neutral-300">
                  <input type="checkbox" className="checkbox-dark" defaultChecked />
                  <span>核取方塊 (.checkbox-dark)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-normal text-neutral-300">
                  <input type="radio" className="radio-dark" name="radio-demo-dark" defaultChecked />
                  <span>單選按鈕 (.radio-dark)</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Status & Feedback Alerts */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-8 shadow-sm transition-colors">
          <h2 className="text-xl font-normal border-b pb-4 mb-6 border-slate-100 dark:border-neutral-800 text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></span>
            4. 狀態反饋與提示框 (Alerts)
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Light Mode Preview */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 text-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">亮色模式提示 (Light Mode)</span>

              {/* Success */}
              <div className="alert-success">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">成功提示 (.alert-success)</p>
                  <p className="text-xs font-normal mt-0.5">問卷發佈成功，交易雜湊已廣播至網路。</p>
                </div>
              </div>

              {/* Warning/Error */}
              <div className="alert-error">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">錯誤提示 (.alert-error)</p>
                  <p className="text-xs font-normal mt-0.5">請連接錢包，或輸入正確的驗證資訊。</p>
                </div>
              </div>

              {/* Info */}
              <div className="alert-info">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">一般資訊 (.alert-info)</p>
                  <p className="text-xs font-normal mt-0.5">此問卷填寫預估耗時約 3 分鐘。</p>
                </div>
              </div>

              {/* Warning */}
              <div className="alert-warning">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">警告提示 (.alert-warning)</p>
                  <p className="text-xs font-normal mt-0.5">交易可能需要幾秒鐘完成，請勿關閉視窗。</p>
                </div>
              </div>
            </div>

            {/* Dark Mode Preview */}
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 space-y-4 text-neutral-100 dark">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block mb-2">暗色模式提示 (Dark Mode)</span>

              {/* Success */}
              <div className="alert-success">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">成功提示 (.alert-success)</p>
                  <p className="text-xs font-normal mt-0.5">問卷發佈成功，交易雜湊已廣播至網路。</p>
                </div>
              </div>

              {/* Warning/Error */}
              <div className="alert-error">
                <AlertCircle className="w-5 h-5 text-rose-450 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">錯誤提示 (.alert-error)</p>
                  <p className="text-xs font-normal mt-0.5">請連接錢包，或輸入正確的驗證資訊。</p>
                </div>
              </div>

              {/* Info */}
              <div className="alert-info">
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">一般資訊 (.alert-info)</p>
                  <p className="text-xs font-normal mt-0.5">此問卷填寫預估耗時約 3 分鐘。</p>
                </div>
              </div>

              {/* Warning */}
              <div className="alert-warning">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">警告提示 (.alert-warning)</p>
                  <p className="text-xs font-normal mt-0.5">交易可能需要幾秒鐘完成，請勿關閉視窗。</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Chips & Badges */}
        <section className="bg-white dark:bg-neutral-900 rounded-3xl border border-slate-100 dark:border-neutral-800 p-8 shadow-sm transition-colors">
          <h2 className="text-xl font-normal border-b pb-4 mb-6 border-slate-100 dark:border-neutral-800 text-slate-900 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-600 dark:bg-blue-500 rounded-full"></span>
            5. 徽章與標記 (Chips & Badges)
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Light Mode Preview */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 text-slate-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">亮色模式徽章 (Light Mode)</span>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-400 w-24">必填/選填標籤:</span>
                  <span className="chip-required">必填</span>
                  <span className="chip-optional">選填</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-400 w-24">儲存方式徽章:</span>
                  <span className="badge-direct">鏈上儲存</span>
                  <span className="badge-decentralized">儲存於Walrus</span>
                </div>
              </div>
            </div>

            {/* Dark Mode Preview */}
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 space-y-4 text-neutral-100 dark">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block mb-2">暗色模式徽章 (Dark Mode)</span>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-neutral-600 w-24">必填/選填標籤:</span>
                  <span className="chip-required">必填</span>
                  <span className="chip-optional">選填</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-neutral-600 w-24">儲存方式徽章:</span>
                  <span className="badge-direct">鏈上儲存</span>
                  <span className="badge-decentralized">儲存於Walrus</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
