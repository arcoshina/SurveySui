import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SurveyPage from '../pages/SurveyPage'

// ── 測試資料 ────────────────────────────────────────────────────────────────

const MOCK_SURVEY = {
  id: 'survey-abc',
  title: '測試問卷',
  status: 'ACTIVE',
  deadline: '2099-12-31T23:59:59Z',
  per_response: 1,
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      prompt: '您偏好哪種顏色？',
      options_json: ['紅色', '藍色', '綠色'],
      required: true,
    },
    {
      id: 'q2',
      type: 'text',
      prompt: '其他意見',
      options_json: null,
      required: false,
    },
  ],
}

// ── 輔助函式 ────────────────────────────────────────────────────────────────

function renderSurveyPage(id = 'survey-abc') {
  return render(
    <MemoryRouter initialEntries={[`/s/${id}`]}>
      <Routes>
        <Route path="/s/:id" element={<SurveyPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ── 測試 ────────────────────────────────────────────────────────────────────

describe('T3.6 — 問卷填答頁', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  // ── test_required_questions_block_submit ──────────────────────────────────

  it('test_required_questions_block_submit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => MOCK_SURVEY }),
    )

    renderSurveyPage()

    // 等待題目渲染
    expect(await screen.findByText('您偏好哪種顏色？')).toBeInTheDocument()

    // 不回答必填題，直接點擊預覽
    fireEvent.click(screen.getByRole('button', { name: /預覽答案/ }))

    // 應顯示驗證錯誤
    expect(screen.getByRole('alert')).toBeInTheDocument()
    // 不應進入預覽畫面（確認提交按鈕不存在）
    expect(screen.queryByRole('button', { name: /確認提交/ })).not.toBeInTheDocument()
  })

  // ── test_review_screen_shows_all_answers ──────────────────────────────────

  it('test_review_screen_shows_all_answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => MOCK_SURVEY }),
    )

    renderSurveyPage()

    expect(await screen.findByText('您偏好哪種顏色？')).toBeInTheDocument()

    // 選擇單選選項
    fireEvent.click(screen.getByLabelText('紅色'))

    // 填寫文字欄位
    fireEvent.change(screen.getByLabelText('其他意見'), { target: { value: '很不錯' } })

    // 進入預覽畫面
    fireEvent.click(screen.getByRole('button', { name: /預覽答案/ }))

    // 預覽畫面顯示所有問題與答案
    expect(screen.getByText('您偏好哪種顏色？')).toBeInTheDocument()
    expect(screen.getByText('紅色')).toBeInTheDocument()
    expect(screen.getByText('其他意見')).toBeInTheDocument()
    expect(screen.getByText('很不錯')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /確認提交/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /返回修改/ })).toBeInTheDocument()
  })

  // ── test_success_state_shows_tx_hash ─────────────────────────────────────

  it('test_success_state_shows_tx_hash', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_SURVEY })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ txDigest: '0xdeadbeef' }) }),
    )

    renderSurveyPage()

    expect(await screen.findByText('您偏好哪種顏色？')).toBeInTheDocument()

    // 回答必填題
    fireEvent.click(screen.getByLabelText('紅色'))

    // 進入預覽
    fireEvent.click(screen.getByRole('button', { name: /預覽答案/ }))
    expect(screen.getByRole('button', { name: /確認提交/ })).toBeInTheDocument()

    // 確認提交
    fireEvent.click(screen.getByRole('button', { name: /確認提交/ }))

    // 成功後顯示 TX hash
    await waitFor(() => {
      expect(screen.getByLabelText('tx-hash')).toHaveTextContent('0xdeadbeef')
    })
  })
})
