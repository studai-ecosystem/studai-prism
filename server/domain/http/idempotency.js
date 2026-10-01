import { ApiError } from './errors.js'

const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/

// In-memory idempotency store (per process). PG-backed stores implement the
// same interface: reserve(key) → true when newly reserved, false when the key
// exists; get(key) → { pending } | { status, body } | null; set(key, value);
// release(key) drops a pending reservation after a failed attempt.
export function createMemoryIdempotencyStore({ ttlMs = 24 * 60 * 60 * 1000, clock = () => Date.now() } = {}) {
  const entries = new Map()
  const live = (key) => {
    const e = entries.get(key)
    if (!e) return null
    if (clock() - e.at > ttlMs) {
      entries.delete(key)
      return null
    }
    return e
  }
  return {
    async reserve(key) {
      if (live(key)) return false
      entries.set(key, { at: clock(), value: { pending: true } })
      return true
    },
    async get(key) {
      return live(key)?.value || null
    },
    async set(key, value) {
      entries.set(key, { at: clock(), value })
    },
    async release(key) {
      if (entries.get(key)?.value?.pending) entries.delete(key)
    },
  }
}

// Requires an Idempotency-Key header and replays the first completed response
// for the same (user, route, key). A duplicate that arrives while the first is
// still running gets 409 CONFLICT. Only 2xx responses are stored.
export function idempotent({ store, scope, onStoreError }) {
  return async function idempotencyMiddleware(req, res, next) {
    const key = req.get('idempotency-key')
    if (!key) return next(new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required'))
    if (!KEY_RE.test(key)) return next(new ApiError('VALIDATION_FAILED', 'Idempotency-Key is not valid'))
    const scopeKey = [scope, req.user?.id || 'anon', req.originalUrl.split('?')[0], key].join('|')
    try {
      const reserved = await store.reserve(scopeKey)
      if (!reserved) {
        const prior = await store.get(scopeKey)
        if (prior?.pending) return next(new ApiError('CONFLICT', 'This request is already being processed'))
        if (prior) {
          res.setHeader('Idempotent-Replay', 'true')
          return res.status(prior.status).json(prior.body)
        }
        await store.reserve(scopeKey)
      }
    } catch (err) {
      return next(err)
    }
    const originalJson = res.json.bind(res)
    let settled = false
    res.json = (body) => {
      settled = true
      const write = res.statusCode >= 200 && res.statusCode < 300
        ? store.set(scopeKey, { status: res.statusCode, body })
        : store.release(scopeKey)
      Promise.resolve(write).catch((err) => onStoreError?.(err, req))
      return originalJson(body)
    }
    // Responses that bypass res.json (send/end/redirect) or a client that
    // disconnects must not leave the key pending for the whole TTL.
    res.on('close', () => {
      if (!settled) Promise.resolve(store.release(scopeKey)).catch((err) => onStoreError?.(err, req))
    })
    return next()
  }
}
