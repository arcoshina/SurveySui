import { test, expect } from '@playwright/test'

const routes = [
  { path: '/create', heading: '建立問卷' },
  { path: '/dashboard', heading: '儀表板' },
  { path: '/s/test-survey-id', heading: '填寫問卷' },
  { path: '/swap', heading: '兌換代幣' },
]

for (const { path, heading } of routes) {
  test(`route ${path} 可載入並顯示標題`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  })
}
