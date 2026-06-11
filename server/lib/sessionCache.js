// Pluggable cache for live assessment sessions (the hot, per-turn chat state).
//
// Every session is also durably persisted via store.js, so this layer is a
// performance cache. The default in-memory Map only works for a single process.
// Set REDIS_URL to share the cache across instances (horizontal scaling /
// rolling deploys) without losing live sessions.
//
// All methods are async so callers don't need to change when switching backends.

import logger from './logger.js'

const TTL_SECONDS = Number(process.env.SESSION_CACHE_TTL_SECONDS || 60 * 60) // 1h

function memoryBackend() {
  const map = new Map()
  return {
    name: 'memory',
    async get(id) { return map.get(id) || null },
    async set(id, val) { map.set(id, val); return val },
    async delete(id) { return map.delete(id) },
    async has(id) { return map.has(id) },
  }
}

async function redisBackend(url) {
  const { default: Redis } = await import('ioredis')
  const redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 })
  redis.on('error', (err) => logger.error('redis_error', { error: err?.message }))
  redis.on('connect', () => logger.info('redis_connected'))
  const key = (id) => `prism:session:${id}`
  return {
    name: 'redis',
    async get(id) {
      const v = await redis.get(key(id))
      return v ? JSON.parse(v) : null
    },
    async set(id, val) {
      await redis.set(key(id), JSON.stringify(val), 'EX', TTL_SECONDS)
      return val
    },
    async delete(id) {
      return (await redis.del(key(id))) > 0
    },
    async has(id) {
      return (await redis.exists(key(id))) === 1
    },
  }
}

let backend = memoryBackend()

if (process.env.REDIS_URL) {
  try {
    backend = await redisBackend(process.env.REDIS_URL)
    logger.info('session_cache_backend', { backend: 'redis' })
  } catch (err) {
    logger.warn('session_cache_redis_unavailable', {
      error: err?.message,
      detail: 'Falling back to in-memory cache. Install ioredis and check REDIS_URL.',
    })
    backend = memoryBackend()
  }
} else {
  logger.info('session_cache_backend', { backend: 'memory' })
}

export const sessionCache = backend
export const sessionCacheBackend = backend.name
