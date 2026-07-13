// Control Centre Phase 6 — unit tests (no database).
//
// Dark gates for the privacy + audit namespaces, the audit router's
// structural read-only guarantee, the TELEMETRY_CASCADE lockstep with
// lib/telemetry.js eraseTelemetry, the legacy-token retirement kill switch,
// and a source scan proving no legacy plane compares x-admin-token with a
// non-constant-time equality anymore.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.NODE_ENV = 'test'
delete process.env.PRISM_ADMIN_CONSOLE
delete process.env.PRISM_ADMIN_TOKEN_DISABLED

const base = dirname(fileURLToPath(import.meta.url))
const src = (...rel) => readFileSync(join(base, ...rel), 'utf8')

const { TELEMETRY_CASCADE } = await import('../lib/privacyPlanner.js')
const { isLegacyAdminTokenDisabled, legacyAdminGuard } = await import('../lib/adminAuth.js')
const { buildApp } = await import('../app.js')

test('Phase 6 namespaces are dark without PRISM_ADMIN_CONSOLE', async () => {
  const app = buildApp()
  const server = app.listen(0)
  const port = server.address().port
  try {
    for (const path of ['/api/admin/privacy', '/api/admin/audit', '/api/admin/audit/security']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`)
      assert.equal(res.status, 404, `${path} must be dark`)
    }
  } finally {
    server.close()
  }
})

test('audit router is STRUCTURALLY read-only (no mutating routes at all)', () => {
  const code = src('..', 'routes', 'admin', 'audit.js')
  assert.ok(
    !/router\.(post|put|patch|delete)\s*\(/.test(code),
    'routes/admin/audit.js must register GET routes only — audit history is immutable',
  )
  assert.ok(/router\.get\s*\(/.test(code), 'sanity: the router does register GET routes')
})

test('TELEMETRY_CASCADE stays in lockstep with lib/telemetry.js eraseTelemetry', () => {
  const code = src('..', 'lib', 'telemetry.js')
  const start = code.indexOf('export async function eraseTelemetry')
  assert.ok(start > -1, 'eraseTelemetry exists')
  const body = code.slice(start, code.indexOf('return counts', start))
  const pairs = [...body.matchAll(/\['([a-z_]+)',\s*'([a-z_]+)'\]/g)].map((m) => [m[1], m[2]])
  assert.deepEqual(
    TELEMETRY_CASCADE, pairs,
    'privacyPlanner TELEMETRY_CASCADE must mirror eraseTelemetry table-by-table — ' +
      'if a new telemetry table joins the erasure cascade, the dry-run planner must count it too',
  )
  assert.ok(pairs.length >= 13, 'the cascade covers every telemetry/research table')
})

test('no legacy plane compares x-admin-token with plain equality anymore', () => {
  const routers = ['pilot.js', 'psychometrics.js', 'studies.js', 'credentials.js', 'teamfit.js', 'assessment.js']
  for (const file of routers) {
    const code = src('..', 'routes', file)
    assert.ok(
      !/x-admin-token'\)\s*[!=]==/.test(code),
      `routes/${file} must not string-compare the shared token (timing side channel)`,
    )
    assert.ok(
      code.includes('legacyAdminGuard'),
      `routes/${file} must route admin access through legacyAdminGuard (console session OR audited legacy token)`,
    )
  }
  const auth = src('..', 'lib', 'adminAuth.js')
  assert.ok(auth.includes('timingSafeEqual'), 'the one remaining token comparison is constant-time')
})

test('legacy token retirement: default off, kill switch returns LEGACY_TOKEN_RETIRED', async () => {
  assert.equal(isLegacyAdminTokenDisabled(), false, 'PRISM_ADMIN_TOKEN_DISABLED defaults off')

  const savedToken = process.env.ADMIN_TOKEN
  process.env.ADMIN_TOKEN = 'p6-unit-secret'
  try {
    const guard = legacyAdminGuard('psychometrics:read')
    const mkReq = (token) => ({
      get: (h) => (h.toLowerCase() === 'x-admin-token' ? token : undefined),
      ip: '127.0.0.1',
    })
    const mkRes = () => {
      const res = { statusCode: 200 }
      res.status = (c) => { res.statusCode = c; return res }
      res.json = (b) => { res.body = b; return res }
      return res
    }

    // Correct token → next() while the switch is off.
    let nexted = false
    let res = mkRes()
    await guard(mkReq('p6-unit-secret'), res, () => { nexted = true })
    assert.equal(nexted, true, 'valid legacy token passes while enabled')

    // Wrong token → 401.
    res = mkRes()
    await guard(mkReq('wrong'), res, () => { throw new Error('must not pass') })
    assert.equal(res.statusCode, 401)

    // Kill switch: even the CORRECT token is refused with a named code.
    process.env.PRISM_ADMIN_TOKEN_DISABLED = 'true'
    res = mkRes()
    await guard(mkReq('p6-unit-secret'), res, () => { throw new Error('must not pass') })
    assert.equal(res.statusCode, 401)
    assert.equal(res.body.code, 'LEGACY_TOKEN_RETIRED')
  } finally {
    delete process.env.PRISM_ADMIN_TOKEN_DISABLED
    if (savedToken === undefined) delete process.env.ADMIN_TOKEN
    else process.env.ADMIN_TOKEN = savedToken
  }
})

test('ONE LAW: Phase 6 modules never assign PRISM_* env at runtime', () => {
  for (const rel of [
    ['..', 'routes', 'admin', 'privacy.js'],
    ['..', 'routes', 'admin', 'audit.js'],
    ['..', 'lib', 'privacyPlanner.js'],
    ['..', 'lib', 'adminAuth.js'],
  ]) {
    const code = src(...rel)
    assert.ok(
      !/process\.env\.PRISM_[A-Z_]+\s*=[^=]/.test(code),
      `${rel.join('/')} must not assign PRISM_* env vars at runtime`,
    )
  }
})
