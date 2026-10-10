// PROD-READY Phase 8 — demo organization guards that need no database:
//   * the seed refuses without --demo, and in production unless
//     PRISM_DEMO_MODE is on AND PRISM_DEMO_DATABASE_URL is a separate database;
//   * PRISM_DEMO_MODE is registered OFF and classified by the smoke battery;
//   * GET /api/v1/me carries `demo: true` only for a member of a demo
//     organization, and each workspace its own isDemo marker;
//   * the rating queue refuses demo sessions (never rating/calibration data).
// The database guards (isolation triggers, analytics, seed contents) are in
// demoOrg.db.test.js; the calibration side in calibration/tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { resolveDemoTarget, DemoSeedRefused } from '../db/seedDemoOrg.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { createValidationService } from '../domain/validation/service.js'

const refused = (argv, env, code) => assert.throws(() => resolveDemoTarget(argv, env), (e) => e instanceof DemoSeedRefused && e.code === code, code)

test('seed refusals: explicit --demo; production needs PRISM_DEMO_MODE and a separate demo database', () => {
  refused([], { DATABASE_URL: 'postgres://dev/db' }, 'DEMO_FLAG_REQUIRED')
  refused(['--students', '5'], { PRISM_DEMO_DATABASE_URL: 'postgres://demo/db' }, 'DEMO_FLAG_REQUIRED')
  const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://prod/prism' }
  refused(['--demo'], prod, 'DEMO_REFUSED_IN_PRODUCTION')
  refused(['--demo'], { ...prod, PRISM_DEMO_DATABASE_URL: 'postgres://demo/prism' }, 'DEMO_REFUSED_IN_PRODUCTION')
  refused(['--demo'], { ...prod, PRISM_DEMO_MODE: 'true' }, 'DEMO_DATABASE_REQUIRED')
  refused(['--demo'], { ...prod, PRISM_DEMO_MODE: 'true', PRISM_DEMO_DATABASE_URL: 'postgres://prod/prism/' }, 'DEMO_DATABASE_NOT_SEPARATE')
  refused(['--demo'], {}, 'NO_DATABASE')
  assert.deepEqual(resolveDemoTarget(['--demo'], { ...prod, PRISM_DEMO_MODE: 'true', PRISM_DEMO_DATABASE_URL: 'postgres://demo/prism' }), { url: 'postgres://demo/prism', separate: true })
  assert.deepEqual(resolveDemoTarget(['--demo'], { DATABASE_URL: 'postgres://dev/db' }), { url: 'postgres://dev/db', separate: false }, 'outside production a dev database is allowed')
})

test('PRISM_DEMO_MODE is registered OFF; the npm script never loads runtime secrets', async () => {
  const f = FLAG_CATALOGUE.find((x) => x.key === 'PRISM_DEMO_MODE')
  assert.ok(f)
  assert.match(f.dataGate, /separate demo database/)
  assert.notEqual(process.env.PRISM_DEMO_MODE, 'true')
  const { readFile } = await import('node:fs/promises')
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.scripts['seed:demo'], 'node db/seedDemoOrg.js')
  assert.ok(!pkg.scripts['seed:demo'].includes('runWithRuntimeSecrets'), 'cannot pick up the production database from the secret store')
  const smoke = await import('../../scripts/post-deploy-smoke.mjs')
  assert.ok(smoke.EXPECTED_DARK_FLAGS.includes('PRISM_DEMO_MODE'))
})

async function meWorld() {
  process.env.PRISM_CAMPUS_ENABLED = 'true'
  process.env.PRISM_APP_SHELL_V3 = 'true'
  const repos = createMemoryCampusRepos({ clock: () => new Date('2026-10-10T09:00:00Z') })
  const demo = await repos.organizations.createOrganization({ name: 'Demo College (synthetic)', slug: 'demo-x', organizationType: 'COLLEGE', status: 'ACTIVE', isDemo: true })
  const real = await repos.organizations.createOrganization({ name: 'Synthetic Real College', slug: 'real-x', organizationType: 'COLLEGE', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: demo.id, userId: 'demo-s1', role: 'STUDENT', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: real.id, userId: 'real-s1', role: 'STUDENT', status: 'ACTIVE' })
  const campus = createCampusContext({ repos })
  const app = express()
  app.use(express.json())
  const requireUser = (req, _res, next) => {
    const id = req.get('x-test-user')
    if (!id) return next(new ApiError('UNAUTHENTICATED', 'Sign in'))
    req.user = { id, email: `${id}@test.local`, name: id }
    return next()
  }
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const me = async (who) => (await (await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me`, { headers: { 'x-test-user': who } })).json()).data
  return { me, repos, close: () => server.close() }
}

test('/me: demo marker only for members of a demo organization', async () => {
  const w = await meWorld()
  try {
    const d = await w.me('demo-s1')
    assert.equal(d.demo, true)
    assert.ok(d.workspaces.some((x) => x.type === 'CAMPUS_STUDENT' && x.isDemo === true))
    const r = await w.me('real-s1')
    assert.equal(r.demo, false)
    assert.ok(r.workspaces.every((x) => x.isDemo !== true))
    const p = await w.me('nobody')
    assert.equal(p.demo, false, 'a personal-only account is never demo')
  } finally { w.close() }
})

test('rating queue: a demo session is refused before anything is read or queued', async () => {
  const repos = createMemoryCampusRepos()
  repos.db.demoSessions.add('demo-sess-1')
  let read = 0
  const svc = createValidationService({ repos, evidence: { units: async () => { read += 1; return [] } }, candidateNameFor: async () => 'Demo Student 001' })
  await assert.rejects(svc.enqueueSession('demo-sess-1', { enqueuedBy: 'syn-admin' }), (e) => e.code === 'CONFLICT' && /synthetic demo session/.test(e.message))
  assert.equal(read, 0)
  await assert.rejects(svc.enqueueSession('real-sess-1', { enqueuedBy: 'syn-admin' }), (e) => e.code === 'NOT_FOUND', 'a real session goes on to the normal checks')
})
