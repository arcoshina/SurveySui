export interface OAuthProviderConfig {
  authUrl: string
  tokenUrl: string
  scope: string
  pkce: boolean
  /** true = GitHub only：只能用作 Social credential */
  socialOnly?: boolean
  /** true = Apple：id_token email 只在首次授權存在，之後為 null */
  emailUnreliable?: boolean
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email',
    pkce: true,
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    pkce: false,
    socialOnly: true,
  },
}

/** 取得 provider 的 client_id 環境變數 */
export function getClientId(provider: string): string {
  const key = `${provider.toUpperCase()}_OAUTH_CLIENT_ID`
  const val = process.env[key]
  if (!val) throw new Error(`${key} is not set`)
  return val
}

/** 取得 provider 的 client_secret 環境變數 */
export function getClientSecret(provider: string): string {
  const key = `${provider.toUpperCase()}_OAUTH_CLIENT_SECRET`
  const val = process.env[key]
  if (!val) throw new Error(`${key} is not set`)
  return val
}
