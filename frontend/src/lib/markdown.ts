function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^\*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^\*]+?)\*/g, '<em>$1</em>')
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
      const cells = trimmed.split('|').map(c => c.trim())
      const actualCells = cells.slice(1, cells.length - 1)
      const isSeparator = actualCells.every(c => /^[:-]+$/.test(c))
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

