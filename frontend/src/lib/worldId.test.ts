import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchWorldIdSignRequest, submitWorldIdProof, WorldIdError } from './worldId'

const OWNER = '0xa11ce00000000000000000000000000000000000000000000000000000000000'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('frontend lib/worldId', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('fetchWorldIdSignRequest', () => {
    it('returns the app_id/action/rp_context from the BFF', async () => {
      const rp_context = { rp_id: 'rp_1', nonce: 'n', created_at: 1, expires_at: 2, signature: '0xsig' }
      const fetchMock = vi.fn(async () =>
        jsonResponse({ app_id: 'app_1', action: 'verify-account', rp_context })
      )
      vi.stubGlobal('fetch', fetchMock)

      const cfg = await fetchWorldIdSignRequest()

      expect(fetchMock).toHaveBeenCalledWith('/auth/worldid/sign-request', { method: 'POST' })
      expect(cfg).toEqual({ app_id: 'app_1', action: 'verify-account', rp_context })
    })

    it('throws WorldIdError("config") when the BFF returns non-2xx', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'World ID not configured' }, 503)))
      await expect(fetchWorldIdSignRequest()).rejects.toMatchObject({ code: 'config' })
    })
  })

  describe('submitWorldIdProof', () => {
    const proof = { protocol_version: '4.0', responses: [] } as any

    it('posts owner+payload and returns the ticket on success', async () => {
      const ticket = { bff_sig: '0xsig', expires_at: '123', nullifiers: ['0xnull'], source: 5 }
      const fetchMock = vi.fn(async () => jsonResponse(ticket))
      vi.stubGlobal('fetch', fetchMock)

      const result = await submitWorldIdProof(OWNER, proof)

      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/worldid/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ owner: OWNER, payload: proof }),
        })
      )
      expect(result).toEqual(ticket)
      expect(result.source).toBe(5)
    })

    it('throws WorldIdError("orb_required") on HTTP 403', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Orb verification required' }, 403)))
      await expect(submitWorldIdProof(OWNER, proof)).rejects.toMatchObject({
        code: 'orb_required',
      })
      await expect(submitWorldIdProof(OWNER, proof)).rejects.toBeInstanceOf(WorldIdError)
    })

    it('throws WorldIdError("failed") on other errors (e.g. 401)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'World verify failed' }, 401)))
      await expect(submitWorldIdProof(OWNER, proof)).rejects.toMatchObject({ code: 'failed' })
    })
  })
})
