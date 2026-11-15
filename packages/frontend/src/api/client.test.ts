import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, getAccessToken, setAccessToken } from './client'

const envelope = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: status < 400, data, error: null }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setAccessToken(null)
  })

  it('attaches the in-memory token and retries a 401 once after refresh', async () => {
    setAccessToken('old-token')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(envelope(null, 401))
      .mockResolvedValueOnce(envelope({ accessToken: 'new-token' }))
      .mockResolvedValueOnce(envelope({ status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.get('/health')).resolves.toEqual({ status: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer old-token')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh')
    expect(fetchMock.mock.calls[1][1].credentials).toBe('include')
    expect(fetchMock.mock.calls[2][1].headers.get('Authorization')).toBe('Bearer new-token')
    expect(getAccessToken()).toBe('new-token')
  })

  it('throws a typed ApiError for forbidden responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'Not allowed' },
    }), { status: 403 })))

    await expect(apiClient.get('/vehicles')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'FORBIDDEN',
    })
  })
})