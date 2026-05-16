function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

export function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  const parts: string[] = []
  let inList = false

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (inList) { parts.push('</ul>'); inList = false }
      parts.push(`<h3>${inlineFormat(line.slice(4))}</h3>`)
    } else if (line.startsWith('## ')) {
      if (inList) { parts.push('</ul>'); inList = false }
      parts.push(`<h2>${inlineFormat(line.slice(3))}</h2>`)
    } else if (line.startsWith('# ')) {
      if (inList) { parts.push('</ul>'); inList = false }
      parts.push(`<h1>${inlineFormat(line.slice(2))}</h1>`)
    } else if (/^[-*] /.test(line)) {
      if (!inList) { parts.push('<ul>'); inList = true }
      parts.push(`<li>${inlineFormat(line.slice(2))}</li>`)
    } else if (line.trim() === '') {
      if (inList) { parts.push('</ul>'); inList = false }
    } else {
      if (inList) { parts.push('</ul>'); inList = false }
      parts.push(`<p>${inlineFormat(line)}</p>`)
    }
  }
  if (inList) parts.push('</ul>')
  return parts.join('')
}
