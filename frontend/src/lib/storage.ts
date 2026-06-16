const WALRUS_PUBLISHER =
  import.meta.env.VITE_WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space'
const WALRUS_AGGREGATOR =
  import.meta.env.VITE_WALRUS_AGGREGATOR_URL ?? 'https://aggregator.walrus-testnet.walrus.space'

/**
 * How many epochs to store a Walrus blob for. Should cover the survey's active
 * life plus the purge grace window so large answers stay readable until purge.
 * Env-tunable per deployment (mainnet epoch = 14 days, testnet = 1 day; note
 * Walrus caps storage at `max_epochs_ahead`, currently 53).
 */
const WALRUS_STORAGE_EPOCHS = Number(import.meta.env.VITE_WALRUS_STORAGE_EPOCHS ?? '5') || 5

export interface UploadResult {
  blobId: string
  /** Sui object ID of the Walrus blob; required for on-chain extend. */
  blobObjectId?: string
  provider: 'walrus' | 'ipfs'
}

function parseWalrusBlobObjectId(json: Record<string, unknown>): string | undefined {
  const newlyCreated = json.newlyCreated as Record<string, unknown> | undefined
  const blobObject = newlyCreated?.blobObject as Record<string, unknown> | undefined
  if (!blobObject) return undefined
  const id = blobObject.id ?? blobObject.objectId
  return typeof id === 'string' ? id : undefined
}

/**
 * Upload binary data to Walrus（testnet 採 Walrus-only；BFF storage 層已移除）。
 * Walrus 失敗即拋錯，不再 fallback 到 BFF IPFS proxy。
 */
export async function uploadToDecentralizedStorage(
  data: Uint8Array,
  options?: { signal?: AbortSignal }
): Promise<UploadResult> {
  const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${WALRUS_STORAGE_EPOCHS}`, {
    method: 'PUT',
    body: data as any,
    signal: options?.signal,
  })
  if (!res.ok) {
    throw new Error(`Walrus upload failed: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as Record<string, unknown>
  const blobId =
    (json.newlyCreated as { blobObject?: { blobId?: string } } | undefined)?.blobObject?.blobId ||
    (json.alreadyCertified as { blobId?: string } | undefined)?.blobId
  const blobObjectId = parseWalrusBlobObjectId(json)
  if (!blobId) {
    throw new Error('Walrus upload did not return a blobId')
  }
  return { blobId, blobObjectId, provider: 'walrus' }
}

/**
 * Download binary data from Walrus aggregator（直連；零信任完整性驗證由呼叫端以鏈上
 * content_hash 比對，見 SurveyPage / crypto.sha256）。
 */
export async function downloadFromDecentralizedStorage(
  blobId: string,
  options?: { signal?: AbortSignal }
): Promise<Uint8Array> {
  const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`, { signal: options?.signal })
  if (!res.ok) {
    throw new Error(`Failed to download blob ${blobId}: ${res.statusText}`)
  }
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}
