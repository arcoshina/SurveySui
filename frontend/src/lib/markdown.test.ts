import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown XSS and Link/Image Proxy Sanitization', () => {
  it('should render basic markdown text correctly', () => {
    const text = 'Hello **world** and *italic* and `code`'
    expect(renderMarkdown(text)).toBe(
      '<p>Hello <strong>world</strong> and <em>italic</em> and <code>code</code></p>'
    )
  })

  it('should render strikethrough text correctly', () => {
    expect(renderMarkdown('This is ~~deleted~~ text')).toBe(
      '<p>This is <del>deleted</del> text</p>'
    )
  })

  it('should escape raw HTML tags to prevent HTML injection', () => {
    const malicious = 'Hello <script>alert(1)</script> <iframe src="evil"></iframe>'
    expect(renderMarkdown(malicious)).not.toContain('<script>')
    expect(renderMarkdown(malicious)).not.toContain('<iframe>')
    expect(renderMarkdown(malicious)).toContain('&lt;script&gt;')
  })

  it('should render standard links safely', () => {
    const text = 'Please visit [Google](https://google.com)'
    expect(renderMarkdown(text)).toContain('<a href="https://google.com" target="_blank" rel="noopener noreferrer">Google</a>')
  })

  it('should sanitize javascript: links and replace with about:blank', () => {
    const evilLink = 'Click [here](javascript:alert(1)) or [this](data:text/html,evil)'
    const rendered = renderMarkdown(evilLink)
    expect(rendered).toContain('href="about:blank"')
    expect(rendered).not.toContain('javascript:')
    expect(rendered).not.toContain('data:')
  })

  it('should convert absolute image links to BFF image proxy format', () => {
    const text = 'Check image ![cat](https://example.com/cat.png)'
    const rendered = renderMarkdown(text)
    // 預設 BFF_URL 為 http://localhost:3100
    expect(rendered).toContain('src="http://localhost:3100/api/proxy/image?url=https%3A%2F%2Fexample.com%2Fcat.png"')
    expect(rendered).toContain('alt="cat"')
  })

  it('should keep relative image paths intact without proxying', () => {
    const text = 'Local logo ![logo](/logo.png)'
    const rendered = renderMarkdown(text)
    expect(rendered).toContain('src="/logo.png"')
  })
})
