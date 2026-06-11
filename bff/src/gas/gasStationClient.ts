import {
  canonicalJsonStringify,
  signGasStationBody,
  type SponsorPipelineContext,
} from '@surveysui/gas-station-core'

export interface GasStationSponsorRequest {
  txBytes: string
  senderAddress: string
  sponsorAddress: string
  requestId?: string
  pipelineContext: SponsorPipelineContext
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
  const baseUrl = process.env.GAS_STATION_URL
  if (!baseUrl) {
    return {
      ok: false,
      status: 503,
      error: 'gas_station_unconfigured',
      message: 'GAS_STATION_MODE=do requires GAS_STATION_URL',
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
  const signature = signGasStationBody(secret, timestamp, bodyJson)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-gas-station-timestamp': timestamp,
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

export async function fetchGasStationHealth(): Promise<Record<string, unknown> | null> {
  const baseUrl = process.env.GAS_STATION_URL
  if (!baseUrl) return null
  try {
    const res = await fetch(new URL('/health', baseUrl.replace(/\/$/, '')))
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}
