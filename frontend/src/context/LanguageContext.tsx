import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

export type Language = 'ZH' | 'EN'

const STORAGE_KEY = 'surveysui:lang'

interface LanguageContextProps {
  lang: Language
  toggleLang: () => void
  setLang: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined)

/** 將任意輸入正規化為 Language；無法辨識回 null */
function normalizeLang(raw: string | null | undefined): Language | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (v.startsWith('zh')) return 'ZH'
  if (v.startsWith('en')) return 'EN'
  return null
}

/** 依瀏覽器系統語言推斷：任一以 zh 開頭 → ZH，否則 EN */
function detectSystemLang(): Language {
  if (typeof navigator === 'undefined') return 'ZH'
  const list = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const l of list) {
    if (l && l.toLowerCase().startsWith('zh')) return 'ZH'
  }
  return 'EN'
}

const toUrlCode = (lang: Language) => (lang === 'ZH' ? 'zh' : 'en')
const toHtmlLang = (lang: Language) => (lang === 'ZH' ? 'zh-TW' : 'en')

/** 初始語言優先序：網址 ?lang → localStorage → 系統語言 → 後備 ZH */
function detectInitialLang(): Language {
  if (typeof window !== 'undefined') {
    const urlLang = normalizeLang(new URLSearchParams(window.location.search).get('lang'))
    if (urlLang) return urlLang
    const saved = normalizeLang(localStorage.getItem(STORAGE_KEY))
    if (saved) return saved
  }
  return detectSystemLang()
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [lang, setLangState] = useState<Language>(detectInitialLang)

  // 切換語言：更新 state，並把網址 ?lang 同步寫好（集中於單一函式，
  // 避免多個 effect 各自寫網址而互相打架；localStorage / html 由下方 [lang] effect 處理）。
  const applyLang = useCallback(
    (next: Language) => {
      setLangState(next)
      if (searchParams.get('lang') !== toUrlCode(next)) {
        const params = new URLSearchParams(searchParams)
        params.set('lang', toUrlCode(next))
        // 用 navigate 並明確帶上 location.hash：加密問卷的 #金鑰在 hash，
        // 而 setSearchParams 改寫網址時會把 hash 整段丟掉，導致填答頁無法解密。
        navigate(
          { pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash },
          { replace: true },
        )
      }
    },
    [searchParams, navigate, location.pathname, location.hash],
  )

  // lang 變動（含首次掛載）→ 同步 localStorage 與 html lang
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = toHtmlLang(lang)
  }, [lang])

  // 對齊網址與語言：
  // - 訪客手動把 ?lang 改成有效值 → 跟著切換
  // - ?lang 缺失（含內部 <Link> 導覽未帶 query）→ 補回當前語言，使網址持續顯示縮寫
  // 切換語言時 applyLang 已同步寫好網址，故此處讀到的兩者一致、不會回捲。
  useEffect(() => {
    const urlLang = normalizeLang(searchParams.get('lang'))
    if (urlLang && urlLang !== lang) {
      applyLang(urlLang)
    } else if (!urlLang) {
      applyLang(lang)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const toggleLang = () => applyLang(lang === 'ZH' ? 'EN' : 'ZH')

  const setLang = (newLang: Language) => applyLang(newLang)

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
