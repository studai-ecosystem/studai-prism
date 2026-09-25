// src/api/client.js — the ONLY place in the app that calls fetch (spec §32.1).
// Injects auth, workspace, request id and idempotency headers; parses the
// /api/v1 envelope (or a legacy JSON body); normalises every failure into an
// ApiError; retries only safe requests (or mutations that carry an
// idempotency key).
import { getToken, clearUser } from '../lib/session.js'

export class ApiError extends Error {
  constructor({ status = 0, code = 'INTERNAL', message = 'Something went wrong.', requestId = null, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD'])
const RETRYABLE_STATUS = new Set([429, 502, 503, 504])

const config = {
  baseUrl: '',
  getWorkspaceId: () => null,
  onUnauthenticated: defaultOnUnauthenticated,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  maxRetries: 2,
}

function defaultOnUnauthenticated() {
  clearUser()
  if (typeof window === 'undefined') return
  const here = `${window.location.pathname}${window.location.search}`
  if (window.location.pathname.startsWith('/login')) return
  window.location.assign(`/login?next=${encodeURIComponent(here)}`)
}

export function configureClient(next) {
  Object.assign(config, next)
}

export function newRequestId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `req-${Date.now().toString(36)}-${performance.now().toString(36).replace('.', '')}`
}

export function newIdempotencyKey(prefix = 'idem') {
  return `${prefix}-${newRequestId()}`
}

function buildUrl(path, query) {
  const url = `${config.baseUrl}${path}`
  if (!query) return url
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `${url}?${s}` : url
}

async function parseBody(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function errorFrom(res, body, requestId, defaultErrorMessage) {
  const env = body && typeof body.error === 'object' && body.error !== null ? body.error : null
  const fallbackCode = res.status === 401 ? 'UNAUTHENTICATED'
    : res.status === 403 ? 'FORBIDDEN'
      : res.status === 404 ? 'NOT_FOUND'
        : res.status === 409 ? 'CONFLICT'
          : res.status === 422 ? 'VALIDATION_FAILED'
            : res.status === 429 ? 'RATE_LIMITED'
              : 'INTERNAL'
  return new ApiError({
    status: res.status,
    code: env?.code || body?.code || fallbackCode,
    message: env?.message || (typeof body?.error === 'string' ? body.error : null) || defaultErrorMessage || 'Something went wrong. Please try again.',
    requestId: env?.requestId || res.headers.get('x-request-id') || requestId,
    details: env?.details,
  })
}

/**
 * request(path, options) → { data, meta, status } for /api/v1 envelopes, or
 * { data: <raw body>, status } when `legacy: true`.
 */
export async function request(path, {
  method = 'GET',
  body,
  query,
  headers: extraHeaders,
  workspace = true,
  auth = true,
  idempotencyKey,
  ifMatch,
  legacy = false,
  schema,
  signal,
  on401 = 'redirect',
  defaultErrorMessage,
} = {}) {
  const verb = method.toUpperCase()
  const requestId = newRequestId()
  const headers = { Accept: 'application/json', 'X-Request-Id': requestId, ...extraHeaders }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? getToken() : null
  if (token) headers.Authorization = `Bearer ${token}`
  const workspaceId = workspace ? config.getWorkspaceId() : null
  if (workspaceId) headers['X-Prism-Workspace'] = workspaceId
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  if (ifMatch !== undefined && ifMatch !== null) headers['If-Match'] = String(ifMatch)

  const retryable = SAFE_METHODS.has(verb) || Boolean(idempotencyKey)
  const url = buildUrl(path, query)
  let attempt = 0

  for (;;) {
    let res
    try {
      res = await fetch(url, { method: verb, headers, body: body === undefined ? undefined : JSON.stringify(body), signal })
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      if (retryable && attempt < config.maxRetries) {
        attempt += 1
        await config.sleep(150 * 2 ** (attempt - 1))
        continue
      }
      throw new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'You appear to be offline. Check your connection and try again.', requestId })
    }

    if (retryable && RETRYABLE_STATUS.has(res.status) && attempt < config.maxRetries) {
      attempt += 1
      await config.sleep(150 * 2 ** (attempt - 1))
      continue
    }

    const parsed = await parseBody(res)
    if (!res.ok) {
      const error = errorFrom(res, parsed, requestId, defaultErrorMessage)
      if (res.status === 401 && auth && on401 === 'redirect') config.onUnauthenticated(error)
      throw error
    }

    let data
    let meta
    if (legacy) {
      data = parsed
    } else {
      if (!parsed || !('data' in parsed)) {
        throw new ApiError({ status: res.status, code: 'SCHEMA_MISMATCH', message: 'The server sent an unexpected response.', requestId })
      }
      data = parsed.data
      meta = parsed.meta
    }
    if (schema) {
      const result = schema.safeParse(data)
      if (!result.success) {
        throw new ApiError({ status: res.status, code: 'SCHEMA_MISMATCH', message: 'The server sent an unexpected response.', requestId, details: result.error.flatten() })
      }
      data = result.data
    }
    return { data, meta, status: res.status }
  }
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
}
