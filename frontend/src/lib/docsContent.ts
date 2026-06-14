import manifest, { type DocMeta } from 'virtual:docs-manifest'
import type { Language } from '../context/LanguageContext'

export type { DocMeta }

/** Language（大寫）對應 content/docs 下的語系資料夾名（小寫） */
const LANG_DIR: Record<Language, string> = {
  ZH: 'zh',
  EN: 'en',
  JA: 'ja',
  KO: 'ko',
  ES: 'es',
}

// 正文按篇 lazy：每篇 md 被 Vite 切成獨立 chunk，點到哪篇才下載。
const bodies = import.meta.glob('../content/docs/**/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

/** 列出指定語系的文章導覽清單（各語系獨立、不後備；無內容回空陣列） */
export function listDocs(lang: Language): DocMeta[] {
  return manifest[LANG_DIR[lang]] ?? []
}

/** 載入指定語系/slug 的原始 md 正文；該語系無此篇回 null（不後備到其他語系） */
export async function loadDocBody(lang: Language, slug: string): Promise<string | null> {
  const loader = bodies[`../content/docs/${LANG_DIR[lang]}/${slug}.md`]
  return loader ? await loader() : null
}
