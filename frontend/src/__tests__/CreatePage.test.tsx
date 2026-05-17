import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CreatePage from '../pages/CreatePage'

// Mock useNavigate hook
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

describe('CreatePage', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('test_form_validation_blocks_invalid_input', async () => {
    renderCreatePage()

    const editor = screen.getByLabelText('問卷內容（Markdown with frontmatter）')

    // 清空編輯器並按送出
    fireEvent.change(editor, { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: /下一步：前往注資/ }))

    // 應顯示空內容驗證錯誤
    expect(await screen.findByText('請填寫問卷內容')).toBeInTheDocument()

    // 輸入無效的 frontmatter
    fireEvent.change(editor, { target: { value: '---\ntitle: test\n---\n' } })
    fireEvent.click(screen.getByRole('button', { name: /下一步：前往注資/ }))

    // 應顯示 frontmatter 錯誤訊息
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('test_preview_renders_markdown', () => {
    renderCreatePage()

    const editor = screen.getByLabelText('問卷內容（Markdown with frontmatter）')
    const preview = screen.getByLabelText('markdown 預覽')

    // 輸入 Markdown 標題
    fireEvent.change(editor, { target: { value: '# Hello World' } })
    expect(preview.querySelector('h1')).toHaveTextContent('Hello World')

    // 輸入 Markdown 清單
    fireEvent.change(editor, { target: { value: '- 選項 A\n- 選項 B' } })
    const items = preview.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('選項 A')

    // 輸入粗體語法
    fireEvent.change(editor, { target: { value: '**重要**' } })
    expect(preview.querySelector('strong')).toHaveTextContent('重要')
  })

  it('test_submit_navigates_to_fund', async () => {
    renderCreatePage()

    fireEvent.click(screen.getByRole('button', { name: /下一步：前往注資/ }))

    // 應導向 /fund 並攜帶狀態
    expect(mockNavigate).toHaveBeenCalledWith('/fund', expect.objectContaining({
      state: expect.objectContaining({
        contentMd: expect.stringContaining('perResponse'),
      }),
    }))
  })
})
