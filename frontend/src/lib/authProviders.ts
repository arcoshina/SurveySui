export interface AuthProvider {
  id: string
  label: string
}

// Social OAuth 驗證來源（需要已連接 Sui 錢包，BFF 簽 ticket 後 Pass 鑄到該錢包）
export const DIRECT_OAUTH_PROVIDERS: AuthProvider[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
]
