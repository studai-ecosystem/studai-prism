// S7 (C12.04) — the legacy report JSON routes are owner-only: signed out,
// another account and unknown sessions all get the same 404; the owner gets
// through; the guard is mounted in app.js ahead of the unchanged legacy router.
// S9 — the campus session lock on the other legacy session routes.
import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import express from 'express'
import {
  createLegacyReportGuard, sessionOwnerFrom,
  createCampusSessionLock, createCampusReportGate, campusSessionStatusFrom, CAMPUS_LOCKED_BODY_ROUTES, CAMPUS_LOCKED_PARAM_ROUTES,
} from '../lib/legacyReportGuard.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'

delete process.env.DATABASE_URL

test('legacy report routes: only the session owner gets through; everyone else gets an identical 404', async () => {
  const sessions = { 'sess-owned': { userId: 'user-a' } }
  const reports = { 'sess-report-only': { userId: 'user-b' } }
  const ownerOf = sessionOwnerFrom({ getSession: async (id) => sessions[id] || null, getReport: async (id) => reports[id] || null })
  const authenticate = async (req) => ({ user: req.get('x-test-user') ? { id: req.get('x-test-user') } : null })
  const app = express()
  app.get(['/api/assessment/report/:sessionId/v2', '/api/assessment/report/:sessionId/employee'], createLegacyReportGuard({ authenticate, ownerOf }))
  app.get('/api/assessment/report/:sessionId/:view', (req, res) => res.json({ ok: true, view: req.params.view }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const call = async (path, who) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: who ? { 'x-test-user': who } : {} })
    return { status: r.status, body: await r.json() }
  }
  try {
    const denied = [
      await call('/api/assessment/report/sess-owned/v2'),
      await call('/api/assessment/report/sess-owned/v2', 'user-b'),
      await call('/api/assessment/report/sess-unknown/v2', 'user-a'),
      await call('/api/assessment/report/sess-owned/employee', 'user-b'),
    ]
    for (const d of denied) assert.deepEqual([d.status, d.body], [404, { error: 'Report not found', code: 'NOT_FOUND' }])
    assert.deepEqual((await call('/api/assessment/report/sess-owned/v2', 'user-a')).body, { ok: true, view: 'v2' })
    assert.deepEqual((await call('/api/assessment/report/sess-owned/employee', 'user-a')).body, { ok: true, view: 'employee' })
    assert.equal((await call('/api/assessment/report/sess-report-only/v2', 'user-b')).status, 200, 'owner from the issued report')
  } finally { server.close() }
})

test('the guard is mounted before the legacy assessment router', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
  const guard = app.indexOf("'/api/assessment/report/:sessionId/v2', '/api/assessment/report/:sessionId/employee'")
  const router = app.indexOf("app.use('/api/assessment', assessmentRouter)")
  assert.ok(guard > 0 && router > guard)
  const lockBody = app.indexOf('app.post(CAMPUS_LOCKED_BODY_ROUTES, campusSessionLock)')
  const lockParams = app.indexOf('app.all(CAMPUS_LOCKED_PARAM_ROUTES, campusSessionLock)')
  assert.ok(lockBody > 0 && lockParams > 0 && router > lockBody && router > lockParams, 'S9 lock runs before the legacy router')
  const reportGate = app.indexOf("app.get('/api/assessment/report/:sessionId', createCampusReportGate(")
  assert.ok(reportGate > 0 && router > reportGate, 'S9 report gate runs before the legacy router')
})

