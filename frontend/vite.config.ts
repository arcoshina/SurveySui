import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// Read and parse root .env
const envPath = path.resolve(__dirname, '../.env')
const env: Record<string, string> = {}
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_PACKAGE_ID': JSON.stringify(env.SUI_PACKAGE_ID || ''),
    'import.meta.env.VITE_AMM_POOL_ID': JSON.stringify(env.AMM_POOL_ID || ''),
    'import.meta.env.VITE_SSSR_TREASURY_ID': JSON.stringify(env.SSSR_TREASURY_ID || ''),
    'import.meta.env.VITE_SSR_TREASURY_ID': JSON.stringify(env.SSR_TREASURY_ID || ''),
    'import.meta.env.VITE_SURVEY_REGISTRY_ID': JSON.stringify(env.SURVEY_REGISTRY_ID || ''),
    'import.meta.env.VITE_PASS_REGISTRY_ID': JSON.stringify(env.PASS_REGISTRY_ID || ''),
    'import.meta.env.VITE_NULLIFIER_REGISTRY_ID': JSON.stringify(env.NULLIFIER_REGISTRY_ID || env.PASS_REGISTRY_ID || ''),
    'import.meta.env.VITE_ISSUER_CONFIG_ID': JSON.stringify(env.ISSUER_CONFIG_ID || ''),
    'import.meta.env.VITE_ADMIN_ADDRESS': JSON.stringify(env.SUI_ADMIN_ADDRESS || ''),
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    proxy: {
      '/auth': 'http://localhost:3100',
      '/stats': 'http://localhost:3100',
      '/og': 'http://localhost:3100',
      '/api': 'http://localhost:3100',
      '/health': 'http://localhost:3100',
    },
  },
})
