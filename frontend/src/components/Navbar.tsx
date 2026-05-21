import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'

export default function Navbar() {
  const account = useCurrentAccount()
  const location = useLocation()

  // 1. Language Toggle (Mock ZH/EN state, persisting to localStorage)
  const [lang, setLang] = useState(() => localStorage.getItem('surveysui:lang') || 'ZH')
  const toggleLang = () => {
    const nextLang = lang === 'ZH' ? 'EN' : 'ZH'
    setLang(nextLang)
    localStorage.setItem('surveysui:lang', nextLang)
  }

  // 2. Dark/Light Theme Toggle (toggling 'dark' class on documentElement)
  const [isDark, setIsDark] = useState(() => {
    return (
      document.documentElement.classList.contains('dark') ||
      localStorage.getItem('surveysui:theme') === 'dark'
    )
  })

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  const toggleTheme = () => {
    const nextDark = !isDark
    setIsDark(nextDark)
    localStorage.setItem('surveysui:theme', nextDark ? 'dark' : 'light')
  }

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname.startsWith('/dashboard')
    }
    return location.pathname === path
  }

  const linkClass = (path: string) =>
    `text-sm font-semibold transition-colors py-2 px-3 rounded-lg ${
      isActive(path)
        ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-bold'
        : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
    }`

  return (
    <header className="border-b border-neutral-100 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md sticky top-0 z-50 transition-colors">
      <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
        {/* Left Side: Brand and Navigation */}
        <div className="flex items-center gap-6">
          <Link to="/" className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white hover:opacity-90">
            SurveySui
          </Link>
          <nav className="hidden sm:flex items-center gap-2">
            {account && (
              <>
                <Link to="/auth" className={linkClass('/auth')}>
                  {lang === 'ZH' ? '真人認證 SurveyPass' : 'SurveyPass'}
                </Link>
                <Link to="/dashboard" className={linkClass('/dashboard')}>
                  {lang === 'ZH' ? '我的儀表板' : 'Dashboard'}
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Right Side: Language, Theme, Connect Wallet */}
        <div className="flex items-center gap-3">
          {/* Language Button */}
          <button
            type="button"
            onClick={toggleLang}
            className="p-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            title={lang === 'ZH' ? '切換為英文' : 'Switch to Chinese'}
          >
            🌐 {lang}
          </button>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            title={isDark ? '切換為亮色模式' : 'Switch to Dark Mode'}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* Wallet Connect Button */}
          <ConnectButton />
        </div>
      </div>
      
      {/* Mobile navigation row if connected */}
      {account && (
        <div className="sm:hidden flex border-t border-neutral-100 dark:border-neutral-800 justify-around py-2 px-4 bg-white/90 dark:bg-neutral-900/90">
          <Link to="/auth" className={linkClass('/auth')}>
            {lang === 'ZH' ? '真人認證' : 'SurveyPass'}
          </Link>
          <Link to="/dashboard" className={linkClass('/dashboard')}>
            {lang === 'ZH' ? '我的儀表板' : 'Dashboard'}
          </Link>
        </div>
      )}
    </header>
  )
}
