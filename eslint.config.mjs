import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierConfig from 'eslint-config-prettier'

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: true },
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  prettierConfig,
  {
    // 測試檔不在各 package 的 tsconfig include 範圍內（避免 type-aware「file not found in project」），
    // 且允許 mock 用的 any。
    files: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**/*.ts'],
    languageOptions: { parserOptions: { project: false } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // 工具設定/啟動檔（vitest/playwright config、vitest.setup）非出貨原始碼，未納入各
    // package tsconfig include；關閉 type-aware parser，仍檢查語法與非型別相依規則。
    files: ['**/*.config.ts', '**/*.setup.ts'],
    languageOptions: { parserOptions: { project: false } },
  },
  {
    // dist/.next/node_modules：建置產物；.wrangler、scratch：gitignore 的建置產物與暫存。
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      'scratch/**',
      '**/*.js',
      '**/*.mjs',
    ],
  },
]
