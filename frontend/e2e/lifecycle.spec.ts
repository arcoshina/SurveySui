import { test, expect, type Page } from '@playwright/test'

// T4.1 — E2E 整合測試
// 完整流程：建立 → 注資導頁 → zkLogin → 填答 → 拿 RWD → swap UI 載入
// 1 個 happy-path scenario + 3 個 sad-path（已領過 / 已截止 / 名額用盡）
//
// 本層 E2E 以 page.route() mock 後端 + 模擬 OAuth callback。
// 真實 backend 整合測試見 backend/tests/contract.test.ts（T4.3）。
// pre-demo 全鏈路驗證見 Tasks.md T5.9。

const SURVEY_ID = 'e2e-survey-001'
const TX_DIGEST = '0xfeedfacecafe1234567890abcdef'

// 符合 backend parseSurveyMarkdown 格式的問卷 markdown
const SURVEY_MD = `---
title: "Sui Overflow 滿意度調查"
perResponse: 1
maxResponses: 10
deadline: "2099-12-31T23:59:59Z"
questions:
  - id: q1
    type: SINGLE_CHOICE
    prompt: "您最喜歡 Sui 的哪個特性？"
    required: true
    options:
      - Move 語言
      - Object model
      - 低 gas
  - id: q2
    type: SHORT_ANSWER
    prompt: "有什麼建議？"
    required: false
---

問卷說明文字。
`

const MOCK_SURVEY = {
  id: SURVEY_ID,
  title: 'Sui Overflow 滿意度調查',
  status: 'ACTIVE',
  deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  per_response: 1,
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      prompt: '您最喜歡 Sui 的哪個特性？',
      options_json: ['Move 語言', 'Object model', '低 gas'],
      required: true,
    },
    {
      id: 'q2',
      type: 'text',
      prompt: '有什麼建議？',
      options_json: null,
      required: false,
    },
  ],
}

interface RouteSetup {
  responseHandler?: (route: import('@playwright/test').Route) => Promise<void>
  surveyOverride?: typeof MOCK_SURVEY
}

