import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CreatePage from '../pages/CreatePage'

// 截止日期：2099 年，確保一定在未來
const FUTURE_DEADLINE = '2099-12-31T23:59'

function renderCreatePage() {
  return render(
    <MemoryRouter initialEntries={['/create']}>
      <CreatePage />
    </MemoryRouter>,
  )
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('問卷內容（Markdown）'), {
    target: { value: '# 測試問卷\n\n請回答以下問題。' },
  })
  fireEvent.change(screen.getByLabelText('每份獎勵（RWD）'), {
    target: { value: '10' },
  })
  fireEvent.change(screen.getByLabelText('名額上限'), {
    target: { value: '100' },
  })
  fireEvent.change(screen.getByLabelText('截止日期'), {
    target: { value: FUTURE_DEADLINE },
  })
}

describe('CreatePage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('test_form_validation_blocks_invalid_input', async () => {
    renderCreatePage()

    // 直接按送出，所有欄位都是空的
    fireEvent.click(screen.getByRole('button', { name: /建立問卷/ }))

    // 應顯示所有驗證錯誤
    expect(await screen.findByText('請填寫問卷內容')).toBeInTheDocument()
    expect(screen.getByText('獎勵金額須大於 0')).toBeInTheDocument()
    expect(screen.getByText('名額須為正整數')).toBeInTheDocument()
    expect(screen.getByText('請選擇截止日')).toBeInTheDocument()

    // fetch 不應被呼叫
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('test_preview_renders_markdown', () => {
    renderCreatePage()

    const editor = screen.getByLabelText('問卷內容（Markdown）')
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

  it('test_submit_calls_create_api', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'test-survey-123' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    renderCreatePage()
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: /建立問卷/ }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/surveys')
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body as string)
    expect(body.content_md).toContain('# 測試問卷')
    expect(body.per_response).toBe(10)
    expect(body.max_responses).toBe(100)
    expect(body.deadline).toBe(new Date(FUTURE_DEADLINE).toISOString())

    // 成功後顯示成功訊息
    expect(await screen.findByRole('status')).toHaveTextContent('問卷已成功建立')
  })
})
