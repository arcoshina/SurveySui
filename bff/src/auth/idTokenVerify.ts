import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs')
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])

let googleJwks: JWTVerifyGetKey | null = null

function getGoogleJwks(): JWTVerifyGetKey {
  if (!googleJwks) {
    googleJwks = createRemoteJWKSet(GOOGLE_JWKS_URL)
  }
  return googleJwks
}

export type VerifiedGoogleIdentity = {
  sub: string
  email: string | null
}

/** Cryptographically verify Google id_token via JWKS; email only when email_verified. */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string
): Promise<VerifiedGoogleIdentity> {
  const { payload } = await jwtVerify(idToken, getGoogleJwks(), {
    audience: clientId,
    issuer: [...GOOGLE_ISSUERS],
  })

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Google id_token missing sub')
  }

  let email: string | null = null
  if (payload.email_verified === true && typeof payload.email === 'string' && payload.email) {
    email = payload.email
  }

  return { sub: payload.sub, email }
}

/** Test-only: reset JWKS cache between tests. */
export function __resetGoogleJwksCache(): void {
  googleJwks = null
}
