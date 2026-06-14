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

let _pool = null
let _initialised = false

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
  const ssl =
    process.env.PGSSLMODE === 'require' || /\bsslmode=require\b/.test(process.env.DATABASE_URL || '')
      ? { rejectUnauthorized: false }
      : undefined
  _pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
    ...(ssl ? { ssl } : {}),
  })
  // A pool-level error (e.g. a dropped idle connection) must never crash the
  // process — log and let pg recreate connections on demand.
  _pool.on('error', () => {})
  return _pool
}

// Run a parameterised query. Returns the pg result, or null if no DB is
// configured (callers treat null as "telemetry disabled / unavailable").
export async function query(text, params = []) {
  const pool = getPool()
  if (!pool) return null
  return pool.query(text, params)
}

export async function closePool() {
  if (_pool) {
    await _pool.end().catch(() => {})
    _pool = null
    _initialised = false
  }
}