async function setupBackendMocks(page: Page, opts: RouteSetup = {}) {
  // GET /surveys/:id — 載入問卷
  await page.route(`**/surveys/${SURVEY_ID}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(opts.surveyOverride ?? MOCK_SURVEY),
    })
  })

  // POST /surveys/:id/responses — 提交答案 + 領 RWD
  await page.route(`**/surveys/${SURVEY_ID}/responses`, async (route) => {
    if (opts.responseHandler) {
      await opts.responseHandler(route)
      return
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'resp-1',
        contentHash: '0xhash',
        txDigest: TX_DIGEST,
      }),
    })
  })

  // POST /surveys — 建立問卷（FundPage 完成 PTB 後呼叫，mock 回 survey id）
  await page.route('**/surveys', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    // 驗證 payload 已使用新格式（camelCase + vaultObjectId）
    const body = route.request().postDataJSON() as Record<string, unknown>
    const hasNewShape =
      typeof body.contentMd === 'string' &&
      typeof body.vaultObjectId === 'string' &&
      typeof body.creatorAddress === 'string'
    await route.fulfill({
      status: hasNewShape ? 201 : 400,
      contentType: 'application/json',
      body: JSON.stringify(hasNewShape ? { id: SURVEY_ID } : { error: 'invalid_body' }),
    })
  })

  // POST /auth/zklogin/finalize — 模擬 zkLogin 後端驗證
  await page.route('**/auth/zklogin/finalize', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })

  // GET /me/sbt-status — polling，回 ACTIVE
  await page.route('**/me/sbt-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ACTIVE' }),
    })
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Happy path：完整生命週期
// ────────────────────────────────────────────────────────────────────────────

test.describe('T4.1 happy-path：完整生命週期', () => {
  test('創建問卷 → 導向注資 → zkLogin → 填答領 RWD → swap 頁載入', async ({ page }) => {
    await setupBackendMocks(page)

    // ── 1. 創建者：建立問卷（frontmatter 格式）─────────────────────────────
    await page.goto('/create')
    await expect(page.getByRole('heading', { name: '建立問卷' })).toBeVisible()

    // 清空預設 template，填入包含 frontmatter 的測試問卷
    await page.locator('textarea#content').fill(SURVEY_MD)

    await page.getByRole('button', { name: /下一步/ }).click()

    // CreatePage 驗通過後直接導向 /fund（不再有 success banner）
    await expect(page).toHaveURL(/\/fund$/)

    // ── 2. 受訪者：zkLogin 登入 ──────────────────────────────────────────
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /SurveySui/ })).toBeVisible()
    await expect(page.getByLabel('使用 Google 登入')).toBeVisible()

    // 模擬 OAuth 回呼（帶 id_token）
    await page.goto('/login/callback?id_token=fake-jwt-for-e2e')
    await expect(page.getByLabel('sbt-status')).toContainText('護照已啟用', {
      timeout: 5_000,
    })

    // ── 3. 填答頁：渲染問卷 ──────────────────────────────────────────────
    await page.goto(`/s/${SURVEY_ID}`)
    await expect(page.getByRole('heading', { name: MOCK_SURVEY.title })).toBeVisible()
    await expect(page.getByText('您最喜歡 Sui 的哪個特性？')).toBeVisible()

    // 回答必填單選題
    await page.getByLabel('Move 語言').check()

    // 進入預覽
    await page.getByRole('button', { name: /預覽答案/ }).click()
    await expect(page.getByRole('heading', { name: '確認您的答案' })).toBeVisible()

    // ── 4. 提交 → 拿 RWD → 顯示 TX hash ──────────────────────────────────
    await page.getByRole('button', { name: /確認提交/ }).click()
    await expect(page.getByRole('heading', { name: '提交成功！' })).toBeVisible()
    await expect(page.getByLabel('tx-hash')).toHaveText(TX_DIGEST)

    // ── 5. Swap 頁：UI 可載入 ──────────────────────────────────────────────
    await page.goto('/swap')
    await expect(page.getByRole('heading', { name: '兌換代幣' })).toBeVisible()
    await expect(page.getByLabel(/amount-in-/)).toBeVisible()
    await expect(page.getByLabel(/amount-out-/)).toBeVisible()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Sad paths：3 種已知失敗情境
// ────────────────────────────────────────────────────────────────────────────

test.describe('T4.1 sad-path：填答失敗情境', () => {
  test('受訪者已領過（already_claimed）→ 顯示錯誤、停留在 review', async ({ page }) => {
    await setupBackendMocks(page, {
      responseHandler: async (route) => {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'already_claimed' }),
        })
      },
    })

    await page.goto(`/s/${SURVEY_ID}`)
    await page.getByLabel('Move 語言').check()
    await page.getByRole('button', { name: /預覽答案/ }).click()
    await page.getByRole('button', { name: /確認提交/ }).click()

    await expect(page.getByRole('heading', { name: '提交成功！' })).toHaveCount(0)
    const alert = page.getByRole('alert').filter({ hasText: /already_claimed/ })
    await expect(alert).toBeVisible()
  })

  test('問卷已截止（survey_expired）→ 顯示錯誤', async ({ page }) => {
    await setupBackendMocks(page, {
      responseHandler: async (route) => {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'survey_expired' }),
        })
      },
    })

    await page.goto(`/s/${SURVEY_ID}`)
    await page.getByLabel('Move 語言').check()
    await page.getByRole('button', { name: /預覽答案/ }).click()
    await page.getByRole('button', { name: /確認提交/ }).click()

    await expect(page.getByRole('heading', { name: '提交成功！' })).toHaveCount(0)
    const alert = page.getByRole('alert').filter({ hasText: /survey_expired/ })
    await expect(alert).toBeVisible()
  })

  test('名額用盡（quota_exhausted）→ 顯示錯誤', async ({ page }) => {
    await setupBackendMocks(page, {
      responseHandler: async (route) => {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'quota_exhausted' }),
        })
      },
    })

    await page.goto(`/s/${SURVEY_ID}`)
    await page.getByLabel('Move 語言').check()
    await page.getByRole('button', { name: /預覽答案/ }).click()
    await page.getByRole('button', { name: /確認提交/ }).click()

    await expect(page.getByRole('heading', { name: '提交成功！' })).toHaveCount(0)
    const alert = page.getByRole('alert').filter({ hasText: /quota_exhausted/ })
    await expect(alert).toBeVisible()
  })
})
