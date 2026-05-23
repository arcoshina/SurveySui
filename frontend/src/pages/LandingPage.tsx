import { Link } from 'react-router-dom'
import { FileText, ClipboardList, Gift, Sparkles, Lock, Zap } from 'lucide-react'

const steps = [
  {
    icon: FileText,
    number: '1',
    title: '發起者建立問卷',
    desc: '用 Markdown 寫題目、設定每份獎勵金額，一筆交易完成發布。',
  },
  {
    icon: ClipboardList,
    number: '2',
    title: '受訪者免費填答',
    desc: '完全不需要持有任何加密貨幣，手續費由發起者負擔。',
  },
  {
    icon: Gift,
    number: '3',
    title: '獎勵自動發放',
    desc: '填答完成即自動結算，SUI 獎勵直接打進你的錢包。',
  },
]

const features = [
  {
    icon: Sparkles,
    title: '填答零成本',
    desc: '填問卷不需要任何加密貨幣。發起者預先存入獎勵池，手續費由平台代付。',
  },
  {
    icon: Lock,
    title: '資料永久保存',
    desc: '問卷資料儲存在 Sui 區塊鏈，任何人都可查驗，無法被刪除或竄改。',
  },
  {
    icon: Zap,
    title: '獎勵直入錢包',
    desc: '系統根據合約自動分配，不需信任任何中間人或人工審核。',
  },
]

const faqs = [
  {
    q: '我需要加密貨幣錢包嗎？',
    a: '填答問卷需要 Sui 錢包（可免費下載），但完全不需要持有任何加密貨幣。手續費由問卷發起者預先存入，受訪者零成本參與。',
  },
  {
    q: '我的答案會被誰看到？',
    a: '答案在上傳前加密，只有問卷發起者能解讀內容，其他人只能看到統計摘要。資料儲存在公開鏈上，可驗證真實性。',
  },
  {
    q: '問卷獎勵從哪裡來？',
    a: '由發起者在發布問卷前預存於智慧合約，作為受訪者的回報。合約自動執行分配，無需人工介入。',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
          讓問卷調查，真正公平透明
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-10">
          填答免費、獎勵自動發放、資料不可竄改——SurveySui 是建立在公開區塊鏈上的問卷平台。
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/create"
            className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            建立問卷
          </Link>
          <Link
            to="/auth"
            className="rounded-lg bg-indigo-50 border border-indigo-200 px-6 py-3 text-indigo-700 font-medium hover:bg-indigo-100 transition-colors"
          >
            真人驗證 SurveyPass
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold text-center mb-12">三步驟，完成一份問卷</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {steps.map((step) => {
              const Icon = step.icon
              return (
                <div key={step.number} className="text-center flex flex-col items-center">
                  <div className="text-blue-600 mb-3 flex items-center justify-center h-12 w-12 bg-blue-50 rounded-full">
                    <Icon size={24} />
                  </div>
                  <div className="inline-block bg-blue-100 text-blue-700 text-sm font-semibold rounded-full px-3 py-0.5 mb-3">
                    步驟 {step.number}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-bold text-center mb-12">為什麼選擇 SurveySui？</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="bg-white border border-gray-200 rounded-xl p-6 text-center flex flex-col items-center"
                >
                  <div className="text-blue-600 mb-4 flex items-center justify-center h-12 w-12 bg-blue-50 rounded-full">
                    <Icon size={24} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-2xl font-bold text-center mb-12">常見問題</h2>
          <div className="space-y-8">
            {faqs.map((faq) => (
              <div key={faq.q}>
                <p className="font-semibold text-gray-900 mb-2">{faq.q}</p>
                <p className="text-gray-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-gray-400">
        © 2025 SurveySui · Built on Sui
      </footer>
    </div>
  )
}
