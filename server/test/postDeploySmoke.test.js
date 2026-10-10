// PROD-READY Phase 7 (P78) — the post-deploy smoke battery
// (scripts/post-deploy-smoke.mjs) is safe to point at production and its
// checks discriminate: run against the REAL app (buildApp) with every flag off
// the battery passes, and turning on the flags behind each dark check makes
// that check fail (so a 404 is evidence of "dark", not of a wrong path).
import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'p07-smoke-test-secret'
delete process.env.DATABASE_URL
delete process.env.PRISM_PG_STORE
for (const f of FLAG_CATALOGUE) delete process.env[f.key]

const smoke = await import('../../scripts/post-deploy-smoke.mjs')
const { buildApp } = await import('../app.js')

const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => server.close())

const withEnv = async (keys, fn) => {
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  for (const k of keys) process.env[k] = 'true'
  try { return await fn() } finally {
    for (const k of keys) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k] }
  }
}

const SERVER_CHECKS = smoke.buildChecks().filter((c) => c.kind !== 'admin' && c.id !== 'spa').map((c) => c.id)

test('every registered flag is classified, and the dark list matches the registry', () => {
  const registered = new Set(FLAG_CATALOGUE.map((f) => f.key))
  const classified = [...smoke.EXPECTED_DARK_FLAGS, ...smoke.EXPECTED_ON_FLAGS, ...smoke.OPERATIONAL_FLAGS_NOT_ASSERTED]
  assert.equal(new Set(classified).size, classified.length, 'a flag is listed twice')
  for (const key of classified) assert.ok(registered.has(key), `${key} is not in flagRegistry.js`)
  for (const key of registered) assert.ok(classified.includes(key), `${key} is registered but the smoke battery does not classify it`)
  for (const key of ['PRISM_V3_SUPPORT_ROUTES', 'PRISM_JOB_WORKER', 'PRISM_ANALYTICS_DECISION_CACHE', 'PRISM_CAMPUS_ENABLED']) {
    assert.ok(smoke.EXPECTED_DARK_FLAGS.includes(key), `${key} must be asserted dark by this release`)
  }
  assert.deepEqual([...smoke.EXPECTED_ON_FLAGS], ['PRISM_PG_STORE'])
})

test('safety: GET only except one unauthenticated DELETE probe of a fresh random id; https unless loopback', () => {
  const a = smoke.buildChecks()
  const b = smoke.buildChecks()
  const nonGet = a.filter((c) => c.method !== 'GET')
  assert.deepEqual(nonGet.map((c) => `${c.id}:${c.method}`), ['legacy-erasure-guard:DELETE'])
  for (const c of a) assert.doesNotThrow(() => smoke.assertSafeCheck(c))
  assert.throws(() => smoke.assertSafeCheck({ id: 'x', kind: 'dark', method: 'POST', path: '/' }), /SMOKE_UNSAFE_CHECK/)
  assert.throws(() => smoke.assertSafeCheck({ id: 'x', kind: 'guard', method: 'DELETE', path: '/' }), /SMOKE_UNSAFE_CHECK/, 'a DELETE must be an explicit probe')
  const probeA = a.find((c) => c.id === 'legacy-erasure-guard').path
  const probeB = b.find((c) => c.id === 'legacy-erasure-guard').path
  assert.match(probeA, /^\/api\/assessment\/data\/[0-9a-f-]{36}$/)
  assert.notEqual(probeA, probeB, 'the probe id is generated per run')
  assert.throws(() => smoke.assertSafeBaseUrl('http://prism.studai.one'), /SMOKE_HTTPS_REQUIRED/)
  assert.doesNotThrow(() => smoke.assertSafeBaseUrl('https://prism.studai.one'))
  assert.doesNotThrow(() => smoke.assertSafeBaseUrl('http://127.0.0.1:3001'))
  assert.throws(() => smoke.parseArgs([]), /SMOKE_BASE_URL_REQUIRED/)
  assert.throws(() => smoke.parseArgs(['--base-url', 'https://x', '--frobnicate']), /SMOKE_UNKNOWN_ARGUMENT/)
})

test('dry-run plan sends nothing and marks admin checks and the probe as skipped when asked', async () => {
  let calls = 0
  const plan = smoke.planSmoke({ baseUrl: 'https://prism.studai.one', includeGuardProbes: false })
  assert.equal(calls, 0)
  assert.ok(plan.every((c) => c.url.startsWith('https://prism.studai.one/')))
  assert.ok(plan.filter((c) => c.kind === 'admin').every((c) => /admin token/.test(c.skipped)))
  assert.equal(plan.find((c) => c.id === 'legacy-erasure-guard').skipped, '--no-guard-probes')
  const fake = async () => { calls += 1; throw new Error('must not be called') }
  const report = await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl: fake, includeGuardProbes: false, only: ['legacy-erasure-guard', 'admin-flags'] })
  assert.equal(calls, 0)
  assert.deepEqual(report.results.map((r) => r.status), ['SKIP', 'UNVERIFIED'])
  assert.equal(report.ok, true)
})

