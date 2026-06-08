import type { SuiClient } from '@mysten/sui/client'

/** Tier-1 credential sources: Social, World ID, Google, GitHub (aligned with auth/ticket.ts). */
export const TIER1_CREDENTIAL_SOURCES = [3, 5, 6, 7] as const

export function checkPlatformSponsorTier(sources: number[], minTier: number): boolean {
  if (minTier === 0) {
    return sources.length > 0
  }
  if (minTier === 1) {
    return sources.some((s) => (TIER1_CREDENTIAL_SOURCES as readonly number[]).includes(s))
  }
  if (minTier === 2) {
    return sources.includes(5) // World ID
  }
  return sources.length > 0
}

function normalizePackageAddress(packageId: string): string {
  let clean = packageId.toLowerCase()
  if (clean.startsWith('0x')) clean = clean.slice(2)
  return '0x' + clean.padStart(64, '0')
}

export async function resolvePassCredentialSources(
  suiClient: SuiClient,
  packageId: string,
  senderAddress: string,
  passId?: string | null
): Promise<number[]> {
  if (passId) {
    const passObj = await suiClient.getObject({
      id: passId,
      options: { showContent: true },
    })
    if (!passObj.data?.content || (passObj.data.content as { dataType?: string }).dataType !== 'moveObject') {
      return []
    }
    const fields = (passObj.data.content as { fields?: { credential_sources?: number[] } }).fields
    return fields?.credential_sources ?? []
  }

  const passType = `${normalizePackageAddress(packageId)}::survey_pass::SurveyPass`
  const owned = await suiClient.getOwnedObjects({
    owner: senderAddress,
    filter: { StructType: passType },
    options: { showContent: true },
  })

  if (!owned.data || owned.data.length === 0) {
    return []
  }

  if (owned.data.length > 1) {
    console.warn(
      `[GasStation] Wallet ${senderAddress} owns ${owned.data.length} SurveyPass objects; using first for tier check`
    )
  }

  const content = owned.data[0].data?.content
  if (!content || (content as { dataType?: string }).dataType !== 'moveObject') {
    return []
  }
  const fields = (content as { fields?: { credential_sources?: number[] } }).fields
  return fields?.credential_sources ?? []
}

export type PlatformTierCheckResult =
  | { ok: true; sources: number[] }
  | { ok: false; error: 'pass_not_found' | 'PLATFORM_SPONSOR_TIER_INSUFFICIENT'; message: string }

export async function assertPlatformSponsorTierEligible(
  suiClient: SuiClient,
  packageId: string,
  senderAddress: string,
  minTier: number,
  passId?: string | null
): Promise<PlatformTierCheckResult> {
  if (minTier <= 0) {
    return { ok: true, sources: [] }
  }

  const sources = await resolvePassCredentialSources(suiClient, packageId, senderAddress, passId)

  if (sources.length === 0) {
    return {
      ok: false,
      error: 'PLATFORM_SPONSOR_TIER_INSUFFICIENT',
      message: 'No SurveyPass found or credentials empty; insufficient for platform sponsorship',
    }
  }

  if (!checkPlatformSponsorTier(sources, minTier)) {
    return {
      ok: false,
      error: 'PLATFORM_SPONSOR_TIER_INSUFFICIENT',
      message: 'SurveyPass credentials are insufficient for platform sponsorship',
    }
  }

  return { ok: true, sources }
}
