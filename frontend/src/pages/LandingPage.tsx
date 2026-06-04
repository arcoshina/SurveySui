import { Link } from 'react-router-dom'
import { FileText, ClipboardList, Gift, Sparkles, Lock, Zap } from 'lucide-react'
import { useT } from '../i18n'

const stepsIcons = [FileText, ClipboardList, Gift]
const featuresIcons = [Sparkles, Lock, Zap]

export default function LandingPage() {
  const t = useT('landing')

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
          <a
            href="/guide"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            {t.btnGuide}
          </a>
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
        © 2026 SurveySui
      </footer>
    </div>
  )
}
