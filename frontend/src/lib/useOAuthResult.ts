import { useState, useEffect } from 'react'

export interface OAuthResultTicket {
  bff_sig: string
  expires_at: string
  nullifiers: string[]
  source: number
}

export interface OAuthResult {
  tickets: OAuthResultTicket[]
  provider: string
}

export function useOAuthResult(): {
  oauthResult: OAuthResult | null
  clearOAuthResult: () => void
} {
  const [oauthResult, setOauthResult] = useState<OAuthResult | null>(null)

  useEffect(() => {
    // 成功票券改放 URL fragment（#），不進伺服器 log / Referer；錯誤碼仍在 query。
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const params = new URLSearchParams(window.location.search)

    const rawResult = hashParams.get('oauth_result')
    if (rawResult) {
      try {
        let base64 = rawResult.replace(/-/g, '+').replace(/_/g, '/')
        while (base64.length % 4) {
          base64 += '='
        }
        const decoded = atob(base64)
        const result = JSON.parse(decoded) as OAuthResult
        if (result && Array.isArray(result.tickets)) {
          setOauthResult(result)
        }
      } catch {
        // malformed — ignore silently
      }
    }

    // 清除所有 OAuth 相關 URL 參數（含 fragment），避免重整時重複觸發
    params.delete('oauth_error')
    const newSearch = params.toString()
    window.history.replaceState(
      {},
      '',
      newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname
    )
  }, [])

  return {
    oauthResult,
    clearOAuthResult: () => setOauthResult(null),
  }
}
