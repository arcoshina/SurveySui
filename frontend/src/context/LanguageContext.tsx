import React, { createContext, useContext, useState } from 'react'

export type Language = 'ZH' | 'EN'

interface LanguageContextProps {
  lang: Language
  toggleLang: () => void
  setLang: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined)

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    return (localStorage.getItem('surveysui:lang') as Language) || 'ZH'
  })

  const toggleLang = () => {
    const nextLang = lang === 'ZH' ? 'EN' : 'ZH'
    setLangState(nextLang)
    localStorage.setItem('surveysui:lang', nextLang)
  }

  const setLang = (newLang: Language) => {
    setLangState(newLang)
    localStorage.setItem('surveysui:lang', newLang)
  }

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
