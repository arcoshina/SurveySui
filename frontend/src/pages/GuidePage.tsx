import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useT } from '../i18n'

// lucide-react 已移除品牌圖示，這裡內嵌單色 Chrome 標誌（繼承 currentColor）
function ChromeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.001.001h-.002l-5.344 9.257c.206.01.413.016.622.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z" />
    </svg>
  )
}

export default function GuidePage() {
  const t = useT('guide')

  return (
    <div className="min-h-screen bg-white text-slate-800 dark:bg-neutral-950 dark:text-neutral-300 animate-fadeIn transition-colors">
      {/* Header */}
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-10">
        <h1 className="text-3xl sm:text-4xl font-normal leading-tight mb-6 text-slate-900 dark:text-white text-left">
          {t.title}
        </h1>
        <p className="text-base sm:text-lg text-slate-500 dark:text-neutral-400 leading-relaxed font-normal text-left">
          {t.intro}
        </p>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-3xl px-6 pb-12 space-y-6">
        {t.steps.map((step, index) => (
          <div
            key={index}
            className="bg-white dark:bg-neutral-900/50 border border-slate-100 dark:border-neutral-800/80 rounded-2xl p-6 flex flex-col sm:flex-row gap-5 transition-colors"
          >
            <div className="flex-none">
              <div className="text-blue-700 dark:text-blue-400 flex items-center justify-center h-12 w-12 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/30 rounded-full text-lg font-medium">
                {index + 1}
              </div>
            </div>
            <div className="flex-1">
              <div className="inline-block bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-normal rounded-full px-3 py-1 mb-3">
                {t.stepLabel} {index + 1}
              </div>
              <h3 className="text-lg font-normal text-slate-900 dark:text-white mb-2">{step.title}</h3>
              <p className="text-slate-600 dark:text-neutral-400 text-sm leading-relaxed font-normal">
                {step.desc}
              </p>
              {step.links.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-4">
                  {step.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary inline-flex items-center gap-2 text-sm"
                    >
                      {link.icon === 'chrome' && <ChromeIcon size={16} />}
                      {link.label}
                      <ExternalLink size={14} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Next steps CTA */}
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/auth" className="btn-primary text-center">
            {t.ctaAuth}
          </Link>
          <Link to="/" className="btn-outline text-center">
            {t.ctaHome}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-slate-400 dark:text-neutral-500 font-medium transition-colors">
        © 2026 SurveySui
      </footer>
    </div>
  )
}
