// Readiness probe (PROD-READY Phase 1S, audit 2026-10-10, N12).
// `/api/health` stays a pure liveness check (the process answers HTTP); a pod
// whose database is unreachable is still alive and must not be restarted for
// it. `/api/ready` additionally checks the database with a short timeout and
// reports "draining" once a graceful shutdown has begun, so a load balancer
// stops sending new requests to it.
import { isDbConfigured as defaultIsDbConfigured, query as defaultQuery } from '../db/pool.js'

const READY_TIMEOUT_MS = 2000

function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), ms) }),
  ]).finally(() => clearTimeout(timer))
}

export function createReadinessHandler({
  isDbConfigured = defaultIsDbConfigured,
  query = defaultQuery,
  draining = () => false,
  timeoutMs = READY_TIMEOUT_MS,
} = {}) {
  return async function readiness(_req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (draining()) return res.status(503).json({ status: 'draining', checks: {} })
    if (!isDbConfigured()) return res.json({ status: 'ready', checks: { database: 'not_configured' } })
    try {
      await withTimeout(Promise.resolve().then(() => query('SELECT 1')), timeoutMs)
      return res.json({ status: 'ready', checks: { database: 'ok' } })
    } catch (err) {
      // No error text: the probe is unauthenticated.
      return res.status(503).json({ status: 'not_ready', checks: { database: err?.code === 'TIMEOUT' ? 'timeout' : 'unavailable' } })
    }
  }
}
