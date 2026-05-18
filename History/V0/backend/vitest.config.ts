import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Unit tests — no database needed
        test: {
          name: 'unit',
          include: ['tests/admin-key.test.ts'],
          pool: 'forks',
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
      {
        // Integration tests — require a live PostgreSQL database
        test: {
          name: 'integration',
          globalSetup: ['./tests/global-setup.ts'],
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/admin-key.test.ts'],
          pool: 'forks',
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
    ],
  },
})
