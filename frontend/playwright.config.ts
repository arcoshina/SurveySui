import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  webServer: [
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npx tsx ../bff/src/index.ts',
      port: 3100,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        PORT: '3100',
        DATABASE_URL: '',
        ADMIN_PRIVATE_KEY: '',
        SUI_ADMIN_PRIVATE_KEY: '',
        SESSION_SECRET: '',
        SUI_PACKAGE_ID: process.env.SUI_PACKAGE_ID || '',
        SUI_RPC_URL: process.env.SUI_RPC_URL || '',
        SURVEY_PASS_ISSUER_PRIV: process.env.SURVEY_PASS_ISSUER_PRIV || '0101010101010101010101010101010101010101010101010101010101010101',
        SURVEY_PASS_ISSUER_SALT: process.env.SURVEY_PASS_ISSUER_SALT || 'dev_salt_surveysui_v2',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
