import { Link } from 'react-router-dom'
import { FileText, ClipboardList, Gift, Sparkles, Lock, Zap } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'

const stepsIcons = [FileText, ClipboardList, Gift]
const featuresIcons = [Sparkles, Lock, Zap]

const content = {
  ZH: {
    heroTitle: '讓問卷調查，真正公平透明',
    heroDesc: '填答免費、獎勵自動發放、資料不可竄改——SurveySui 是建立在公開區塊鏈上的問卷平台。',
    btnCreate: '建立問卷',
    btnAuth: '真人驗證 SurveyPass',
    stepsTitle: '三步驟，完成一份問卷',
    stepLabel: '步驟',
    steps: [
      { title: '發起者建立問卷', desc: '用 Markdown 寫題目、設定每份獎勵金額，一筆交易完成發布。' },
      { title: '受訪者免費填答', desc: '完全不需要持有任何加密貨幣，手續費由發起者負擔。' },
      { title: '獎勵自動發放', desc: '填答完成即自動結算，SSR 獎勵直接打進你的錢包。' }
    ],
    featuresTitle: '為什麼選擇 SurveySui？',
    features: [
      { title: '填答零成本', desc: '填問卷不需要任何加密貨幣。發起者預先存入獎勵池，手續費由平台代付。' },
      { title: '資料永久保存', desc: '問卷資料儲存在 Sui 區塊鏈，任何人都可查驗，無法被刪除或竄改。' },
      { title: '獎勵直入錢包', desc: '系統根據合約自動分配，不需信任任何中間人或人工審核。' }
    ],
    faqTitle: '常見問題',
    faqs: [
      { q: '我需要加密貨幣錢包嗎？', a: '填答問卷需要 Sui 錢包（可免費下載），但完全不需要持有任何加密貨幣。手續費由問卷發起者預先存入，受訪者零成本參與。' },
      { q: '我的答案會被誰看到？', a: '答案在上傳前加密，只有問卷發起者能解讀內容，其他人只能看到統計摘要。資料儲存在公開鏈上，可驗證真實性。' },
      { q: '問卷獎勵從哪裡來？', a: '由發起者在發布問卷前預存於智慧合約，作為受訪者的回報。合約自動執行分配，無需人工介入。' }
    ]
  },
  EN: {
    heroTitle: 'Make Surveys Truly Fair and Transparent',
    heroDesc: 'Free to fill, automatic rewards, tamper-proof data — SurveySui is a survey platform built on the public blockchain.',
    btnCreate: 'Create Survey',
    btnAuth: 'Verify SurveyPass',
    stepsTitle: 'Three Steps to Complete a Survey',
    stepLabel: 'Step',
    steps: [
      { title: 'Creator Sets Up Survey', desc: 'Write questions in Markdown and set the reward amount per response. Publish in a single transaction.' },
      { title: 'Respondents Answer Free', desc: 'No cryptocurrencies required. Gas fees are sponsored by the survey creator.' },
      { title: 'Rewards Sent Automatically', desc: 'Instantly settled upon completion. SSR rewards are sent directly to your wallet.' }
    ],
    featuresTitle: 'Why Choose SurveySui?',
    features: [
      { title: 'Zero Cost to Fill', desc: 'Answering surveys costs you nothing. The creator pre-funds the reward pool and gas fees.' },
      { title: 'Permanent Data Storage', desc: 'Survey data is stored on the Sui blockchain, enabling public auditability and preventing deletions.' },
      { title: 'Direct Rewards', desc: 'Smart contracts handle distribution automatically, without needing to trust intermediaries or manual reviews.' }
    ],
    faqTitle: 'FAQ',
    faqs: [
      { q: 'Do I need a cryptocurrency wallet?', a: 'You will need a Sui wallet (free to set up), but you do not need to hold any cryptocurrency. Gas fees are pre-funded by creators so you can fill for free.' },
      { q: 'Who can see my answers?', a: 'Answers are encrypted before uploading. Only the survey creator can decrypt and read them, while others see aggregated statistics.' },
      { q: 'Where do the rewards come from?', a: 'They are pre-deposited by creators into smart contracts before publishing. The contract executes distribution automatically.' }
    ]
  }
}

export default function LandingPage() {
  const { lang } = useLanguage()
  const t = content[lang]

  return (
    <div className="min-h-screen bg-white text-slate-800 dark:bg-neutral-950 dark:text-neutral-300 animate-fadeIn transition-colors">
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
            to="/create"
            className="btn-primary"
          >
            {t.btnCreate}
          </Link>
          <Link
            to="/auth"
            className="btn-outline"
          >
            {t.btnAuth}
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-slate-50/50 dark:bg-neutral-900/30 border-y border-slate-100 dark:border-neutral-900 py-16 transition-colors">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-normal text-slate-900 dark:text-white text-center mb-12">{t.stepsTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {t.steps.map((step, index) => {
              const Icon = stepsIcons[index]
              return (
                <div key={index} className="text-center flex flex-col items-center">
                  <div className="text-blue-700 dark:text-blue-400 mb-3 flex items-center justify-center h-12 w-12 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/30 rounded-full">
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

      {/* Features */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-2xl font-normal text-slate-900 dark:text-white text-center mb-12">{t.featuresTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {t.features.map((f, index) => {
              const Icon = featuresIcons[index]
              return (
                <div
                  key={index}
                  className="bg-white dark:bg-neutral-900/50 border border-slate-100 dark:border-neutral-800/80 rounded-2xl p-6 transition-all duration-300 text-center flex flex-col items-center"
                >
                  <div className="text-blue-700 dark:text-blue-400 mb-4 flex items-center justify-center h-12 w-12 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/30 rounded-full">
                    <Icon size={24} />
                  </div>
                  <h3 className="text-lg font-normal text-slate-900 dark:text-white mb-2">{f.title}</h3>
                  <p className="text-slate-600 dark:text-neutral-400 text-sm leading-relaxed font-normal">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50/50 dark:bg-neutral-900/30 border-t border-slate-100 dark:border-neutral-900 py-16 transition-colors">
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

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-slate-400 dark:text-neutral-500 font-medium transition-colors">
        © 2025 SurveySui · Built on Sui
      </footer>
    </div>
  )
}