test('against the real app with every flag off the battery passes (no database: readiness reports not_configured)', async () => {
  const report = await smoke.runSmoke({ baseUrl: base, expectDatabase: false, only: SERVER_CHECKS })
  const failed = report.results.filter((r) => r.status !== 'PASS')
  assert.deepEqual(failed, [], JSON.stringify(failed, null, 2))
  assert.equal(report.ok, true)
  assert.equal(report.results.length, SERVER_CHECKS.length)
  // Production must see the database: the same server fails the strict check.
  const strict = await smoke.runSmoke({ baseUrl: base, only: ['ready'] })
  assert.equal(strict.ok, false)
  assert.match(strict.results[0].detail, /not_configured/)
})

test('each dark check discriminates: with its flags on the route is no longer a 404', async () => {
  const darkChecks = smoke.buildChecks().filter((c) => c.kind === 'dark')
  assert.ok(darkChecks.length >= 14)
  for (const check of darkChecks) {
    await withEnv(check.enableWith, async () => {
      const report = await smoke.runSmoke({ baseUrl: base, expectDatabase: false, only: [check.id] })
      const r = report.results[0]
      assert.equal(r.status, 'FAIL', `${check.id} still 404 with ${check.enableWith.join('+')} on — the check proves nothing`)
      assert.notEqual(r.httpStatus, 404, check.id)
    })
  }
})

test('admin checks: flag states and dark admin planes are evaluated from read-only GETs with the token from the environment only', async () => {
  const seen = []
  const registry = (overrides = {}) => ({ flags: [
    ...smoke.EXPECTED_DARK_FLAGS.map((k) => ({ flag_key: k, liveState: overrides[k] || 'off' })),
    { flag_key: 'PRISM_PG_STORE', liveState: overrides.PRISM_PG_STORE || 'on' },
  ] })
  const fakeFetch = (body) => async (url, init) => {
    seen.push({ url, method: init.method, auth: init.headers.Authorization || null })
    const path = new URL(url).pathname
    const status = path === '/api/admin/flags' ? 200 : 404
    return new Response(JSON.stringify(path === '/api/admin/flags' ? body : { error: 'Not found' }), { status, headers: { 'content-type': 'application/json' } })
  }
  const only = ['admin-flags', 'admin-job-queue', 'admin-accommodation-requests']
  const good = await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl: fakeFetch(registry()), adminToken: 'tok', only })
  assert.equal(good.ok, true, JSON.stringify(good.results))
  assert.ok(seen.every((s) => s.method === 'GET' && s.auth === 'Bearer tok'))

  const cacheOn = await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl: fakeFetch(registry({ PRISM_ANALYTICS_DECISION_CACHE: 'on' })), adminToken: 'tok', only: ['admin-flags'] })
  assert.equal(cacheOn.ok, false)
  assert.match(cacheOn.results[0].detail, /PRISM_ANALYTICS_DECISION_CACHE/)

  const pgOff = await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl: fakeFetch(registry({ PRISM_PG_STORE: 'off' })), adminToken: 'tok', only: ['admin-flags'] })
  assert.equal(pgOff.ok, false)

  const recorded = await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl: fakeFetch(registry({ PRISM_STANDARDIZED_CORE: 'on' })), adminToken: 'tok', only: ['admin-flags'], allowOn: ['PRISM_STANDARDIZED_CORE'] })
  assert.equal(recorded.ok, true)
  assert.match(recorded.results[0].detail, /recorded human decision: PRISM_STANDARDIZED_CORE/)
  await assert.rejects(() => smoke.runSmoke({ baseUrl: 'https://x.invalid', allowOn: ['PRISM_NOT_A_FLAG'] }), /SMOKE_UNKNOWN_FLAG/)

  const partial = { flags: registry().flags.filter((f) => f.flag_key !== 'PRISM_JOB_WORKER') }
  const unverified = await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl: fakeFetch(partial), adminToken: 'tok', only: ['admin-flags'] })
  assert.equal(unverified.results[0].status, 'UNVERIFIED')

  // Non-admin checks never carry a credential, even when a token is configured.
  seen.length = 0
  await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl: fakeFetch(registry()), adminToken: 'tok', only: ['health', 'campus-org', 'legacy-erasure-guard'] })
  assert.ok(seen.length === 3 && seen.every((s) => s.auth === null))
})

test('SPA check reads the bundle name and compares it when --expect-bundle is given', async () => {
  const html = '<!doctype html><html><head><script type="module" src="/assets/index-AbC123_x.js"></script></head><body><div id="root"></div></body></html>'
  const fetchImpl = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  const ok = await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl, only: ['spa'] })
  assert.equal(ok.results[0].status, 'PASS')
  assert.equal(ok.results[0].bundle, 'index-AbC123_x.js')
  const mismatch = await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl, only: ['spa'], expectBundle: 'index-Other.js' })
  assert.equal(mismatch.ok, false)
  const notHtml = await smoke.runSmoke({ baseUrl: 'https://prism.studai.one', fetchImpl: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }), only: ['spa'] })
  assert.equal(notHtml.ok, false)
})
