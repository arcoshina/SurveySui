import { useState, useEffect } from 'react'

export interface OAuthTicket {
  bff_sig: string
  expires_at: string
  nullifiers: string[]
  source: number
  provider: string
}

export function useOAuthResult(): {
  oauthTicket: OAuthTicket | null
  clearOAuthResult: () => void
} {
  const [oauthTicket, setOauthTicket] = useState<OAuthTicket | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // 標準 Social OAuth callback
    const rawTicket = params.get('oauth_result')
    if (rawTicket) {
      try {
        let base64 = rawTicket.replace(/-/g, '+').replace(/_/g, '/')
        while (base64.length % 4) {
          base64 += '='
        }
        const decoded = atob(base64)
        const ticket = JSON.parse(decoded) as OAuthTicket
        setOauthTicket(ticket)
      } catch {
        // malformed — ignore silently
      }
    }

    // 清除所有 OAuth 相關 URL 參數，避免重整時重複觸發
    params.delete('oauth_result')
    params.delete('oauth_error')
    const newSearch = params.toString()
    window.history.replaceState(
      {},
      '',
      newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname
    )
  }, [])

  return {
    oauthTicket,
    clearOAuthResult: () => setOauthTicket(null),
  }
}
