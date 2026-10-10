// PostgreSQL connection pool for Prism v2 (MASA-2) telemetry & psychometrics.
//
// This is a SEPARATE store from the v1 JSON file store (server/lib/store.js).
// v1 behavior must stay reproducible, so Postgres is OPTIONAL: when no
// DATABASE_URL is configured the pool is null and every telemetry call becomes
// a silent no-op. The live v1 app therefore runs byte-identical with the v2
// telemetry flag off (the Phase 0 contract: zero behavior change).
//
// Configuration (server/.env):
//   DATABASE_URL        postgres://user:pass@host:5432/dbname
//   PGSSLMODE=require   set when the provider needs TLS (e.g. Azure Postgres)

import pg from 'pg'
import { readFileSync } from 'fs'
import logger from '../lib/logger.js'

let _pool = null
let _initialised = false
let _sessionLockPool = null
let _tlsWarned = false

// TLS to PostgreSQL (PROD-READY Phase 1S, audit 2026-10-10, N13), following
// libpq's sslmode semantics (PGSSLMODE; a `sslmode=require` in DATABASE_URL
// counts as before):
//   verify-full  certificate chain and host name verified — against the CA
//                bundle in PGSSLROOTCERT, or Node's public trust store
//   verify-ca    certificate chain verified, host name not checked
//   require      encrypted; verified like verify-ca when PGSSLROOTCERT names a
//                CA bundle (libpq does the same). Without a bundle it is NOT
//                verified — the previous behaviour, kept so an existing
//                deployment keeps connecting — and a warning is logged.
// For Amazon RDS the bundle is AWS's public RDS CA bundle: the operator
// supplies the file, sets PGSSLROOTCERT, then PGSSLMODE=verify-full.
export function sslOptions(env = process.env, readCa = (path) => readFileSync(path, 'utf8')) {
  const envMode = String(env.PGSSLMODE || '').toLowerCase()
  const mode = envMode || (/\bsslmode=require\b/.test(env.DATABASE_URL || '') ? 'require' : '')
  if (!['require', 'verify-ca', 'verify-full'].includes(mode)) return { ssl: undefined, verified: false, mode: mode || 'default' }
  const caPath = env.PGSSLROOTCERT || ''
  const ssl = { rejectUnauthorized: true }
  if (caPath) ssl.ca = readCa(caPath)
  else if (mode === 'require') return { ssl: { rejectUnauthorized: false }, verified: false, mode }
  if (mode !== 'verify-full') ssl.checkServerIdentity = () => undefined
  return { ssl, verified: true, mode }
}

function connectionOptions() {
  const { ssl, verified, mode } = sslOptions()
  if (ssl && !verified && !_tlsWarned) {
    _tlsWarned = true
    logger.warn('pg_tls_unverified', {
      detail: `PGSSLMODE=${mode} without PGSSLROOTCERT: the connection is encrypted but the server certificate is not verified. Supply the CA bundle (PGSSLROOTCERT) and set PGSSLMODE=verify-full.`,
    })
  }
  return {
    connectionString: process.env.DATABASE_URL,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
    ...(ssl ? { ssl } : {}),
  }
}

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL)
}

// Lazily create (once) and return the shared pool, or null when unconfigured.
export function getPool() {
  if (_initialised) return _pool
  _initialised = true
  if (!isDbConfigured()) {
    _pool = null
    return null
  }
  _pool = new pg.Pool({
    ...connectionOptions(),
    max: Number(process.env.PG_POOL_MAX) || 5,
  })
  // A pool-level error (e.g. a dropped idle connection) must never crash the
  // process — log and let pg recreate connections on demand.
  _pool.on('error', () => {})
  return _pool
}

// Lock holders must not consume the connections their operations need for I/O.
export function getSessionLockPool() {
  if (!isDbConfigured()) return null
  if (!_sessionLockPool) {
    const max = process.env.PG_SESSION_LOCK_POOL_MAX === undefined ? 5 : Number(process.env.PG_SESSION_LOCK_POOL_MAX)
    if (!Number.isInteger(max) || max <= 0) throw new Error('Invalid assessment lock pool configuration.')
    _sessionLockPool = new pg.Pool({ ...connectionOptions(), max, allowExitOnIdle: true })
    _sessionLockPool.on('error', (error) => logger.error('assessment_lock_pool_error', { code: error.code || error.name }))
  }
  return _sessionLockPool
}

// Run a parameterised query. Returns the pg result, or null if no DB is
// configured (callers treat null as "telemetry disabled / unavailable").
export async function query(text, params = []) {
  const pool = getPool()
  if (!pool) return null
  return pool.query(text, params)
}

export async function closePool() {
  if (_sessionLockPool) {
    const locks = _sessionLockPool
    _sessionLockPool = null
    await locks.end()
  }
  if (_pool) {
    await _pool.end().catch(() => {})
    _pool = null
    _initialised = false
  }
}
