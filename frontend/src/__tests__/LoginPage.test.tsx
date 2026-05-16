import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LoginPage from '../pages/LoginPage'
import LoginCallbackPage from '../pages/LoginCallbackPage'

// ── 輔助函式 ────────────────────────────────────────────────────────────────

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderCallbackPage(idToken: string | null = 'test-id-token') {
  const entry = idToken ? `/login/callback?id_token=${idToken}` : '/login/callback'
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login/callback" element={<LoginCallbackPage />} />
        <Route path="/" element={<div>首頁</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

// ── 測試 ────────────────────────────────────────────────────────────────────

describe('T3.5 — zkLogin 登入頁', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  // ── test_login_redirects_to_google ────────────────────────────────────────

  it('test_login_redirects_to_google', () => {
    renderLoginPage()

    const link = screen.getByRole('link', { name: /使用 Google 登入/ })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/auth/google/start')
  })

  // ── test_callback_creates_session ─────────────────────────────────────────

  it('test_callback_creates_session', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '' }) // finalize
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'PENDING' }) }) // polls
    vi.stubGlobal('fetch', mockFetch)

    renderCallbackPage('my-google-jwt')

    // 等待 finalize 呼叫完成，確認 POST body 內容正確
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/auth/zklogin/finalize',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: 'my-google-jwt' }),
        }),
      )
    })

    // session 建立後進入 pending_sbt 狀態
    expect(await screen.findByLabelText('sbt-status')).toHaveTextContent('SBT 申請中')
  })

  // ── test_ui_shows_pending_state_until_sbt_active ──────────────────────────

  it('test_ui_shows_pending_state_until_sbt_active', async () => {
    // SBT 狀態一直回傳 PENDING
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '' }) // finalize
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'PENDING' }) }) // all polls
    vi.stubGlobal('fetch', mockFetch)

    renderCallbackPage()

    // finalize 完成後顯示 pending state
    expect(await screen.findByLabelText('sbt-status')).toHaveTextContent('SBT 申請中，請稍候')
    // active 狀態不應出現
    expect(screen.queryByText('護照已啟用！')).not.toBeInTheDocument()
  })

  // ── test_ui_unlocks_after_sbt_status_active ──────────────────────────────

  it('test_ui_unlocks_after_sbt_status_active', async () => {
    // 只攔截元件的 2000ms polling interval，讓 waitFor 的 50ms interval 正常運作
    let pollCallback: (() => void) | null = null
    const realSetInterval = globalThis.setInterval.bind(globalThis)
    const realClearInterval = globalThis.clearInterval.bind(globalThis)

    vi.stubGlobal('setInterval', (fn: () => void, delay: number) => {
      if (delay === 2000) {
        pollCallback = fn
        return 1 as unknown as ReturnType<typeof setInterval>
      }
      return realSetInterval(fn, delay)
    })
    vi.stubGlobal('clearInterval', (id: unknown) => {
      if (id !== 1) realClearInterval(id as ReturnType<typeof clearInterval>)
    })

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '' }) // finalize
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'PENDING' }) }) // 1st poll
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'ACTIVE' }) }) // 2nd+ polls
    vi.stubGlobal('fetch', mockFetch)

    renderCallbackPage()

    // 等待 finalize 完成、polling 啟動（2000ms interval 被攔截）
    await waitFor(() => expect(pollCallback).not.toBeNull())
    expect(screen.getByLabelText('sbt-status')).toHaveTextContent('SBT 申請中')

    // 觸發兩次 poll（第一次 PENDING，第二次 ACTIVE），等 UI 解鎖
    pollCallback!() // 1st poll → PENDING
    pollCallback!() // 2nd poll → ACTIVE → setPhase('active')

    await waitFor(() => {
      expect(screen.getByLabelText('sbt-status')).toHaveTextContent('護照已啟用！')
    })
    expect(screen.getByRole('button', { name: /開始瀏覽問卷/ })).toBeInTheDocument()
  })
})
