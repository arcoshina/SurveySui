import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { encryptSurveyContent, bytesToBase64url } from '../lib/crypto'
import { useSuiClientQuery } from '@mysten/dapp-kit'

const mockGetObject = vi.fn()

// Mock dapp-kit hooks
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: vi.fn().mockReturnValue({ address: '0xuser' }),
  useSuiClient: vi.fn().mockReturnValue({
    executeTransactionBlock: vi.fn().mockResolvedValue({ digest: '0xdeadbeef' }),
    getObject: (...args: any[]) => mockGetObject(...args),
  }),
  useSignTransaction: vi.fn().mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ signature: 'mock_user_sig' }),
  }),
  useSignAndExecuteTransaction: vi.fn().mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ digest: '0xdeadbeef' }),
  }),
  useSuiClientQuery: vi.fn().mockImplementation((...args) => {
    // Simple mock that returns a SurveyPass owned by the user
    return {
      data: [
        {
          data: {
            objectId: '0xpass',
            content: {
              dataType: 'moveObject',
              fields: {
                owner: '0xuser',
                effective_tier: 1,
                expires_at: 0,
                status: 0,
              },
            },
          },
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as any;
  }),
}))

// Mock sponsoredTx library
vi.mock('../lib/sponsoredTx', () => ({
  buildClaimPtb: vi.fn().mockReturnValue({}),
  executeTxWithFallback: vi.fn().mockResolvedValue({
    mode: 'sponsored',
    sponsoredTxBytes: 'mock_bytes',
    sponsorSignature: 'mock_sponsor_sig',
  }),
  executeSponsoredTx: vi.fn().mockResolvedValue({ digest: '0xdeadbeef' }),
}))

import { Transaction } from '@mysten/sui/transactions'
import SurveyPage from '../pages/SurveyPage'

// ── 測試資料 ────────────────────────────────────────────────────────────────

const MOCK_MD = `---
title: "測試問卷"
perResponse: 1
maxResponses: 100
deadline: "2099-12-31T23:59:59Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "您偏好哪種顏色？"
    required: true
    options:
      - 紅色
      - 藍色
      - 綠色
  - id: q2
    type: SHORT_ANSWER
    prompt: "其他意見"
    required: false
---

問卷說明文字
`

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
  let defaultEncryptedBlob: Uint8Array
  let defaultContentKey: Uint8Array
  const creatorPubKey = new Uint8Array(32).fill(1)

  beforeEach(async () => {
    sessionStorage.setItem('survey_pass_id', '0xpass')
    sessionStorage.setItem('survey_sub_hash', '0xsubhash')
    vi.spyOn(Transaction, 'from').mockReturnValue({} as any)

    const enc = await encryptSurveyContent(MOCK_MD, creatorPubKey)
    defaultEncryptedBlob = enc.encryptedBlob
    defaultContentKey = enc.contentKey

    // Set default hash for standard tests
    window.location.hash = bytesToBase64url(defaultContentKey)

    mockGetObject.mockResolvedValue({
      data: {
        content: {
          dataType: 'moveObject',
          type: '0xpkg::survey_registry::Survey',
          fields: {
            vault_id: '0xvault',
            status: 0,
            encrypted_content: Array.from(defaultEncryptedBlob),
          },
        },
      },
    })
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  // ── test_required_questions_block_submit ──────────────────────────────────

  it('test_required_questions_block_submit', async () => {
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
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ txDigest: '0xdeadbeef' }) }),
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

  // ── test_render_questions_from_decrypted_md ──────────────────────────────

  it('test_render_questions_from_decrypted_md', async () => {
    // 驗證已加密模式下的完整解密渲染流程
    renderSurveyPage()

    expect(await screen.findByText('您偏好哪種顏色？')).toBeInTheDocument()
    expect(screen.getByLabelText('紅色')).toBeInTheDocument()
    expect(screen.getByLabelText('藍色')).toBeInTheDocument()
    expect(screen.getByLabelText('綠色')).toBeInTheDocument()
    expect(screen.getByLabelText('其他意見')).toBeInTheDocument()
  })

  // ── test_render_questions_from_unencrypted_md ────────────────────────────

  it('test_render_questions_from_unencrypted_md', async () => {
    // 設置 URL hash 為空，模擬明文問卷
    window.location.hash = ''

    const mdBytes = new TextEncoder().encode(MOCK_MD)
    const unencryptedBlob = new Uint8Array(32 + mdBytes.length)
    unencryptedBlob.set(creatorPubKey, 0)
    unencryptedBlob.set(mdBytes, 32)

    mockGetObject.mockResolvedValue({
      data: {
        content: {
          dataType: 'moveObject',
          type: '0xpkg::survey_registry::Survey',
          fields: {
            vault_id: '0xvault',
            status: 0,
            encrypted_content: Array.from(unencryptedBlob),
          },
        },
      },
    })

    renderSurveyPage()

    expect(await screen.findByText('您偏好哪種顏色？')).toBeInTheDocument()
    expect(screen.getByLabelText('紅色')).toBeInTheDocument()
    expect(screen.getByLabelText('其他意見')).toBeInTheDocument()
  })

  // ── test_submit_uses_sponsored_path ─────────────────────────────────────

  it('test_submit_uses_sponsored_path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ txDigest: '0xdeadbeef' }) }),
    )

    renderSurveyPage()

    expect(await screen.findByText('您偏好哪種顏色？')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('紅色'))
    fireEvent.change(screen.getByLabelText('其他意見'), { target: { value: '非常棒！' } })

    fireEvent.click(screen.getByRole('button', { name: /預覽答案/ }))
    fireEvent.click(screen.getByRole('button', { name: /確認提交/ }))

    await waitFor(() => {
      expect(screen.getByLabelText('tx-hash')).toHaveTextContent('0xdeadbeef')
    })
  })
})

