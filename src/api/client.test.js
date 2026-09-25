import { describe, it, expect, vi, beforeEach } from 'vitest'
import { request, api, ApiError, configureClient, newIdempotencyKey } from './client.js'
import { z } from 'zod'

function jsonResponse(status, body, headers = {}) {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

let onUnauthenticated
beforeEach(() => {
  onUnauthenticated = vi.fn()
  configureClient({ getWorkspaceId: () => 'ws-1', onUnauthenticated, sleep: () => Promise.resolve(), maxRetries: 2 })
  localStorage.setItem('prism_token', 'tok-123')
  localStorage.setItem('prism_user', JSON.stringify({ id: 'u1' }))
})

describe('api client', () => {
  it('injects auth, workspace and request-id headers and unwraps the envelope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { data: { a: 1 }, meta: { limit: 25 } }))
    const out = await api.get('/api/v1/me', { query: { limit: 25, empty: '' } })
    expect(out).toEqual({ data: { a: 1 }, meta: { limit: 25 }, status: 200 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/me?limit=25')
    expect(init.headers.Authorization).toBe('Bearer tok-123')
    expect(init.headers['X-Prism-Workspace']).toBe('ws-1')
    expect(init.headers['X-Request-Id']).toMatch(/.{8,}/)
    expect(init.body).toBeUndefined()
  })

  it('omits the workspace header when workspace:false and auth when auth:false', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { data: 1 }))
    await api.get('/api/v1/health', { workspace: false, auth: false })
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers['X-Prism-Workspace']).toBeUndefined()
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('normalises envelope errors into ApiError with code and request id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(403, { error: { code: 'ENTITLEMENT_EXPIRED', message: 'Expired', requestId: 'r-1' } }))
    const err = await api.get('/api/v1/x').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 403, code: 'ENTITLEMENT_EXPIRED', requestId: 'r-1' })
  })

  it('maps a bare 403 to FORBIDDEN and legacy string errors to the message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(403, { error: 'Nope' }))
    const err = await api.get('/api/legacy', { legacy: true }).catch((e) => e)
    expect(err).toMatchObject({ code: 'FORBIDDEN', message: 'Nope' })
  })

  it('401 triggers the unauthenticated handler (sign-out + redirect) unless on401 is "throw"', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in' } }))
    await expect(api.get('/api/v1/me')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    expect(onUnauthenticated).toHaveBeenCalledTimes(1)
    await expect(api.get('/api/v1/me', { on401: 'throw' })).rejects.toMatchObject({ status: 401 })
    expect(onUnauthenticated).toHaveBeenCalledTimes(1)
  })

  it('network failure → NETWORK_ERROR after retrying a GET twice', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.get('/api/v1/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries a GET on 503 and succeeds', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(503, { error: { code: 'CAMPUS_STORE_UNAVAILABLE' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }))
    await expect(api.get('/api/v1/me')).resolves.toMatchObject({ data: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never retries a mutation without an idempotency key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.post('/api/v1/thing', { a: 1 })).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends Idempotency-Key when declared and may retry that mutation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(201, { data: { id: 'x' } }))
    const key = newIdempotencyKey('start')
    const out = await api.post('/api/v1/thing', { a: 1 }, { idempotencyKey: key })
    expect(out.status).toBe(201)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const init = fetchMock.mock.calls[1][1]
    expect(init.headers['Idempotency-Key']).toBe(key)
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ a: 1 })
  })

  it('sends If-Match for versioned writes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { data: {} }))
    await api.patch('/api/v1/a', { x: 1 }, { ifMatch: 3 })
    expect(fetchMock.mock.calls[0][1].headers['If-Match']).toBe('3')
  })

  it('schema mismatch → SCHEMA_MISMATCH error, never partial data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { data: { count: 'x' } }))
    await expect(api.get('/api/v1/a', { schema: z.object({ count: z.number() }) })).rejects.toMatchObject({ code: 'SCHEMA_MISMATCH' })
  })

  it('a non-envelope body on a v1 call is a SCHEMA_MISMATCH', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { status: 'ok' }))
    await expect(request('/api/v1/a')).rejects.toMatchObject({ code: 'SCHEMA_MISMATCH' })
  })

  it('legacy:true returns the raw body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { canPurchase: true }))
    await expect(api.get('/api/payment/licence', { legacy: true })).resolves.toMatchObject({ data: { canPurchase: true } })
  })
})