// S9 — campus staff can know the ids of sponsored/V3 sessions and of sessions
// a student shared with them; the legacy session routes are closed for those.
async function lockWorld() {
  const repos = createMemoryCampusRepos()
  await repos.sessionIo.putClientEvent({ sessionId: 'sess-v3', clientEventId: 'start', kind: 'START', response: {} })
  await repos.scopes.createSessionScope({ sessionId: 'sess-sponsored', ownerUserId: 'user-a', sponsorType: 'INSTITUTION', sponsorOrganizationId: 'org-1', visibilityPolicy: 'SPONSOR_SUMMARY' })
  await repos.sharing.createShareGrant({ ownerUserId: 'user-a', recipientType: 'ORGANIZATION', recipientOrganizationId: 'org-1', expiresAt: '2099-01-01T00:00:00.000Z', resources: [{ resourceType: 'ASSESSMENT_SESSION', resourceId: 'sess-shared', disclosureLevel: 'SUMMARY' }] })
  const owners = { 'sess-shared': 'user-a', 'sess-personal': 'user-a' }
  const classify = campusSessionStatusFrom({ repos: () => repos, ownerOf: async (id) => owners[id] || null })
  const authenticate = async (req) => ({ user: req.get('x-test-user') ? { id: req.get('x-test-user') } : null })
  const app = express()
  app.use(express.json())
  const lock = createCampusSessionLock({ authenticate, classify })
  app.post(CAMPUS_LOCKED_BODY_ROUTES, lock)
  app.all(CAMPUS_LOCKED_PARAM_ROUTES, lock)
  app.use('/api/assessment', (req, res) => res.json({ reached: true }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const call = async (method, path, { who, body } = {}) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(who ? { 'x-test-user': who } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json() }
  }
  return { call, close: () => server.close() }
}

test('S9: V3 and sponsored sessions are closed on every legacy session route, even for the owner', async () => {
  const w = await lockWorld()
  try {
    for (const sid of ['sess-v3', 'sess-sponsored']) {
      for (const [method, path, body] of [
        ['DELETE', `/api/assessment/data/${sid}`],
        ['GET', `/api/assessment/artifacts/${sid}`],
        ['POST', `/api/assessment/artifacts/${sid}`, { artifactId: 'A' }],
        ['GET', `/api/assessment/accommodation/${sid}`],
        ['GET', `/api/assessment/dispute/${sid}`],
        ['GET', `/api/assessment/verify-identity/${sid}`],
        ['GET', `/api/assessment/evaluate-status/${sid}`],
        ['POST', '/api/assessment/start', { sessionId: sid }],
        ['POST', '/api/assessment/message', { sessionId: sid, text: 'x' }],
        ['POST', '/api/assessment/evaluate', { sessionId: sid }],
        ['POST', '/api/assessment/dispute', { sessionId: sid, reason: 'synthetic reason' }],
        ['POST', '/api/assessment/consent', { sessionId: sid, scopes: ['a'] }],
        ['POST', '/api/assessment/verify-identity', { sessionId: sid, fullName: 'Synthetic' }],
        ['POST', '/api/assessment/speech', { sessionId: sid, text: 'x' }],
        ['POST', '/api/assessment/accommodation', { sessionId: sid, needs: 'synthetic needs text' }],
        ['POST', '/api/assessment/calibrate', { sessionId: sid, answer: 'x' }],
      ]) {
        for (const who of [undefined, 'user-b', 'user-a']) {
          const r = await w.call(method, path, { who, body })
          assert.deepEqual([r.status, r.body], [404, { error: 'Not found', code: 'NOT_FOUND' }], `${method} ${path} as ${who || 'anonymous'}`)
        }
      }
    }
  } finally { w.close() }
})

test('S9: a shared legacy session is owner-only; an undisclosed personal session keeps today\'s behaviour', async () => {
  const w = await lockWorld()
  try {
    for (const who of [undefined, 'user-b']) {
      assert.equal((await w.call('DELETE', '/api/assessment/data/sess-shared', { who })).status, 404)
      assert.equal((await w.call('POST', '/api/assessment/dispute', { who, body: { sessionId: 'sess-shared', reason: 'synthetic reason' } })).status, 404)
    }
    assert.deepEqual((await w.call('DELETE', '/api/assessment/data/sess-shared', { who: 'user-a' })).body, { reached: true })
    assert.deepEqual((await w.call('GET', '/api/assessment/artifacts/sess-personal')).body, { reached: true })
    assert.deepEqual((await w.call('GET', '/api/assessment/artifacts/sess-unknown')).body, { reached: true })
  } finally { w.close() }
})

test('S9: without a campus store nothing is locked; a store failure fails closed', async () => {
  const open = campusSessionStatusFrom({ repos: () => null, ownerOf: async () => 'user-a' })
  assert.deepEqual(await open('any'), { v3: false, shared: false, owner: null })
  const lock = createCampusSessionLock({ classify: async () => { throw new Error('store down') } })
  let status = null
  let nextCalled = false
  const res = { status(c) { status = c; return this }, json() { return this } }
  await lock({ params: { sessionId: 's' }, body: {}, requestId: 'r' }, res, () => { nextCalled = true })
  assert.equal(status, 500)
  assert.equal(nextCalled, false)
  const gate = createCampusReportGate({ classify: async () => ({ v3: true }), ownerOf: async () => { throw new Error('store down') }, authenticate: async () => ({ user: { id: 'user-a' } }) })
  status = null
  await gate({ params: { sessionId: 's' }, requestId: 'r' }, res, () => { nextCalled = true })
  assert.equal(status, 500, 'report gate fails closed too')
  assert.equal(nextCalled, false)
})

test('S9: the issued report of a campus-known session is owner-only; an undisclosed personal one stays public', async () => {
  const repos = createMemoryCampusRepos()
  await repos.sessionIo.putClientEvent({ sessionId: 'sess-v3', clientEventId: 'start', kind: 'START', response: {} })
  await repos.sharing.createShareGrant({ ownerUserId: 'user-a', recipientType: 'ORGANIZATION', recipientOrganizationId: 'org-1', expiresAt: '2099-01-01T00:00:00.000Z', resources: [{ resourceType: 'ASSESSMENT_SESSION', resourceId: 'sess-shared', disclosureLevel: 'SUMMARY' }] })
  const owners = { 'sess-v3': 'user-a', 'sess-shared': 'user-a', 'sess-personal': 'user-a' }
  const ownerOf = async (id) => owners[id] || null
  const authenticate = async (req) => ({ user: req.get('x-test-user') ? { id: req.get('x-test-user') } : null })
  const app = express()
  app.get('/api/assessment/report/:sessionId', createCampusReportGate({ authenticate, ownerOf, classify: campusSessionStatusFrom({ repos: () => repos, ownerOf }) }))
  app.get('/api/assessment/report/:sessionId', (req, res) => res.json({ reached: true }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const call = async (sid, who) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/assessment/report/${sid}`, { headers: who ? { 'x-test-user': who } : {} })
    return { status: r.status, body: await r.json() }
  }
  try {
    for (const sid of ['sess-v3', 'sess-shared']) {
      for (const who of [undefined, 'user-b']) assert.deepEqual(await call(sid, who), { status: 404, body: { error: 'Report not found' } }, `${sid} as ${who || 'anonymous'}`)
      assert.deepEqual((await call(sid, 'user-a')).body, { reached: true })
    }
    assert.deepEqual((await call('sess-personal')).body, { reached: true }, 'verification view unchanged')
  } finally { server.close() }
})

test('S9: the real app hides the issued report of a V3 session from anonymous callers', async () => {
  const repos = createMemoryCampusRepos()
  await repos.sessionIo.putClientEvent({ sessionId: 'sess-v3-report', clientEventId: 'start', kind: 'START', response: {} })
  const store = await import('../lib/store.js')
  await store.saveReport('sess-v3-report', { userId: 'user-a', userEmail: 'synthetic-a@test.local', scores: { communication: 60 }, feedback: {}, reliability: { label: 'moderate' } })
  await store.saveReport('sess-personal-report', { userId: 'user-a', scores: { communication: 60 }, feedback: {}, reliability: { label: 'moderate' } })
  const { buildApp } = await import('../app.js')
  const app = buildApp({ campus: createCampusContext({ repos }) })
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/assessment/report`
    const hidden = await fetch(`${base}/sess-v3-report`)
    assert.equal(hidden.status, 404)
    assert.doesNotMatch(await hidden.text(), /synthetic-a@test\.local/)
    assert.equal((await fetch(`${base}/sess-personal-report`)).status, 404, 'an original personal report is private too')
  } finally { server.close() }
})

test('S9: the real app closes the legacy erasure route for a V3 session', async () => {
  const repos = createMemoryCampusRepos()
  await repos.sessionIo.putClientEvent({ sessionId: 'sess-v3-app', clientEventId: 'start', kind: 'START', response: {} })
  const { buildApp } = await import('../app.js')
  const app = buildApp({ campus: createCampusContext({ repos }) })
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/assessment/data/sess-v3-app`, { method: 'DELETE' })
    assert.equal(r.status, 404)
    assert.equal((await r.json()).code, 'NOT_FOUND')
  } finally { server.close() }
})
