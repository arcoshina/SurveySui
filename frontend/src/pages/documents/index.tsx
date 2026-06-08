import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { renderMarkdown } from '../../lib/markdown'

const demoDocMarkdown = `
# SurveySui 說明文件

歡迎使用 **SurveySui**，這是一個建立在 Sui 公開區塊鏈上的去中心化問卷調查平台。

## 🚀 平台核心特點

* **免 Gas 填答 (Sponsored Gas)**：受訪者不需要持有任何 SUI 代幣即可提交問卷。所有的 Gas 費用均由問卷發起者資助，並由 BFF 代付。
* **獎勵自動派發**：填答完成後，智能合約會自動將 **SSR (StackedSurveysuiReward)** 憑證直接發送到您的錢包。
* **數據不可篡改**：所有問卷結構與結果均保存在 Sui 鏈上，資料公開透明且防篡改。
* **隱私防護**：問卷答案在客戶端加密後才上傳，僅有發起者能解密讀取。

## 💡 快速開始填答

1. **連接錢包**：點擊頁面右上角的連線按鈕。
2. **探索廣場**：在首頁的問卷廣場中，尋找適合您語言的公開問卷。
3. **填寫並提交**：完成問題回答後送出，簽署交易後即可自動領取獎勵！
`

export default function DocumentsPage() {
  const [selectedDoc, setSelectedDoc] = useState('welcome')

  return (
    <div className="min-h-screen bg-white text-slate-800 dark:bg-neutral-950 dark:text-neutral-300 transition-colors duration-200">
      {/* 導覽列 */}
      <header className="border-b border-slate-100 dark:border-neutral-900 py-4 px-6 flex items-center justify-between">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={18} />
          <span>返回首頁</span>
        </Link>
        <div className="text-sm font-semibold tracking-wider text-blue-600 dark:text-blue-400">
          SURVEYSUI DOCUMENTS
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12 flex flex-col md:flex-row gap-8">
        {/* 左側選單 */}
        <aside className="w-full md:w-64 shrink-0 space-y-2">
          <div className="text-xs font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider px-3 mb-3">
            文檔導覽
          </div>
          <button
            onClick={() => setSelectedDoc('welcome')}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-normal flex items-center gap-2 transition-all cursor-pointer ${
              selectedDoc === 'welcome'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-medium'
                : 'hover:bg-slate-50 dark:hover:bg-neutral-900 text-slate-600 dark:text-neutral-400'
            }`}
          >
            <BookOpen size={16} />
            <span>開始使用</span>
          </button>
        </aside>

        {/* 右側文件內容 */}
        <main className="flex-1 bg-slate-50/50 dark:bg-neutral-900/20 border border-slate-100 dark:border-neutral-900/60 rounded-3xl p-6 sm:p-10 transition-colors">
          <div 
            className="prose prose-slate dark:prose-invert max-w-none 
              [&>h1]:text-3xl [&>h1]:font-normal [&>h1]:text-slate-900 dark:[&>h1]:text-white [&>h1]:mb-6
              [&>h2]:text-xl [&>h2]:font-normal [&>h2]:text-slate-900 dark:[&>h2]:text-neutral-200 [&>h2]:mt-8 [&>h2]:mb-4
              [&>p]:text-base [&>p]:leading-relaxed [&>p]:mb-4 [&>p]:text-slate-600 dark:[&>p]:text-neutral-400
              [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-2 [&>ul]:mb-6 [&>ul]:text-slate-600 dark:[&>ul]:text-neutral-400
              [&>ul_strong]:text-slate-800 dark:[&>ul_strong]:text-neutral-200
              [&_code]:bg-slate-100 dark:[&_code]:bg-neutral-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(demoDocMarkdown) }}
          />
        </main>
      </div>
    </div>
  )
}
