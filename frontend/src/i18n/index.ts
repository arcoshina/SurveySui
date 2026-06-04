import { useLanguage } from '../context/LanguageContext'

import zhNavbar from './zh/navbar'
import enNavbar from './en/navbar'
import zhLanding from './zh/landing'
import enLanding from './en/landing'
import zhGuide from './zh/guide'
import enGuide from './en/guide'
import zhResults from './zh/results'
import enResults from './en/results'
import zhAuth from './zh/auth'
import enAuth from './en/auth'
import zhFund from './zh/fund'
import enFund from './en/fund'
import zhSurvey from './zh/survey'
import enSurvey from './en/survey'
import zhCreate from './zh/create'
import enCreate from './en/create'
import zhDashboard from './zh/dashboard'
import enDashboard from './en/dashboard'

/**
 * 集中語言字典註冊表。
 * 每個 namespace 對應一頁（或共用元件）的文案，ZH 為型別正本、EN 須吻合其形狀。
 * 新增語言＝新增整組檔案並在此補一個語言鍵。
 */
export const dictionaries = {
  navbar: { ZH: zhNavbar, EN: enNavbar },
  landing: { ZH: zhLanding, EN: enLanding },
  guide: { ZH: zhGuide, EN: enGuide },
  results: { ZH: zhResults, EN: enResults },
  auth: { ZH: zhAuth, EN: enAuth },
  fund: { ZH: zhFund, EN: enFund },
  survey: { ZH: zhSurvey, EN: enSurvey },
  create: { ZH: zhCreate, EN: enCreate },
  dashboard: { ZH: zhDashboard, EN: enDashboard },
} as const

export type Namespace = keyof typeof dictionaries

/** 在元件中取用指定 namespace 的當前語言文案 */
export function useT<N extends Namespace>(ns: N): (typeof dictionaries)[N]['ZH'] {
  const { lang } = useLanguage()
  return dictionaries[ns][lang] as (typeof dictionaries)[N]['ZH']
}
