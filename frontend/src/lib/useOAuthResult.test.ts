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
      pathname: '/auth',
    } as any

    // Mock window.history.replaceState
    window.history.replaceState = vi.fn()
  })

  afterEach(() => {
    (window as any).location = originalLocation
    window.history.replaceState = originalHistory.replaceState
  })

  it('should parse raw ticket from oauth_result parameter (even without padding)', () => {
    const ticketData = {
      bff_sig: 'abcd',
      expires_at: '123456',
      nullifiers: ['null1', 'null2'],
      source: 3,
      provider: 'google',
    }
    
    // Convert to unpadded base64url
    const jsonStr = JSON.stringify(ticketData)
    const base64 = btoa(jsonStr)
    const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

    window.location.search = `?oauth_result=${base64url}`

    const { result } = renderHook(() => useOAuthResult())

    expect(result.current.oauthTicket).toEqual(ticketData)
    expect(window.history.replaceState).toHaveBeenCalled()
  })

  it('should return null when oauth_result is missing', () => {
    window.location.search = ''
    const { result } = renderHook(() => useOAuthResult())
    expect(result.current.oauthTicket).toBeNull()
  })

  it('should ignore malformed JSON silently', () => {
    window.location.search = '?oauth_result=not_a_valid_json_base64url'
    const { result } = renderHook(() => useOAuthResult())
    expect(result.current.oauthTicket).toBeNull()
  })
})
