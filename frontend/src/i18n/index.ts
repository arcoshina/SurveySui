import { useLanguage } from '../context/LanguageContext'

import zhNavbar from './zh/navbar'
import enNavbar from './en/navbar'
import jaNavbar from './ja/navbar'
import koNavbar from './ko/navbar'
import esNavbar from './es/navbar'

import zhLanding from './zh/landing'
import enLanding from './en/landing'
import jaLanding from './ja/landing'
import koLanding from './ko/landing'
import esLanding from './es/landing'

import zhGuide from './zh/guide'
import enGuide from './en/guide'
import jaGuide from './ja/guide'
import koGuide from './ko/guide'
import esGuide from './es/guide'

import zhResults from './zh/results'
import enResults from './en/results'
import jaResults from './ja/results'
import koResults from './ko/results'
import esResults from './es/results'

import zhAuth from './zh/auth'
import enAuth from './en/auth'
import jaAuth from './ja/auth'
import koAuth from './ko/auth'
import esAuth from './es/auth'

import zhFund from './zh/fund'
import enFund from './en/fund'
import jaFund from './ja/fund'
import koFund from './ko/fund'
import esFund from './es/fund'

import zhSurvey from './zh/survey'
import enSurvey from './en/survey'
import jaSurvey from './ja/survey'
import koSurvey from './ko/survey'
import esSurvey from './es/survey'

import zhCreate from './zh/create'
import enCreate from './en/create'
import jaCreate from './ja/create'
import koCreate from './ko/create'
import esCreate from './es/create'

import zhDashboard from './zh/dashboard'
import enDashboard from './en/dashboard'
import jaDashboard from './ja/dashboard'
import koDashboard from './ko/dashboard'
import esDashboard from './es/dashboard'

import zhExplore from './zh/explore'
import enExplore from './en/explore'
import jaExplore from './ja/explore'
import koExplore from './ko/explore'
import esExplore from './es/explore'

/**
 * 集中語言字典註冊表。
 * 每個 namespace 對應一頁（或共用元件）的文案，ZH 為型別正本、EN 須吻合其形狀。
 * 新增語言＝新增整組檔案並在此補一個語言鍵。
 */
export const dictionaries = {
  navbar: { ZH: zhNavbar, EN: enNavbar, JA: jaNavbar, KO: koNavbar, ES: esNavbar },
  landing: { ZH: zhLanding, EN: enLanding, JA: jaLanding, KO: koLanding, ES: esLanding },
  guide: { ZH: zhGuide, EN: enGuide, JA: jaGuide, KO: koGuide, ES: esGuide },
  results: { ZH: zhResults, EN: enResults, JA: jaResults, KO: koResults, ES: esResults },
  auth: { ZH: zhAuth, EN: enAuth, JA: jaAuth, KO: koAuth, ES: esAuth },
  fund: { ZH: zhFund, EN: enFund, JA: jaFund, KO: koFund, ES: esFund },
  survey: { ZH: zhSurvey, EN: enSurvey, JA: jaSurvey, KO: koSurvey, ES: esSurvey },
  create: { ZH: zhCreate, EN: enCreate, JA: jaCreate, KO: koCreate, ES: esCreate },
  dashboard: { ZH: zhDashboard, EN: enDashboard, JA: jaDashboard, KO: koDashboard, ES: esDashboard },
  explore: { ZH: zhExplore, EN: enExplore, JA: jaExplore, KO: koExplore, ES: esExplore },
} as const

export type Namespace = keyof typeof dictionaries

/** 在元件中取用指定 namespace 的當前語言文案 */
export function useT<N extends Namespace>(ns: N): (typeof dictionaries)[N]['ZH'] {
  const { lang } = useLanguage()
  return dictionaries[ns][lang] as (typeof dictionaries)[N]['ZH']
}
