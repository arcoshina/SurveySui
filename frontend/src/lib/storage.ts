const getEnvVar = (key: string, fallback: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env[key] || fallback
    }
  } catch {}
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key] || fallback
    }
  } catch {}
  return fallback
}

const WALRUS_PUBLISHER = getEnvVar('VITE_WALRUS_PUBLISHER_URL', 'https://publisher.walrus-testnet.walrus.space');
const WALRUS_AGGREGATOR = getEnvVar('VITE_WALRUS_AGGREGATOR_URL', 'https://aggregator.walrus-testnet.walrus.space');
const BFF_URL = getEnvVar('VITE_BFF_URL', 'http://localhost:3100');

/**
 * How many epochs to store a Walrus blob for. Should cover the survey's active
 * life plus the purge grace window so large answers stay readable until purge.
 * Env-tunable per deployment (mainnet epoch = 14 days, testnet = 1 day; note
 * Walrus caps storage at `max_epochs_ahead`, currently 53).
 */
const WALRUS_STORAGE_EPOCHS = Number(getEnvVar('VITE_WALRUS_STORAGE_EPOCHS', '5')) || 5;

export interface UploadResult {
  blobId: string;
  provider: 'walrus' | 'ipfs';
}

/**
 * Upload binary data to decentralized storage.
 * Try Walrus first, if it fails or times out, fall back to BFF IPFS proxy.
 */
export async function uploadToDecentralizedStorage(
  data: Uint8Array,
  options?: { signal?: AbortSignal }
): Promise<UploadResult> {
  // 1. Try Walrus
  try {
    const res = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=${WALRUS_STORAGE_EPOCHS}`, {
      method: 'PUT',
      body: data as any,
      signal: options?.signal,
    });
    if (res.ok) {
      const json = await res.json();
      const blobId = json.newlyCreated?.blobObject?.blobId || json.alreadyCertified?.blobId;
      if (blobId) {
        return { blobId, provider: 'walrus' };
      }
    }
  } catch (e) {
    console.warn('[Storage] Walrus upload failed, attempting fallback...', e);
  }

  // 2. Fallback to BFF IPFS proxy
  const bffRes = await fetch(`${BFF_URL}/api/storage/ipfs/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: data as any,
    signal: options?.signal,
  });

  if (!bffRes.ok) {
    throw new Error(`Failed to upload to IPFS: ${bffRes.statusText}`);
  }

  const json = await bffRes.json();
  if (!json.cid) {
    throw new Error('IPFS proxy did not return a CID');
  }

  return { blobId: json.cid, provider: 'ipfs' };
}

/**
 * Download binary data from decentralized storage.
 * It detects if the blobId looks like an IPFS CID or Walrus blob ID.
 */
export async function downloadFromDecentralizedStorage(
  blobId: string,
  options?: { signal?: AbortSignal }
): Promise<Uint8Array> {
  const isIpfs = blobId.startsWith('Qm') || blobId.startsWith('bafy');
  
  const url = isIpfs 
    ? `${BFF_URL}/api/storage/ipfs/download/${blobId}`
    : `${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`;

  const res = await fetch(url, { signal: options?.signal });
  if (!res.ok) {
    if (!isIpfs) {
      const fallbackUrl = `${BFF_URL}/api/storage/walrus/download/${blobId}`;
      const fallbackRes = await fetch(fallbackUrl, { signal: options?.signal });
      if (fallbackRes.ok) {
        const buf = await fallbackRes.arrayBuffer();
        return new Uint8Array(buf);
      }
    }
    throw new Error(`Failed to download blob ${blobId}: ${res.statusText}`);
  }

  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
