import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SuiClient } from '@mysten/sui/client'
import { buildApp } from '../src/app.js'
import { createStatsCache } from '../src/stats/cache.js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

vi.mock('@mysten/sui/client')

const mockGetObject = vi.fn()
const mockQueryEvents = vi.fn()
const mockSuiClient = {
  getObject: mockGetObject,
  queryEvents: mockQueryEvents,
} as unknown as SuiClient

describe('BFF 去中心化儲存與快取功能測試', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 清除快取目錄方便測試
    const testDirs = [
      path.join(process.cwd(), 'data', 'ipfs_mock'),
      path.join(process.cwd(), 'data', 'survey_cache'),
      path.join(process.cwd(), 'data', 'answer_cache'),
    ]
    for (const dir of testDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('IPFS Mock Upload 與 Download 流程', async () => {
    const app = await buildApp({
      suiClient: mockSuiClient,
      cache: createStatsCache(),
      packageId: '0xpkg',
      logger: false,
    })

    try {
      const dummyData = Buffer.from('hello-ipfs-proxy')
      const uploadRes = await app.inject({
        method: 'POST',
        url: '/api/storage/ipfs/upload',
        headers: { 'content-type': 'application/octet-stream' },
        payload: dummyData,
      })

      if (uploadRes.statusCode !== 200) {
        console.error('Upload failed details:', uploadRes.body)
      }
      expect(uploadRes.statusCode).toBe(200)
      const { cid } = uploadRes.json<{ cid: string }>()
      expect(cid).toBeDefined()
      expect(cid.startsWith('bafy')).toBe(true)

      const downloadRes = await app.inject({
        method: 'GET',
        url: `/api/storage/ipfs/download/${cid}`,
      })

      expect(downloadRes.statusCode).toBe(200)
      expect(downloadRes.headers['content-type']).toBe('application/octet-stream')
      expect(downloadRes.body).toBe('hello-ipfs-proxy')
    } finally {
      await app.close()
    }
  })

  it('POST /api/cache/survey 零信任校驗 — 雜湊一致成功快取', async () => {
    const dummyContent = Buffer.from('survey-content-json-data')
    const computedHash = crypto.createHash('sha256').update(dummyContent).digest()
    const computedHashArray = Array.from(computedHash)

    // 1. 寫入 IPFS mock 模擬去中心化儲存上傳
    const app = await buildApp({
      suiClient: mockSuiClient,
      cache: createStatsCache(),
      packageId: '0xpkg',
      logger: false,
    })

    try {
      const uploadRes = await app.inject({
        method: 'POST',
        url: '/api/storage/ipfs/upload',
        headers: { 'content-type': 'application/octet-stream' },
        payload: dummyContent,
      })
      const { cid } = uploadRes.json<{ cid: string }>()

      // 2. 模擬 Sui 節點回傳的 Survey 物件
      mockGetObject.mockResolvedValueOnce({
        data: {
          content: {
            fields: {
              content_hash: computedHashArray,
              survey_blob_id: {
                fields: {
                  vec: [Array.from(Buffer.from(cid, 'utf8'))],
                },
              },
            },
          },
        },
      })

      // 3. 呼叫 BFF 快取端點
      const cacheRes = await app.inject({
        method: 'POST',
        url: '/api/cache/survey',
        payload: {
          surveyId: '0xsurvey123',
          blobId: cid,
        },
      })

      expect(cacheRes.statusCode).toBe(200)
      expect(cacheRes.json()).toEqual({ success: true })

      // 驗證本地快取存在且內容一致
      const cachePath = path.join(process.cwd(), 'data', 'survey_cache', '0xsurvey123')
      expect(fs.existsSync(cachePath)).toBe(true)
      expect(fs.readFileSync(cachePath, 'utf8')).toBe('survey-content-json-data')
    } finally {
      await app.close()
    }
  })

  it('POST /api/cache/survey 零信任校驗 — 雜湊不一致回傳 400', async () => {
    const dummyContent = Buffer.from('original-content')
    const fakeContent = Buffer.from('tampered-content')
    const originalHash = Array.from(crypto.createHash('sha256').update(dummyContent).digest())

    const app = await buildApp({
      suiClient: mockSuiClient,
      cache: createStatsCache(),
      packageId: '0xpkg',
      logger: false,
    })

    try {
      // 1. 上傳篡改後的資料
      const uploadRes = await app.inject({
        method: 'POST',
        url: '/api/storage/ipfs/upload',
        headers: { 'content-type': 'application/octet-stream' },
        payload: fakeContent,
      })
      const { cid } = uploadRes.json<{ cid: string }>()

      // 2. 模擬 Sui 返回原始 (original) 的雜湊
      mockGetObject.mockResolvedValueOnce({
        data: {
          content: {
            fields: {
              content_hash: originalHash,
              survey_blob_id: {
                fields: {
                  vec: [Array.from(Buffer.from(cid, 'utf8'))],
                },
              },
            },
          },
        },
      })

      // 3. 呼叫快取，預期失敗
      const cacheRes = await app.inject({
        method: 'POST',
        url: '/api/cache/survey',
        payload: {
          surveyId: '0xsurvey123',
          blobId: cid,
        },
      })

      expect(cacheRes.statusCode).toBe(400)
      expect(cacheRes.json().error).toBe('cache_failed')

      const cachePath = path.join(process.cwd(), 'data', 'survey_cache', '0xsurvey123')
      expect(fs.existsSync(cachePath)).toBe(false)
    } finally {
      await app.close()
    }
  })

  it('/stats/:vaultId 自動補齊去中心化答卷數據', async () => {
    const encryptedAnswer = Buffer.from('super-secret-encrypted-data')
    const app = await buildApp({
      suiClient: mockSuiClient,
      cache: createStatsCache(),
      packageId: '0xpkg',
      logger: false,
    })

    try {
      // 1. 上傳答卷到 IPFS mock 模擬去中心化儲存
      const uploadRes = await app.inject({
        method: 'POST',
        url: '/api/storage/ipfs/upload',
        headers: { 'content-type': 'application/octet-stream' },
        payload: encryptedAnswer,
      })
      const { cid } = uploadRes.json<{ cid: string }>()

      // 2. 模擬 claimed 事件
      mockQueryEvents.mockResolvedValueOnce({
        data: [
          {
            parsedJson: {
              vault_id: '0xvault999',
              sub_hash: [1, 1, 1],
              respondent: '0xrespondent',
              // 走去中心化時 encrypted_answers 為 none
              encrypted_answers: null,
              answer_blob_id: {
                fields: {
                  vec: [Array.from(Buffer.from(cid, 'utf8'))],
                },
              },
              claimed_at_ms: '1700000000000',
            },
          },
        ],
        hasNextPage: false,
      })

      // 3. 請求 stats，驗證是否自動補充 encrypted_answers
      const statsRes = await app.inject({
        method: 'GET',
        url: '/stats/0xvault999',
      })

      expect(statsRes.statusCode).toBe(200)
      const body = statsRes.json<any>()
      expect(body.events[0].encrypted_answers).toEqual(Array.from(encryptedAnswer))
      expect(body.events[0].answer_blob_id).toEqual(Array.from(Buffer.from(cid, 'utf8')))

      // 驗證本地快取也存在
      const answerCachePath = path.join(process.cwd(), 'data', 'answer_cache', cid)
      expect(fs.existsSync(answerCachePath)).toBe(true)
      expect(fs.readFileSync(answerCachePath, 'utf8')).toBe('super-secret-encrypted-data')
    } finally {
      await app.close()
    }
  })
})
