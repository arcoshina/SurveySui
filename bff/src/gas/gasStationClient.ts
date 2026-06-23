import {
  canonicalJsonStringify,
  generateGasStationNonce,
  signGasStationBody,
} from '@surveysui/gas-station-core'
import { getGasStationFetch, hasGasStationBinding } from './gasStationBinding.js'

// Service Binding 模式下 URL host 僅為佔位（內部 RPC 只看 path）；
// 公網 HTTP 模式則用 GAS_STATION_URL 當 base。
const SERVICE_BINDING_BASE = 'https://gas-station'

/** 決定傳輸 base URL：優先 Service Binding（佔位 host），否則回退 GAS_STATION_URL。 */
function resolveGasStationBase(): string | null {
  if (hasGasStationBinding()) return SERVICE_BINDING_BASE
  return process.env.GAS_STATION_URL ?? null
}

export interface GasStationSponsorRequest {
  txBytes: string
  senderAddress: string
  sponsorAddress: string
}

export interface GasStationSponsorSuccess {
  sponsoredTxBytes: string
  sponsorSignature: string
}

export type GasStationMode = 'local' | 'do'

export function getGasStationMode(): GasStationMode {
  const mode = process.env.GAS_STATION_MODE?.toLowerCase()
  return mode === 'do' ? 'do' : 'local'
}

export async function forwardSponsorToGasStation(
  request: GasStationSponsorRequest
): Promise<{ ok: true; data: GasStationSponsorSuccess } | { ok: false; status: number; error: string; message: string }> {
  const baseUrl = resolveGasStationBase()
  if (!baseUrl) {
    return {
      ok: false,
      status: 503,
      error: 'gas_station_unconfigured',
      message: 'GAS_STATION_MODE=do requires GAS_STATION service binding or GAS_STATION_URL',
    }
  }

  const secret = process.env.GAS_STATION_SHARED_SECRET?.trim()
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: 'gas_station_unconfigured',
      message: 'GAS_STATION_MODE=do requires GAS_STATION_SHARED_SECRET',
    }
  }

  const url = new URL('/sponsor', baseUrl.replace(/\/$/, ''))
  const bodyJson = canonicalJsonStringify(request)
  const timestamp = String(Date.now())
  const nonce = generateGasStationNonce()
  const signature = signGasStationBody(secret, timestamp, nonce, bodyJson)

  const res = await getGasStationFetch()(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gas-station-timestamp': timestamp,
      'x-gas-station-nonce': nonce,
      'x-gas-station-signature': signature,
    },
    body: bodyJson,
  })

  const body = (await res.json().catch(() => ({}))) as Record<string, string>
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: body.error ?? 'sponsor_failed',
      message: body.message ?? `Gas station returned ${res.status}`,
    }
  }

  return {
    ok: true,
    data: {
      sponsoredTxBytes: body.sponsoredTxBytes,
      sponsorSignature: body.sponsorSignature,
    },
  }
}

/**
 * Best-effort release of spent gas coins on the Gas Station DO after broadcast,
 * so the per-coin lock is freed immediately instead of waiting for its TTL.
 * Failures are non-fatal: the DO still releases on TTL expiry.
 */
export async function releaseGasStationCoins(coinObjectIds: string[]): Promise<void> {
  if (coinObjectIds.length === 0) return
  const baseUrl = resolveGasStationBase()
  const secret = process.env.GAS_STATION_SHARED_SECRET?.trim()
  if (!baseUrl || !secret) return

  const url = new URL('/release', baseUrl.replace(/\/$/, ''))
  const bodyJson = canonicalJsonStringify({ coinObjectIds })
  const timestamp = String(Date.now())
  const nonce = generateGasStationNonce()
  const signature = signGasStationBody(secret, timestamp, nonce, bodyJson)

  await getGasStationFetch()(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gas-station-timestamp': timestamp,
      'x-gas-station-nonce': nonce,
      'x-gas-station-signature': signature,
    },
    body: bodyJson,
  })
}

export async function fetchGasStationHealth(): Promise<Record<string, unknown> | null> {
  const baseUrl = resolveGasStationBase()
  if (!baseUrl) return null
  try {
    const res = await getGasStationFetch()(new URL('/health', baseUrl.replace(/\/$/, '')))
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}
