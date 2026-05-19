import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../markdown'

describe('S3.2 Markdown preview renderer', () => {
  it('test_markdown_preview_renders_headings — renders h1 to h6 tags correctly', () => {
    expect(renderMarkdown('# Heading 1')).toBe('<h1>Heading 1</h1>')
    expect(renderMarkdown('## Heading 2')).toBe('<h2>Heading 2</h2>')
    expect(renderMarkdown('### Heading 3')).toBe('<h3>Heading 3</h3>')
    expect(renderMarkdown('#### Heading 4')).toBe('<h4>Heading 4</h4>')
    expect(renderMarkdown('##### Heading 5')).toBe('<h5>Heading 5</h5>')
    expect(renderMarkdown('###### Heading 6')).toBe('<h6>Heading 6</h6>')
  })

  it('test_markdown_preview_renders_lists — renders ordered and unordered lists correctly', () => {
    // Unordered list
    const ulMd = '- item 1\n- item 2\n* item 3'
    expect(renderMarkdown(ulMd)).toBe('<ul><li>item 1</li><li>item 2</li><li>item 3</li></ul>')

    // Ordered list
    const olMd = '1. item A\n2. item B\n3. item C'
    expect(renderMarkdown(olMd)).toBe('<ol><li>item A</li><li>item B</li><li>item C</li></ol>')

    // Transitioning from list to text and back
    const mixedMd = 'some text\n- item 1\nmore text\n1. item A'
    expect(renderMarkdown(mixedMd)).toBe('<p>some text</p><ul><li>item 1</li></ul><p>more text</p><ol><li>item A</li></ol>')
  })

  it('test_markdown_preview_renders_tables — renders tables with headers, separators and rows', () => {
    const tableMd = '| col A | col B |\n|---|---|\n| val 1 | val 2 |'
    expect(renderMarkdown(tableMd)).toBe(
      '<table><thead><tr><th>col A</th><th>col B</th></tr></thead><tbody><tr><td>val 1</td><td>val 2</td></tr></tbody></table>'
    )

    // Table with no separator or multiple rows
    const tableNoSepMd = '| col A | col B |\n| val 1 | val 2 |\n| val 3 | val 4 |'
    expect(renderMarkdown(tableNoSepMd)).toBe(
      '<table><thead><tr><th>col A</th><th>col B</th></tr></thead><tbody><tr><td>val 1</td><td>val 2</td></tr><tr><td>val 3</td><td>val 4</td></tr></tbody></table>'
    )
  })

  it('test_markdown_preview_renders_code_blocks — renders code blocks with lang classes', () => {
    const codeMd = '```js\nconsole.log("hello");\nconst x = 1;\n```'
    expect(renderMarkdown(codeMd)).toBe(
      '<pre><code class="language-js">console.log(&quot;hello&quot;);\nconst x = 1;</code></pre>'
    )

    const codeNoLangMd = '```\njust plain text\n```'
    expect(renderMarkdown(codeNoLangMd)).toBe(
      '<pre><code>just plain text</code></pre>'
    )
  })

  it('test_markdown_preview_handles_yaml_frontmatter — strips YAML frontmatter at start', () => {
    const md = '---\ntitle: "Survey"\nperResponse: 10\n---\n# Main Title\nHello world'
    expect(renderMarkdown(md)).toBe('<h1>Main Title</h1><p>Hello world</p>')
  })

  it('test_markdown_preview_does_not_execute_html — prevents XSS by escaping HTML tags', () => {
    const dangerousMd = '<script>alert("XSS")</script>\n<img src=x onerror=alert(1)>'
    expect(renderMarkdown(dangerousMd)).toBe(
      '<p>&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;</p><p>&lt;img src=x onerror=alert(1)&gt;</p>'
    )

    // XSS inside code block, lists, headings
    expect(renderMarkdown('# <h1>Heading</h1>')).toBe('<h1>&lt;h1&gt;Heading&lt;/h1&gt;</h1>')
    expect(renderMarkdown('- <script>')).toBe('<ul><li>&lt;script&gt;</li></ul>')
    expect(renderMarkdown('```html\n<script>alert(1)</script>\n```')).toBe(
      '<pre><code class="language-html">&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>'
    )
  })
})
