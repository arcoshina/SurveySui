/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom" />

declare module 'virtual:docs-manifest' {
  /** 單篇說明文件的導覽 metadata（由 vite-plugin-docs-manifest 於建置期掃 frontmatter 產生） */
  export interface DocMeta {
    slug: string
    title: string
    order: number
  }
  /** key = 語系資料夾名（'zh' | 'en' | 'ja' | 'ko' | 'es'），value = 依 order 排序的文章清單 */
  const manifest: Record<string, DocMeta[]>
  export default manifest
}
