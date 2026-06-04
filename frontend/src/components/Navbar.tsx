import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { Sun, Moon, Languages, Menu, X } from 'lucide-react'
import { useLanguage } from '../context/LanguageContext'
import { useTheme } from '../context/ThemeContext'
import { useT } from '../i18n'

export default function Navbar() {
  const account = useCurrentAccount()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { toggleLang } = useLanguage()
  const { isDark, toggleTheme } = useTheme()
  const t = useT('navbar')

  // 有效身份：連接的 Sui 錢包
  const activeAddress = account?.address ?? null

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
    `inline-flex items-center h-9 text-sm font-normal transition-colors px-3 rounded-lg ${
      isActive(path)
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
    }`

  const menuItemClass = (path: string) =>
    `block w-full text-left text-sm font-normal transition-colors py-2 px-3 rounded-lg ${
      isActive(path)
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
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
            {activeAddress && (
              <>
                <Link to="/auth" className={linkClass('/auth')}>
                  {t.surveyPass}
                </Link>
                <Link to="/dashboard" className={linkClass('/dashboard')}>
                  {t.dashboard}
                </Link>
              </>
            )}
          </nav>

          {/* Wallet Connect Button（連接 / 帳號膠囊） */}
          <div className="[&_button]:shadow-none! [&_button]:h-9 [&_button]:py-0 [&_button]:px-3 [&_button]:text-sm [&_button]:leading-none">
            <ConnectButton />
          </div>

          {/* Desktop: Language + Theme */}
          <button
            type="button"
            onClick={toggleLang}
            className="hidden sm:flex items-center justify-center h-9 w-9 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
            aria-label={t.switchLang}
            title={t.switchLang}
          >
            <Languages size={18} />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="hidden sm:flex items-center justify-center h-9 w-9 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
            aria-label={isDark ? t.themeToLight : t.themeToDark}
            title={isDark ? t.themeToLight : t.themeToDark}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Mobile: Hamburger */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center justify-center h-9 w-9 text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
              aria-label={t.openMenu}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg py-1 flex flex-col gap-0.5 px-1">
                {activeAddress && (
                  <>
                    <Link to="/auth" className={menuItemClass('/auth')}>
                      {t.surveyPass}
                    </Link>
                    <Link to="/dashboard" className={menuItemClass('/dashboard')}>
                      {t.dashboard}
                    </Link>
                    <hr className="border-neutral-100 dark:border-neutral-800 my-1" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { toggleLang(); setMenuOpen(false) }}
                  className="flex items-center gap-2 w-full text-left text-sm font-normal py-2 px-3 rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <Languages size={16} />
                  {t.switchLang}
                </button>
                <button
                  type="button"
                  onClick={() => { toggleTheme(); setMenuOpen(false) }}
                  className="flex items-center gap-2 w-full text-left text-sm font-normal py-2 px-3 rounded-lg text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  {isDark ? t.themeToLight : t.themeToDark}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
