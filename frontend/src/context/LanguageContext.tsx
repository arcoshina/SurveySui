import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

export type Language = 'ZH' | 'EN' | 'JA' | 'KO' | 'ES'

const STORAGE_KEY = 'surveysui:lang'

interface LanguageContextProps {
  lang: Language
  nextLang: Language
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
  if (v.startsWith('ja')) return 'JA'
  if (v.startsWith('ko')) return 'KO'
  if (v.startsWith('es')) return 'ES'
  return null
}

/** 偵測系統語言，若支援則回傳，否則回傳 'EN' */
function getSupportedSystemLang(): Language {
  if (typeof navigator === 'undefined') return 'ZH'
  const list = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const l of list) {
    if (!l) continue
    const code = l.toLowerCase()
    if (code.startsWith('zh')) return 'ZH'
    if (code.startsWith('ja')) return 'JA'
    if (code.startsWith('ko')) return 'KO'
    if (code.startsWith('es')) return 'ES'
    if (code.startsWith('en')) return 'EN'
  }
  return 'EN'
}

const toUrlCode = (lang: Language) => {
  switch (lang) {
    case 'ZH': return 'zh'
    case 'JA': return 'ja'
    case 'KO': return 'ko'
    case 'ES': return 'es'
    default: return 'en'
  }
}

const toHtmlLang = (lang: Language) => {
  switch (lang) {
    case 'ZH': return 'zh-TW'
    case 'JA': return 'ja'
    case 'KO': return 'ko'
    case 'ES': return 'es'
    default: return 'en'
  }
}

/** 初始語言優先序：網址 ?lang → localStorage → 系統語言 → 後備 ZH */
function detectInitialLang(): Language {
  if (typeof window !== 'undefined') {
    const urlLang = normalizeLang(new URLSearchParams(window.location.search).get('lang'))
    if (urlLang) return urlLang
    const saved = normalizeLang(localStorage.getItem(STORAGE_KEY))
    if (saved) return saved
  }
  return getSupportedSystemLang()
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [lang, setLangState] = useState<Language>(detectInitialLang)
  
  // 記錄偵測到的本地語言，如果偵測到是英文或不支援的語言，則為 'EN'
  const [localLang] = useState<Language>(() => {
    return getSupportedSystemLang()
  })

  // 計算下一個語言與目標本地語言
  const targetLocal = localLang === 'EN' ? 'ZH' : localLang
  const nextLang = lang === targetLocal ? 'EN' : targetLocal

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

  const toggleLang = () => applyLang(nextLang)

  const setLang = (newLang: Language) => applyLang(newLang)

  return (
    <LanguageContext.Provider value={{ lang, nextLang, toggleLang, setLang }}>
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
