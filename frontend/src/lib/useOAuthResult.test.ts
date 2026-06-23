import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useOAuthResult } from './useOAuthResult'

describe('useOAuthResult Hook', () => {
  const originalLocation = window.location
  const originalHistory = window.history

  beforeEach(() => {
    // Mock window.location
    delete (window as any).location
    window.location = {
      ...originalLocation,
      search: '',
      hash: '',
      pathname: '/auth',
    } as any

    // Mock window.history.replaceState
    window.history.replaceState = vi.fn()
  })

  afterEach(() => {
    (window as any).location = originalLocation
    window.history.replaceState = originalHistory.replaceState
  })

  it('should parse raw ticket from oauth_result fragment (even without padding)', () => {
    const ticketData = {
      bff_sig: 'abcd',
      expires_at: '123456',
      nullifiers: ['null1', 'null2'],
      source: 3,
    }
    const oauthResultData = {
      tickets: [ticketData],
      provider: 'google',
    }

    // Convert to unpadded base64url
    const jsonStr = JSON.stringify(oauthResultData)
    const base64 = btoa(jsonStr)
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

    window.location.hash = `#oauth_result=${base64url}`

    const { result } = renderHook(() => useOAuthResult())

    expect(result.current.oauthResult).toEqual(oauthResultData)
    expect(window.history.replaceState).toHaveBeenCalled()
  })

  it('should return null when oauth_result is missing', () => {
    window.location.hash = ''
    const { result } = renderHook(() => useOAuthResult())
    expect(result.current.oauthResult).toBeNull()
  })

  it('should ignore malformed JSON silently', () => {
    window.location.hash = '#oauth_result=not_a_valid_json_base64url'
    const { result } = renderHook(() => useOAuthResult())
    expect(result.current.oauthResult).toBeNull()
  })

  it('should NOT parse oauth_result from query string (must be fragment only)', () => {
    const oauthResultData = { tickets: [{ bff_sig: 'x', expires_at: '1', nullifiers: [], source: 3 }], provider: 'google' }
    const base64url = btoa(JSON.stringify(oauthResultData))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    window.location.search = `?oauth_result=${base64url}`
    const { result } = renderHook(() => useOAuthResult())
    expect(result.current.oauthResult).toBeNull()
  })
})
