import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchGitHubUserInfo } from '../src/auth/githubUserInfo.js'

describe('fetchGitHubUserInfo', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns verified primary email from emails API', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 42, email: 'unverified@github.com' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { email: 'primary@example.com', primary: true, verified: true },
          { email: 'other@example.com', primary: false, verified: false },
        ],
      })

    const result = await fetchGitHubUserInfo('gh-token')
    expect(result).toEqual({ sub: '42', email: 'primary@example.com' })
  })

  it('returns null email when no verified emails', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 99 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ email: 'fake@example.com', primary: true, verified: false }],
      })

    const result = await fetchGitHubUserInfo('gh-token')
    expect(result).toEqual({ sub: '99', email: null })
  })

  it('fails when user API returns 401', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(fetchGitHubUserInfo('bad-token')).rejects.toThrow('GitHub userinfo failed: 401')
  })
})
