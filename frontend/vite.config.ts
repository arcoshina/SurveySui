import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import docsManifest from './vite-plugin-docs-manifest'

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
  plugins: [react(), tailwindcss(), docsManifest()],
  envDir: path.resolve(__dirname, '..'),
  define: {
    'import.meta.env.VITE_PACKAGE_ID': JSON.stringify(env.SUI_PACKAGE_ID || ''),
    'import.meta.env.VITE_AMM_POOL_ID': JSON.stringify(env.AMM_POOL_ID || ''),
    'import.meta.env.VITE_PROTOCOL_CONFIG_ID': JSON.stringify(env.PROTOCOL_CONFIG_ID || ''),
    'import.meta.env.VITE_SSR_TREASURY_ID': JSON.stringify(env.SSR_TREASURY_ID || ''),
    'import.meta.env.VITE_SR_TREASURY_ID': JSON.stringify(env.SR_TREASURY_ID || ''),
    'import.meta.env.VITE_SURVEY_REGISTRY_ID': JSON.stringify(env.SURVEY_REGISTRY_ID || ''),
    'import.meta.env.VITE_PASS_REGISTRY_ID': JSON.stringify(env.PASS_REGISTRY_ID || ''),
    'import.meta.env.VITE_NULLIFIER_REGISTRY_ID': JSON.stringify(
      env.NULLIFIER_REGISTRY_ID || env.PASS_REGISTRY_ID || ''
    ),
    'import.meta.env.VITE_ISSUER_CONFIG_ID': JSON.stringify(env.ISSUER_CONFIG_ID || ''),
    'import.meta.env.VITE_VOID_NFT_ID': JSON.stringify(env.VOID_NFT_ID || ''),
    'import.meta.env.VITE_CLAIM_PASS_SENTINEL_ID': JSON.stringify(
      env.CLAIM_PASS_SENTINEL_ID || ''
    ),
    'import.meta.env.VITE_ADMIN_ADDRESS': JSON.stringify(env.SUI_ADMIN_ADDRESS || ''),
    'import.meta.env.VITE_TICKET_FEE_MIST': JSON.stringify(env.TICKET_FEE_MIST || '0'),
    'import.meta.env.VITE_WALRUS_PUBLISHER_URL': JSON.stringify(
      env.VITE_WALRUS_PUBLISHER_URL || ''
    ),
    'import.meta.env.VITE_WALRUS_AGGREGATOR_URL': JSON.stringify(
      env.VITE_WALRUS_AGGREGATOR_URL || ''
    ),
    'import.meta.env.VITE_WALRUS_STORAGE_EPOCHS': JSON.stringify(
      env.VITE_WALRUS_STORAGE_EPOCHS || '5'
    ),
    'import.meta.env.VITE_SURVEY_SIZE_THRESHOLD_KB': JSON.stringify(
      env.VITE_SURVEY_SIZE_THRESHOLD_KB || '10'
    ),
    'import.meta.env.VITE_MAX_INLINE_ANSWER_BYTES': JSON.stringify(
      env.MAX_INLINE_ANSWER_BYTES ||
        String(
          Math.floor(
            Number(env.MAX_INLINE_ANSWER_KB || env.VITE_ANSWER_SIZE_THRESHOLD_KB || '6') * 1024
          )
        )
    ),
    'import.meta.env.VITE_ANSWER_SIZE_THRESHOLD_KB': JSON.stringify(
      env.VITE_ANSWER_SIZE_THRESHOLD_KB || env.MAX_INLINE_ANSWER_KB || '6'
    ),
    'import.meta.env.VITE_MAX_BLOB_ID_BYTES': JSON.stringify(
      env.MAX_BLOB_ID_BYTES || env.VITE_MAX_BLOB_ID_BYTES || '256'
    ),
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // @worldcoin/idkit 透過 new URL('idkit_wasm_bg.wasm', import.meta.url) 載入 WASM。
  // 若被 esbuild pre-bundle，import.meta.url 會指向 .vite/deps，wasm 撲空 → dev server
  // 回退成 index.html，IDKit 初始化時 WebAssembly.instantiate 收到 '<!do'（<!doctype）
  // 而報 "expected magic word"。排除 pre-bundle 後走 Vite 原生 transform，wasm 才會
  // 被正確當 asset 服務（application/wasm）。
  optimizeDeps: {
    exclude: ['@worldcoin/idkit', '@worldcoin/idkit-core'],
    // idkit 內部 `import QRCodeUtil from 'qrcode/lib/core/qrcode.js'`（CJS）。
    // 排除 idkit 後若不單獨 pre-bundle 這個 CJS 深層路徑，Vite 會把它當 ESM 載入，
    // 因無 default export 而整頁崩成全黑。明確 include 讓 Vite 處理 CJS interop。
    include: ['qrcode/lib/core/qrcode.js'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@mysten/')) return 'sui-vendor'
          if (id.includes('@tanstack/react-query')) return 'query-vendor'
          if (
            id.includes('react-router') ||
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return 'react-vendor'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/auth': {
        target: 'http://localhost:3100',
        bypass: (req) => {
          // 只對 /auth 精確路徑（SPA 頁面）bypass；/auth/:provider/* 必須打到 BFF
          const url = req.url ?? ''
          const isSpaPage = url === '/auth' || url.startsWith('/auth?')
          if (isSpaPage && req.headers.accept?.includes('html')) {
            return '/index.html'
          }
        },
      },
      '/stats': 'http://localhost:3100',
      '/og': 'http://localhost:3100',
      '/api': 'http://localhost:3100',
      '/health': 'http://localhost:3100',
    },
  },
})
