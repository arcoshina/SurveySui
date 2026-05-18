export interface BuildGoogleAuthUrlInput {
  clientId: string
  redirectUri: string
  nonce: string
  scope?: string
  responseType?: string
}

export function buildGoogleAuthUrl(input: BuildGoogleAuthUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    response_type: input.responseType ?? 'id_token',
    scope: input.scope ?? 'openid email profile',
    redirect_uri: input.redirectUri,
    nonce: input.nonce,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}