// ── S6.2 ────────────────────────────────────────────────────────────────────

describe('S6.2 — SurveyPass 首次連錢包檢查', () => {
  let defaultEncryptedBlob: Uint8Array
  const creatorPubKey = new Uint8Array(32).fill(1)

  const noPassMock = { data: [], isLoading: false, refetch: vi.fn() }
  const validPassMock = {
    data: [{
      data: {
        objectId: '0xpass',
        content: {
          dataType: 'moveObject',
          fields: { owner: '0xuser', effective_tier: 1, expires_at: 0, status: 0 },
        },
      },
    }],
    isLoading: false,
    refetch: vi.fn(),
  }

  beforeEach(async () => {
    sessionStorage.setItem('survey_pass_id', '0xpass')
    vi.spyOn(Transaction, 'from').mockReturnValue({} as any)

    const enc = await encryptSurveyContent(MOCK_MD, creatorPubKey)
    defaultEncryptedBlob = enc.encryptedBlob
    window.location.hash = bytesToBase64url(enc.contentKey)

    mockGetObject.mockResolvedValue({
      data: {
        content: {
          dataType: 'moveObject',
          type: '0xpkg::survey_registry::Survey',
          fields: { vault_id: '0xvault', status: 0, encrypted_content: Array.from(defaultEncryptedBlob) },
        },
      },
    })

    vi.mocked(useSuiClientQuery).mockReturnValue(validPassMock as any)
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  it('test_survey_page_queries_pass_on_wallet_connect', async () => {
    renderSurveyPage()
    await screen.findByText('您偏好哪種顏色？')
    expect(useSuiClientQuery).toHaveBeenCalledWith(
      'getOwnedObjects',
      expect.objectContaining({
        filter: { StructType: expect.stringContaining('::survey_pass::SurveyPass') },
      }),
      expect.any(Object),
    )
  })

  it('test_survey_page_does_not_block_content_without_pass', async () => {
    vi.mocked(useSuiClientQuery).mockReturnValue(noPassMock as any)
    renderSurveyPage()
    expect(await screen.findByText('您偏好哪種顏色？')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /需要身分驗證才能填答/ })
    expect(btn).toBeInTheDocument()
    expect(btn).not.toBeDisabled()
  })

  it('test_survey_page_shows_pass_tier_badge', async () => {
    renderSurveyPage()
    await screen.findByText('您偏好哪種顏色？')
    expect(screen.getByTestId('tier-badge')).toBeInTheDocument()
  })

  it('test_survey_page_submit_disabled_for_gated_survey_no_pass', async () => {
    vi.mocked(useSuiClientQuery).mockReturnValue(noPassMock as any)
    mockGetObject.mockResolvedValue({
      data: {
        content: {
          dataType: 'moveObject',
          type: '0xpkg::survey_registry::Survey',
          fields: {
            vault_id: '0xvault',
            status: 0,
            encrypted_content: Array.from(defaultEncryptedBlob),
            min_tier: 1,
          },
        },
      },
    })
    renderSurveyPage()
    await screen.findByText('您偏好哪種顏色？')
    expect(screen.getByRole('button', { name: /需要身分驗證才能填答/ })).toBeDisabled()
  })

  it('test_survey_page_submit_enabled_with_sufficient_tier', async () => {
    mockGetObject.mockResolvedValue({
      data: {
        content: {
          dataType: 'moveObject',
          type: '0xpkg::survey_registry::Survey',
          fields: {
            vault_id: '0xvault',
            status: 0,
            encrypted_content: Array.from(defaultEncryptedBlob),
            min_tier: 1,
          },
        },
      },
    })
    renderSurveyPage()
    await screen.findByText('您偏好哪種顏色？')
    expect(screen.getByRole('button', { name: /預覽答案/ })).not.toBeDisabled()
  })
})
