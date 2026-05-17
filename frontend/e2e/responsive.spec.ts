import { test, expect } from '@playwright/test'

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

const ROUTES = [
  { path: '/create', heading: '建立問卷' },
  { path: '/dashboard', heading: '儀表板' },
  { path: '/s/test-survey-id', heading: '填寫問卷' },
  { path: '/swap', heading: '兌換代幣' },
]

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    for (const route of ROUTES) {
      test(`${route.path} 可載入並顯示標題`, async ({ page }) => {
        await page.goto(route.path)
        await expect(page.getByRole('heading', { name: route.heading })).toBeVisible()
      })
    }

    test('/create 編輯器與預覽區塊皆可見', async ({ page }) => {
      await page.goto('/create')
      await expect(page.locator('textarea#content')).toBeVisible()
      await expect(page.getByLabel('markdown 預覽')).toBeVisible()
    })

    test('/swap 輸入欄位可見且無橫向捲軸', async ({ page }) => {
      await page.goto('/swap')
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width)
      await expect(page.locator('input[type="number"]').first()).toBeVisible()
    })
  })
}
