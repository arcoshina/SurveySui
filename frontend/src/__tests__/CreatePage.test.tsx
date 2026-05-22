import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CreatePage from '../pages/CreatePage'
import { parseFullSurveyMarkdown } from '../lib/frontmatter'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: vi.fn().mockReturnValue({ address: '0x123' }),
  useSuiClientQuery: vi.fn((queryName) => {
    if (queryName === 'getObject') {
      return {
        data: {
          data: {
            content: {
              dataType: 'moveObject',
              fields: {
                total_sui_invested: '0',
                fee_config: {
                  fields: {
                    total_fee_bps: '2000',
                    discount_bps: '5000',
                  },
                },
              },
            },
          },
        },
      }
    }
    if (queryName === 'getCoins') {
      return {
        data: {
          data: [{ coinObjectId: '0xcoin1', balance: '5000000000' }], // 5 SSR
        },
      }
    }
    return { data: null }
  }),
  ConnectButton: () => null,
}))

function renderCreatePage() {
  return render(
    <MemoryRouter initialEntries={['/create']}>
      <CreatePage />
    </MemoryRouter>,
  )
}

describe('CreatePage — Builder UI', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('預設帶出空白範本：標題、每份獎勵、名額、身分門檻欄位存在', () => {
    renderCreatePage()
    expect(screen.getByLabelText('問卷標題')).toBeInTheDocument()
    expect(screen.getByLabelText('perResponse')).toBeInTheDocument()
    expect(screen.getByLabelText('maxResponses')).toBeInTheDocument()
    expect(screen.getByLabelText('deadline')).toBeInTheDocument()
    expect(screen.getByLabelText('minTier')).toBeInTheDocument()
    expect(screen.getByLabelText('description')).toBeInTheDocument()
  })

  it('新增題目按鈕會多一張題目卡片', () => {
    renderCreatePage()
    const before = screen.getAllByText(/^#\d+/).length
    fireEvent.click(screen.getByRole('button', { name: /\+ 新增題目/ }))
    const after = screen.getAllByText(/^#\d+/).length
    expect(after).toBe(before + 1)
  })

  it('Markdown 預覽即時反映 description（frontmatter 被 renderMarkdown 隱藏）', () => {
    renderCreatePage()
    fireEvent.change(screen.getByLabelText('description'), { target: { value: '這是新的說明' } })
    const preview = screen.getByLabelText('markdown 預覽')
    expect(preview.textContent).toContain('這是新的說明')
  })

  it('身分門檻 select 反映當前值', () => {
    renderCreatePage()
    const select = screen.getByLabelText('minTier') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '2' } })
    expect(select.value).toBe('2')
  })

  it('提交空標題顯示錯誤、不導航', () => {
    renderCreatePage()
    fireEvent.change(screen.getByLabelText('問卷標題'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /下一步：前往注資/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/標題/)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('提交有效表單：寫入 localStorage 並導航到 /fund/:draftId，內容為新三段式 markdown', () => {
    renderCreatePage()
    fireEvent.change(screen.getByLabelText('問卷標題'), { target: { value: '我的問卷' } })
    fireEvent.change(screen.getByLabelText('perResponse'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('maxResponses'), { target: { value: '42' } })
    fireEvent.change(screen.getByLabelText('minTier'), { target: { value: '1' } })

    fireEvent.click(screen.getByRole('button', { name: /下一步：前往注資/ }))

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    const navTarget = mockNavigate.mock.calls[0][0] as string
    expect(navTarget).toMatch(/^\/fund\/[^/]+$/)

    const draftId = navTarget.split('/').pop()!
    const stored = window.localStorage.getItem(`surveysui:draft:${draftId}`)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(typeof parsed.contentMd).toBe('string')

    const survey = parseFullSurveyMarkdown(parsed.contentMd)
    expect(survey.ok).toBe(true)
    if (survey.ok) {
      expect(survey.data.title).toBe('我的問卷')
      expect(survey.data.perResponse).toBe(7)
      expect(survey.data.maxResponses).toBe(42)
      expect(survey.data.minTier).toBe(1)
    }
  })

  it('費用預估區即時顯示', async () => {
    renderCreatePage()
    await waitFor(
      () => {
        expect(screen.getByText(/既有 SSR 折抵/i)).toBeInTheDocument()
        expect(screen.getByText(/需新鑄 SSR \(AMM\)/i)).toBeInTheDocument()
        expect(screen.getByText(/平台手續費 \(fee\)/i)).toBeInTheDocument()
        expect(screen.getByText(/預估 SUI 消耗/i)).toBeInTheDocument()
      },
      { timeout: 1000 },
    )
  })

  it('工具列存在三個按鈕：下載草稿、上傳、下載範本', () => {
    renderCreatePage()
    expect(screen.getByRole('button', { name: /下載草稿/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /上傳/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下載空白範本/ })).toBeInTheDocument()
  })
})
