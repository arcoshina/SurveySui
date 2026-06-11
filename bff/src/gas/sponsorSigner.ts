import {
  createSponsorSignerFromEnv,
  type SponsorSigner,
} from '@surveysui/gas-station-core'

export type { SponsorSigner }

export function loadSponsorSigner(): SponsorSigner | null {
  return createSponsorSignerFromEnv(process.env as Record<string, string | undefined>)
}

export function requireSponsorSigner(): SponsorSigner {
  const signer = loadSponsorSigner()
  if (!signer) {
    throw new Error(
      'Gas sponsor not configured: set GAS_SPONSOR_PRIV_1, GAS_SPONSOR_PRIV_2, and GAS_SPONSOR_PUBKEY_3'
    )
  }
  return signer
}
