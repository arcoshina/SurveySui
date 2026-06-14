import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * 掃描 src/content/docs/<lang>/*.md，從每篇 frontmatter 取 title / order，
 * 產生輕量導覽 manifest 並以虛擬模組 `virtual:docs-manifest` 匯出。
 *
 * 設計取捨：導覽只需要 metadata，正文則由頁面用 import.meta.glob 按篇 lazy 載入。
 * 兩者分離，才能同時做到「自動掃描導覽」與「正文不一次打包」。
 *
 * 不引 js-yaml，沿用專案既有的極簡 regex frontmatter 解析風格（見 src/lib/frontmatter.ts）。
 */

const VIRTUAL_ID = 'virtual:docs-manifest'
const RESOLVED_ID = '\0' + VIRTUAL_ID

interface DocMeta {
  slug: string
  title: string
  order: number
}

/** 從 md 開頭的 YAML frontmatter 取單一鍵值（字串），無則回 null */
function readFrontmatterValue(md: string, key: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)
  if (!fm) return null
  const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(fm[1])
  if (!m) return null
  return m[1].trim().replace(/^["']|["']$/g, '')
}

function buildManifest(docsRoot: string): Record<string, DocMeta[]> {
  const manifest: Record<string, DocMeta[]> = {}
  if (!fs.existsSync(docsRoot)) return manifest

  for (const langDir of fs.readdirSync(docsRoot)) {
    const langPath = path.join(docsRoot, langDir)
    if (!fs.statSync(langPath).isDirectory()) continue

    const metas: DocMeta[] = []
    for (const file of fs.readdirSync(langPath)) {
      if (!file.endsWith('.md')) continue
      const slug = file.slice(0, -3)
      const raw = fs.readFileSync(path.join(langPath, file), 'utf8')
      const title = readFrontmatterValue(raw, 'title') ?? slug
      const orderStr = readFrontmatterValue(raw, 'order')
      const order = orderStr != null && !isNaN(Number(orderStr)) ? Number(orderStr) : Number.MAX_SAFE_INTEGER
      metas.push({ slug, title, order })
    }

    metas.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title))
    manifest[langDir] = metas
  }

  return manifest
}

export default function docsManifest(): Plugin {
  let docsRoot = ''

  return {
    name: 'docs-manifest',

    configResolved(config) {
      docsRoot = path.resolve(config.root, 'src/content/docs')
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },

    load(id) {
      if (id !== RESOLVED_ID) return
      const manifest = buildManifest(docsRoot)
      return `export default ${JSON.stringify(manifest)}`
    },

    configureServer(server) {
      // dev：新增/刪除/改名 md → 失效虛擬模組並整頁重載，導覽即時反映
      server.watcher.add(docsRoot)
      const onChange = (file: string) => {
        if (!file.startsWith(docsRoot) || !file.endsWith('.md')) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
      // 內文 frontmatter 改了 title/order 也要更新導覽
      server.watcher.on('change', onChange)
    },
  }
}
