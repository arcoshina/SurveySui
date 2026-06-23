function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 控制字元（U+0000–U+001F 含 tab/LF/CR/NULL、U+007F DEL、U+0080–U+009F C1）
// 攻擊者可藉此插入字元繞過協定比對，瀏覽器解析 URL 時又會將其剝除
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g

// 將已 escape 過的 url 還原、移除控制字元後以白名單判定協定。
// 回傳正規化後的安全 URL；不被允許時回傳 null。輸出端須再經 escapeHtml。
function sanitizeUrl(rawUrl: string): string | null {
  const normalized = rawUrl
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(CONTROL_CHARS, '')
    .trim()

  // 帶協定者僅允許 http/https/mailto；其餘（javascript/data/vbscript/file…）一律拒絕
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized)) {
    return /^(https?|mailto):/i.test(normalized) ? normalized : null
  }
  // 無協定 → 視為相對路徑/錨點，允許
  return normalized
}

function inlineFormat(text: string): string {
  let escaped = escapeHtml(text)

  // 1. 處理 Markdown 圖片 `![alt](url)`
  // 匹配格式: ![alt](url)
  // 安全過濾：將外部圖片連結轉換為 BFF Image Proxy 代理載入，防範 IP 追蹤與惡意內容載入
  escaped = escaped.replace(/!\[([^\]]*?)\]\((.+?)\)/g, (match, altText, url) => {
    const safeUrl = sanitizeUrl(url)
    // 協定不被允許（data: / javascript: 等）→ 不輸出圖片，僅保留 alt 文字
    if (safeUrl === null) {
      return altText
    }
    if (/^https?:\/\//i.test(safeUrl)) {
      let bffUrl = 'http://localhost:3100'
      try {
        bffUrl = import.meta.env?.VITE_BFF_URL || 'http://localhost:3100'
      } catch {
        // Fallback for node testing environments
      }
      const proxyUrl = `${bffUrl}/api/proxy/image?url=${encodeURIComponent(safeUrl)}`
      return `<img src="${proxyUrl}" alt="${altText}" />`
    }
    // 相對路徑/錨點：用正規化後的安全值並重新 escape 後放入屬性
    return `<img src="${escapeHtml(safeUrl)}" alt="${altText}" />`
  })

  // 2. 處理 Markdown 連結 `[text](url)`
  // 匹配格式: [text](url)
  // 安全過濾：防範 javascript: / data: 協定注入 XSS
  escaped = escaped.replace(/\[([^\]]+?)\]\((.+?)\)/g, (match, linkText, url) => {
    const safeUrl = sanitizeUrl(url)
    // 白名單外的協定（含控制字元繞過的 javascript:）→ 導向 about:blank
    if (safeUrl === null) {
      return `<a href="about:blank" target="_blank" rel="noopener noreferrer">${linkText}</a>`
    }
    // href 用正規化後的安全值並重新 escape，避免原始 url 殘留可繞過的控制字元
    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${linkText}</a>`
  })

  // 3. 基本樣式轉換（粗體、斜體、行內程式碼）
  return escaped
    .replace(/\*\*([^\*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^\*]+?)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>')
}

export function renderMarkdown(md: string): string {
  // 1. Safety limit: limit maximum character length to prevent DoS
  if (md.length > 50000) {
    md = md.substring(0, 50000) + '\n\n*(問卷內容過長，已自動截斷)*'
  }

  // 2. YAML frontmatter stripping
  let cleanMd = md
  if (md.startsWith('---')) {
    const lines = md.split(/\r?\n/)
    let closingIndex = -1
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        closingIndex = i
        break
      }
    }
    if (closingIndex !== -1) {
      cleanMd = lines.slice(closingIndex + 1).join('\n')
    }
  }

  const lines = cleanMd.split(/\r?\n/)
  const parts: string[] = []

  let inUl = false
  let inOl = false
  let inCodeBlock = false
  let codeBlockLang = ''
  let codeBlockLines: string[] = []
  let inTable = false
  let tableRows: string[][] = []
  let hasTableHeaderSeparator = false

  const closeLists = () => {
    if (inUl) {
      parts.push('</ul>')
      inUl = false
    }
    if (inOl) {
      parts.push('</ol>')
      inOl = false
    }
  }

  const closeTable = () => {
    if (inTable) {
      // 外層容器：表格不佔滿、先換行，塞不下時由此容器水平捲動
      parts.push('<div class="prose-table">')
      parts.push('<table>')
      if (tableRows.length > 0) {
        parts.push('<thead>')
        parts.push('<tr>')
        for (const cell of tableRows[0]) {
          parts.push(`<th>${inlineFormat(cell)}</th>`)
        }
        parts.push('</tr>')
        parts.push('</thead>')

        if (tableRows.length > 1) {
          parts.push('<tbody>')
          const startIdx = hasTableHeaderSeparator ? 2 : 1
          for (let i = startIdx; i < tableRows.length; i++) {
            parts.push('<tr>')
            for (const cell of tableRows[i]) {
              parts.push(`<td>${inlineFormat(cell)}</td>`)
            }
            parts.push('</tr>')
          }
          parts.push('</tbody>')
        }
      }
      parts.push('</table>')
      parts.push('</div>')
      inTable = false
      tableRows = []
      hasTableHeaderSeparator = false
    }
  }

  const closeAll = () => {
    closeLists()
    closeTable()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block handling
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const escapedCode = escapeHtml(codeBlockLines.join('\n'))
        const langClass = codeBlockLang ? ` class="language-${codeBlockLang}"` : ''
        parts.push(`<pre><code${langClass}>${escapedCode}</code></pre>`)
        inCodeBlock = false
        codeBlockLines = []
        codeBlockLang = ''
      } else {
        closeAll()
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim()
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockLines.push(line)
      continue
    }

    const trimmed = line.trim()

    // Table handling
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeLists()
      inTable = true
      const cells = trimmed.split('|').map((c) => c.trim())
      const actualCells = cells.slice(1, cells.length - 1)
      const isSeparator = actualCells.every((c) => /^[:-]+$/.test(c))
      if (isSeparator && tableRows.length === 1) {
        hasTableHeaderSeparator = true
      }
      tableRows.push(actualCells)
      continue
    } else {
      if (inTable) {
        closeTable()
      }
    }

    // Blank line
    if (trimmed === '') {
      closeLists()
      continue
    }

    // Headings (H1 to H6)
    const headingMatch = /^(\#{1,6})\s+(.*)$/.exec(line)
    if (headingMatch) {
      closeLists()
      const level = headingMatch[1].length
      const text = headingMatch[2]
      parts.push(`<h${level}>${inlineFormat(text)}</h${level}>`)
      continue
    }

    // Unordered List
    const ulMatch = /^[-*]\s+(.*)$/.exec(line)
    if (ulMatch) {
      if (inOl) {
        closeLists()
      }
      if (!inUl) {
        parts.push('<ul>')
        inUl = true
      }
      parts.push(`<li>${inlineFormat(ulMatch[1])}</li>`)
      continue
    }

    // Ordered List
    const olMatch = /^(\d+)\.\s+(.*)$/.exec(line)
    if (olMatch) {
      if (inUl) {
        closeLists()
      }
      if (!inOl) {
        parts.push('<ol>')
        inOl = true
      }
      parts.push(`<li>${inlineFormat(olMatch[2])}</li>`)
      continue
    }

    // Paragraph
    closeLists()
    parts.push(`<p>${inlineFormat(line)}</p>`)
  }

  closeAll()

  return parts.join('')
}
