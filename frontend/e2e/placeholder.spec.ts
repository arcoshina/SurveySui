import { test, expect } from '@playwright/test'

// T3.1 will replace this with real smoke tests.
// This file keeps the CI frontend-test job green while no E2E tests exist yet.
test('CI: Playwright infrastructure is wired up', async () => {
  expect(1 + 1).toBe(2)
})
