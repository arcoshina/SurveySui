import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { SuiClient } from '@mysten/sui/client'
import { getFromIpfsMock, downloadFromWalrus } from './ipfsProxy.js'

const SURVEY_CACHE_DIR = path.join(process.cwd(), 'data', 'survey_cache')
const ANSWER_CACHE_DIR = path.join(process.cwd(), 'data', 'answer_cache')

// Ensure directories exist
if (!fs.existsSync(SURVEY_CACHE_DIR)) {
  fs.mkdirSync(SURVEY_CACHE_DIR, { recursive: true })
}
if (!fs.existsSync(ANSWER_CACHE_DIR)) {
  fs.mkdirSync(ANSWER_CACHE_DIR, { recursive: true })
}

function getOptionValue<T>(opt: any): T | null {
  if (!opt || !opt.fields || !Array.isArray(opt.fields.vec)) return null
  if (opt.fields.vec.length === 0) return null
  return opt.fields.vec[0] as T
}

/**
 * Cache and validate survey content under zero trust.
 * 1. Fetch Survey Object from SUI chain.
 * 2. Verify on-chain survey_blob_id matches the requested blobId.
 * 3. Fetch from IPFS mock or Walrus.
 * 4. Compute sha256 of downloaded content and assert it matches the on-chain content_hash.
 * 5. If verified, cache the content.
 */
export async function cacheSurveyContent(
  suiClient: SuiClient,
  surveyId: string,
  blobId: string
): Promise<boolean> {
  if (!fs.existsSync(SURVEY_CACHE_DIR)) {
    fs.mkdirSync(SURVEY_CACHE_DIR, { recursive: true })
  }
  const cachePath = path.join(SURVEY_CACHE_DIR, surveyId)
  if (fs.existsSync(cachePath)) {
    return true // Already cached
  }

  // 1. Fetch Survey Object
  const surveyObj = await suiClient.getObject({
    id: surveyId,
    options: { showContent: true }
  })

  if (!surveyObj.data || !surveyObj.data.content) {
    throw new Error(`Survey object not found: ${surveyId}`)
  }

  const fields = (surveyObj.data.content as any).fields
  if (!fields) {
    throw new Error('Survey object fields not found')
  }

  // 2. Extract on-chain survey_blob_id
  const onChainBlobIdBytes = getOptionValue<number[]>(fields.survey_blob_id)
  if (!onChainBlobIdBytes) {
    throw new Error(`Survey ${surveyId} is not in decentralized storage mode (no survey_blob_id)`)
  }

  const onChainBlobId = Buffer.from(onChainBlobIdBytes).toString('utf8')
  if (onChainBlobId !== blobId) {
    throw new Error(`Blob ID mismatch: requested ${blobId}, on-chain is ${onChainBlobId}`)
  }

  // 3. Download the content
  let content: Buffer
  const isIpfs = blobId.startsWith('Qm') || blobId.startsWith('bafy')
  if (isIpfs) {
    content = await getFromIpfsMock(blobId)
  } else {
    content = await downloadFromWalrus(blobId)
  }

  // Check file size threshold (e.g., 10MB safety limit)
  if (content.length > 10 * 1024 * 1024) {
    throw new Error('Survey file size exceeds safe limit of 10MB')
  }

  // 4. Compute sha256 hash and compare to on-chain content_hash
  const computedHashBytes = crypto.createHash('sha256').update(content).digest()
  const onChainHashBytes = fields.content_hash as number[]
  if (!onChainHashBytes) {
    throw new Error('Survey object missing content_hash field')
  }

  const computedHashHex = computedHashBytes.toString('hex')
  const onChainHashHex = Buffer.from(onChainHashBytes).toString('hex')

  if (computedHashHex !== onChainHashHex) {
    throw new Error(`Integrity check failed: hash mismatch. Computed: ${computedHashHex}, expected ${onChainHashHex}`)
  }

  // 5. Cache the content
  await fs.promises.writeFile(cachePath, content)
  console.log(`[CacheManager] Successfully cached survey ${surveyId}`)
  return true
}

/**
 * Cache and validate answer content.
 * Downloads the answer content, audits the file size, and caches it locally.
 */
export async function cacheAnswerContent(
  answerBlobId: string
): Promise<Buffer> {
  if (!fs.existsSync(ANSWER_CACHE_DIR)) {
    fs.mkdirSync(ANSWER_CACHE_DIR, { recursive: true })
  }
  const cachePath = path.join(ANSWER_CACHE_DIR, answerBlobId)
  if (fs.existsSync(cachePath)) {
    return fs.promises.readFile(cachePath)
  }

  let content: Buffer
  const isIpfs = answerBlobId.startsWith('Qm') || answerBlobId.startsWith('bafy')
  if (isIpfs) {
    content = await getFromIpfsMock(answerBlobId)
  } else {
    content = await downloadFromWalrus(answerBlobId)
  }

  // Check answer file size safety limit (e.g. 50KB)
  if (content.length > 50 * 1024) {
    throw new Error(`Answer file size ${content.length} exceeds safety threshold of 50KB`)
  }

  await fs.promises.writeFile(cachePath, content)
  console.log(`[CacheManager] Successfully cached answer ${answerBlobId}`)
  return content
}

/**
 * Helper to retrieve survey cached content
 */
export async function getCachedSurveyContent(surveyId: string): Promise<Buffer | null> {
  const cachePath = path.join(SURVEY_CACHE_DIR, surveyId)
  if (fs.existsSync(cachePath)) {
    return fs.promises.readFile(cachePath)
  }
  return null
}

/**
 * Helper to retrieve answer cached content
 */
export async function getCachedAnswerContent(answerBlobId: string): Promise<Buffer | null> {
  const cachePath = path.join(ANSWER_CACHE_DIR, answerBlobId)
  if (fs.existsSync(cachePath)) {
    return fs.promises.readFile(cachePath)
  }
  return null
}
