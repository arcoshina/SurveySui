import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CreatePage from '../pages/CreatePage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderCreatePage() {
  return render(
    <MemoryRouter initialEntries={['/create']}>
      <CreatePage />
    </MemoryRouter>,
  )
}

const VALID_FRONTMATTER = `---
title: "Sui Overflow 滿意度調查"
perResponse: 7
maxResponses: 42
deadline: "2099-01-01T00:00:00Z"
---

問卷正文…
`

describe('CreatePage — T4.2 /create 建立問卷頁', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('test_parse_frontmatter — 預覽區顯示解析後的獎勵設定', () => {
    renderCreatePage()

    const editor = screen.getByLabelText('問卷內容（Markdown with frontmatter）')
    fireEvent.change(editor, { target: { value: VALID_FRONTMATTER } })

    const summary = screen.getByLabelText('獎勵設定預覽')

    expect(within(summary).getByText(/perResponse/i)).toBeInTheDocument()
    expect(within(summary).getByText(/\b7\b/)).toBeInTheDocument()

    expect(within(summary).getByText(/maxResponses/i)).toBeInTheDocument()
    expect(within(summary).getByText(/\b42\b/)).toBeInTheDocument()

    expect(within(summary).getByText(/deadline/i)).toBeInTheDocument()
    expect(within(summary).getByText(/2099/)).toBeInTheDocument()
  })

  it('test_invalid_yaml_shows_error — 缺欄位 / 格式錯誤顯示錯誤訊息', async () => {
    renderCreatePage()

    const editor = screen.getByLabelText('問卷內容（Markdown with frontmatter）')

    // 空內容：按送出顯示錯誤
    fireEvent.change(editor, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /下一步：前往注資/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()

    // frontmatter 缺欄位
    fireEvent.change(editor, { target: { value: '---\ntitle: only-title\n---\n' } })
    fireEvent.click(screen.getByRole('button', { name: /下一步：前往注資/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()

    // 沒有 frontmatter 區塊
    fireEvent.change(editor, { target: { value: '純文字沒有 frontmatter' } })
    fireEvent.click(screen.getByRole('button', { name: /下一步：前往注資/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('test_submit_persists_draft_and_navigates_to_fund_with_draft_id — 有效 frontmatter 時寫 localStorage 並跳 /fund/:draftId', () => {
    renderCreatePage()

    const editor = screen.getByLabelText('問卷內容（Markdown with frontmatter）')
    fireEvent.change(editor, { target: { value: VALID_FRONTMATTER } })

    fireEvent.click(screen.getByRole('button', { name: /下一步：前往注資/ }))

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    const [navTarget] = mockNavigate.mock.calls[0]
    expect(typeof navTarget).toBe('string')
    expect(navTarget).toMatch(/^\/fund\/[^/]+$/)

    const draftId = (navTarget as string).split('/').pop()!
    const stored = window.localStorage.getItem(`surveysui:draft:${draftId}`)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.contentMd).toBe(VALID_FRONTMATTER)
  })
})
