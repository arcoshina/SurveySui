import { test, expect, type Page } from '@playwright/test'

// T4.1 — E2E 整合測試
// 完整流程：建立 → 注資導頁 → zkLogin → 填答 → 拿 RWD → swap UI 載入
// 1 個 happy-path scenario + 3 個 sad-path（已領過 / 已截止 / 名額用盡）
//
// 註：本層級 E2E 以 page.route() mock 後端 + 模擬 OAuth callback。
// pre-demo 需另跑一次 testnet/localnet 完整驗證（見 Tasks.md T4.1 規範）。

const SURVEY_ID = 'e2e-survey-001'
const TX_DIGEST = '0xfeedfacecafe1234567890abcdef'

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
  // 用來覆蓋 /surveys/:id/responses 的回應（sad-path 用）
  responseHandler?: (route: import('@playwright/test').Route) => Promise<void>
  // 用來覆蓋 /surveys/:id 的回應（sad-path 用，比方說已截止）
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

  // POST /surveys — 建立問卷（給 happy-path）
  await page.route('**/surveys', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: SURVEY_ID }),
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

    // ── 1. 創建者：建立問卷 ──────────────────────────────────────────────
    await page.goto('/create')
    await expect(page.getByRole('heading', { name: '建立問卷' })).toBeVisible()

    await page.locator('textarea#content').fill('# 測試問卷\n請選擇您最喜歡的特性。')
    await page.locator('input#perResponse').fill('1')
    await page.locator('input#maxResponses').fill('10')

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const localDateTime = futureDate.toISOString().slice(0, 16)
    await page.locator('input#deadline').fill(localDateTime)

    await page.getByRole('button', { name: '建立問卷' }).click()

    // 出現成功 banner + 注資導頁按鈕
    await expect(page.getByText('問卷已成功建立！')).toBeVisible()
    const fundLink = page.getByRole('button', { name: /前往注資/ })
    await expect(fundLink).toBeVisible()

    // ── 2. 注資頁載入（不實際簽 PTB，需錢包）─────────────────────────────
    await fundLink.click()
    await expect(page).toHaveURL(new RegExp(`/fund/${SURVEY_ID}$`))

    // ── 3. 受訪者：zkLogin 登入 ──────────────────────────────────────────
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /SurveySui/ })).toBeVisible()
    await expect(page.getByLabel('使用 Google 登入')).toBeVisible()

    // 模擬 OAuth 回呼（帶 id_token）
    await page.goto('/login/callback?id_token=fake-jwt-for-e2e')
    await expect(page.getByLabel('sbt-status')).toContainText('護照已啟用', {
      timeout: 5_000,
    })

    // ── 4. 填答頁：渲染問卷 ──────────────────────────────────────────────
    await page.goto(`/s/${SURVEY_ID}`)
    await expect(page.getByRole('heading', { name: MOCK_SURVEY.title })).toBeVisible()
    await expect(page.getByText('您最喜歡 Sui 的哪個特性？')).toBeVisible()

    // 回答必填單選題
    await page.getByLabel('Move 語言').check()

    // 進入預覽
    await page.getByRole('button', { name: /預覽答案/ }).click()
    await expect(page.getByRole('heading', { name: '確認您的答案' })).toBeVisible()

    // ── 5. 提交 → 拿 RWD → 顯示 TX hash ──────────────────────────────────
    await page.getByRole('button', { name: /確認提交/ }).click()
    await expect(page.getByRole('heading', { name: '提交成功！' })).toBeVisible()
    await expect(page.getByLabel('tx-hash')).toHaveText(TX_DIGEST)

    // ── 6. Swap 頁：UI 可載入（實際 swap 需要錢包簽章，本層只驗 UI render）─
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

    // 不會進到 success 畫面
    await expect(page.getByRole('heading', { name: '提交成功！' })).toHaveCount(0)
    // 錯誤訊息出現於 review 階段
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
