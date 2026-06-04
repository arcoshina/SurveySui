import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const DATA_DIR = path.join(process.cwd(), 'data', 'ipfs_mock')

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

/**
 * Computes a deterministic mock CID starting with 'bafy' based on the file content's sha256 hash.
 */
export function computeMockCid(data: Buffer): string {
  const hash = crypto.createHash('sha256').update(data).digest('hex')
  return `bafy${hash}`
}

/**
 * Saves binary data to the local mock IPFS directory and returns its computed CID.
 */
export async function saveToIpfsMock(data: Buffer): Promise<string> {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  const cid = computeMockCid(data)
  const filePath = path.join(DATA_DIR, cid)
  await fs.promises.writeFile(filePath, data)
  return cid
}

/**
 * Retrieves binary data from the local mock IPFS directory.
 */
export async function getFromIpfsMock(cid: string): Promise<Buffer> {
  const filePath = path.join(DATA_DIR, cid)
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found in IPFS mock: ${cid}`)
  }
  return fs.promises.readFile(filePath)
}

/**
 * Downloads a blob from Walrus aggregator network.
 */
export async function downloadFromWalrus(blobId: string): Promise<Buffer> {
  const aggregatorUrl = process.env.WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space'
  const url = `${aggregatorUrl}/v1/blobs/${blobId}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch blob from Walrus (${blobId}): ${response.statusText}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
