import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { Sun, Moon, Languages, Menu, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'

export default function Navbar() {
  const account = useCurrentAccount()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 1. Language Toggle (using global LanguageContext)
  const { lang, toggleLang } = useLanguage()

  // 2. Dark/Light Theme Toggle (using global ThemeContext)
  const { isDark, toggleTheme } = useTheme()

  // 點選選單外部時關閉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  // 路由切換時關閉選單
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname.startsWith('/dashboard')
    }
    return location.pathname === path
  }

  const linkClass = (path: string) =>
    `text-sm font-normal transition-colors py-2 px-3 rounded-lg ${
      isActive(path)
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'text-neutral-650 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
    }`

  const menuItemClass = (path: string) =>
    `block w-full text-left text-sm font-normal transition-colors py-2 px-3 rounded-lg ${
      isActive(path)
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'text-neutral-650 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
    }`

  return (
    <header className="border-b border-neutral-100 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md sticky top-0 z-50 transition-colors">
      <div className="mx-auto max-w-5xl px-6 h-12 flex items-center justify-between">
        {/* Left Side: Brand */}
        <Link
          to="/"
          className="flex items-center gap-2 h-full text-xl font-normal tracking-tight text-neutral-900 dark:text-white hover:opacity-90"
        >
          <img src="/logo.svg" alt="SurveySui logo" className="h-full w-auto" />
          <span>SurveySui</span>
        </Link>

        {/* Right Side: Navigation + Controls */}
        <div className="flex items-center gap-2">
          {/* Desktop nav links */}
          <nav className="hidden sm:flex items-center gap-1">
            {account && (
              <>
                <Link to="/auth" className={linkClass('/auth')}>
                  {lang === 'ZH' ? '真人認證' : 'SurveyPass'}
                </Link>
                <Link to="/dashboard" className={linkClass('/dashboard')}>
                  {lang === 'ZH' ? '儀表板' : 'Dashboard'}
                </Link>
              </>
            )}
          </nav>

          {/* Wallet Connect Button (always visible) */}
          <div className="[&_button]:shadow-none!">
            <ConnectButton />
          </div>

          {/* Desktop: Language + Theme */}
          <button
            type="button"
            onClick={toggleLang}
            className="hidden sm:flex p-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
            aria-label={lang === 'ZH' ? '切換為英文' : 'Switch to Chinese'}
            title={lang === 'ZH' ? '切換為英文' : 'Switch to Chinese'}
          >
            <Languages size={18} />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="hidden sm:flex p-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
            aria-label={isDark ? '切換為亮色模式' : 'Switch to Dark Mode'}
            title={isDark ? '切換為亮色模式' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Mobile: Hamburger */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-2 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
              aria-label="開啟選單"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg py-1 flex flex-col gap-0.5 px-1">
                {account && (
                  <>
                    <Link to="/auth" className={menuItemClass('/auth')}>
                      {lang === 'ZH' ? '真人認證' : 'SurveyPass'}
                    </Link>
                    <Link to="/dashboard" className={menuItemClass('/dashboard')}>
                      {lang === 'ZH' ? '儀表板' : 'Dashboard'}
                    </Link>
                    <hr className="border-neutral-100 dark:border-neutral-800 my-1" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    toggleLang()
                    setMenuOpen(false)
                  }}
                  className="flex items-center gap-2 w-full text-left text-sm font-semibold py-2 px-3 rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <Languages size={16} />
                  {lang === 'ZH' ? '切換為英文' : 'Switch to Chinese'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleTheme()
                    setMenuOpen(false)
                  }}
                  className="flex items-center gap-2 w-full text-left text-sm font-semibold py-2 px-3 rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  {isDark ? '切換為亮色' : '切換為深色'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
