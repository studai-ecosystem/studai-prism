// Control Centre Phase 2 — unit + JSON-store integration tests (no Postgres).
//
// Covers: store list/search projections on the JSON backend (temp DATA_DIR),
// candidate suspension + token-version revocation on the live auth routes,
// the dispute state machine, score-correction sanitisation (clamp + weighted
// recompute + mass-assignment guard), PII masking, and the permission-key
// source scan (every requirePermission() string must exist in the catalogue).

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase2-test-secret'
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-admin-p2-'))
delete process.env.PRISM_ADMIN_CONSOLE
delete process.env.PRISM_PG_STORE

const store = await import('../lib/store.js')
const userDb = await import('../lib/db.js')
const {
  sanitizeCorrectionScores, maskEmail, maskVerification,
  DISPUTE_STATES, DISPUTE_TRANSITIONS, canTransitionDispute, coarseDisputeStatus,
} = await import('../lib/adminProduct.js')
const { PERMISSIONS } = await import('../lib/adminRbac.js')
const { DIMENSION_KEYS, DIMENSION_WEIGHTS } = await import('../lib/sharedConstants.js')
const { buildApp } = await import('../app.js')

// ── Store list/search projections (JSON backend) ─────────────────────────────
test('JSON store: list functions paginate, filter and project safely', async () => {
  const uid = `u-${randomUUID().slice(0, 8)}`
  const sids = [randomUUID(), randomUUID(), randomUUID()]

  await store.createEntitlement({ sessionId: sids[0], mode: 'paid', amount: 49900, paymentId: 'pay_list1', orderId: 'order_list1' })
  await store.createEntitlement({ sessionId: sids[1], mode: 'dev', amount: 0 })
  await store.createEntitlement({ sessionId: sids[2], mode: 'paid', amount: 49900 })

  await store.createSession(sids[0], { scenarioId: 'group-project', userId: uid, userEmail: 'lister@test.local', exchangeCount: 2, history: [{ role: 'user', content: 'hello' }] })
  await store.createSession(sids[1], { scenarioId: 'fest-budget', userId: uid, userEmail: 'lister@test.local', exchangeCount: 0 })
  await store.saveReport(sids[0], { userId: uid, scores: { overall: 71, criticalThinking: 70 }, feedback: {}, reliability: { level: 'moderate' } })
  await store.createDispute(sids[0], 'score seems wrong', 'lister@test.local')
  await store.recordConsent(sids[0], ['data_processing'], { consentVersion: 'test-v' })
  await store.recordVerification(sids[0], { fullName: 'List Er', fathersName: 'Sr Er', dob: '2000-01-01', aadhaarLast4: '1234', nameMatch: true })
  await store.recordEvent(sids[0], 'tab_switch', { n: 1 })
  await store.recordEvent(sids[1], 'paste', {})

  // Sessions: user filter + status filter + projection excludes transcript.
  const byUser = await store.listSessions({ userId: uid, page: 1, pageSize: 10 })
  assert.equal(byUser.total, 2)
  assert.ok(byUser.rows.every((s) => !('history' in s)), 'list projection never carries the transcript')
  const completed = await store.listSessions({ userId: uid, status: 'completed' })
  assert.equal(completed.total, 1)
  assert.equal(completed.rows[0].sessionId, sids[0])
  const bySearch = await store.listSessions({ q: sids[1].slice(0, 13) })
  assert.ok(bySearch.rows.some((s) => s.sessionId === sids[1]))

  // Pagination clamps.
  const paged = await store.listSessions({ userId: uid, page: 1, pageSize: 1 })
  assert.equal(paged.rows.length, 1)
  assert.equal(paged.total, 2)
  const clamped = await store.listSessions({ userId: uid, pageSize: 5000 })
  assert.ok(clamped.pageSize <= 100, 'pageSize hard-capped at 100')

  // Reports.
  const reports = await store.listReports({ userId: uid })
  assert.equal(reports.total, 1)
  assert.equal(reports.rows[0].overall, 71)
  assert.equal(reports.rows[0].reliability, 'moderate')
  const scoreBand = await store.listReports({ minOverall: 90 })
  assert.ok(!scoreBand.rows.some((r) => r.sessionId === sids[0]))

  // Disputes + coarse status sync.
  const disputes = await store.listDisputes({ status: 'open' })
  assert.ok(disputes.rows.some((d) => d.sessionId === sids[0]))
  const synced = await store.setDisputeStatus(sids[0], 'in_review')
  assert.equal(synced.status, 'in_review')
  await assert.rejects(() => store.setDisputeStatus(sids[0], 'nonsense'), /BAD_DISPUTE_STATUS/)

  // Entitlements + ref lookup + revocation semantics.
  const paid = await store.listEntitlements({ mode: 'paid' })
  assert.ok(paid.rows.some((p) => p.sessionId === sids[0]))
  const byRef = await store.findEntitlementByRef('pay_list1')
  assert.equal(byRef.sessionId, sids[0])
  const consumedRevoke = await store.revokeEntitlement(sids[0], 'too late')
  assert.equal(consumedRevoke.ok, false)
  assert.equal(consumedRevoke.error, 'ALREADY_CONSUMED', 'consumed entitlements cannot be revoked')
  const freshRevoke = await store.revokeEntitlement(sids[2], 'granted in error')
  assert.equal(freshRevoke.ok, true)
  assert.equal((await store.getEntitlement(sids[2])).consumed, true, 'revocation reuses consumption semantics')

  // Consents / verifications / events.
  assert.ok((await store.listConsents({})).rows.some((c) => c.sessionId === sids[0]))
  const verifs = await store.listVerifications({})
  assert.ok(verifs.rows.some((v) => v.sessionId === sids[0]))
  const events = await store.listEventsFiltered({ sessionId: sids[0] })
  assert.equal(events.total, 1)
  assert.equal(events.rows[0].type, 'tab_switch')
  const typed = await store.listEventsFiltered({ type: 'paste' })
  assert.ok(typed.rows.every((e) => e.type === 'paste'))

  // Cleanup.
  for (const sid of sids) await store.eraseSession(sid)
})

// ── User store: listUsers + account controls ─────────────────────────────────
test('user store: listUsers searches and updateUserAccount controls state/tokens', async () => {
  const email = `p2-${randomUUID().slice(0, 8)}@test.local`
  const user = await userDb.createUser({ email, name: 'Phase Two', college: 'C', year: '3', passwordHash: 'x' })

  const found = await userDb.listUsers({ q: email })
  assert.equal(found.total, 1)
  assert.equal(found.rows[0].id, user.id)
  const byName = await userDb.listUsers({ q: 'phase two' })
  assert.ok(byName.rows.some((u) => u.id === user.id))

  const suspended = await userDb.updateUserAccount(user.id, { accountState: 'suspended', bumpTokenVersion: true })
  assert.equal(suspended.accountState, 'suspended')
  assert.equal(suspended.tokenVersion, 1)
  const again = await userDb.updateUserAccount(user.id, { bumpTokenVersion: true })
  assert.equal(again.tokenVersion, 2)
  await assert.rejects(() => userDb.updateUserAccount('nope', { accountState: 'active' }), /USER_NOT_FOUND/)
})

// ── Candidate auth: suspension + token-version revocation over HTTP ──────────
async function request(app, method, path, { body, headers = {} } = {}) {
  const server = app.listen(0)
  const port = server.address().port
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: !['GET', 'HEAD'].includes(method) && body ? JSON.stringify(body) : undefined,
    })
    let json = null
    try { json = await res.json() } catch { /* empty */ }
    return { status: res.status, json }
  } finally {
    server.close()
  }
}

test('candidate auth: suspended accounts cannot sign in; token bump revokes live JWTs', async () => {
  const app = buildApp()
  const email = `p2auth-${randomUUID().slice(0, 8)}@test.local`
  const password = 'candidate-pass-1'

  const reg = await request(app, 'POST', '/api/auth/register', {
    body: { email, password, name: 'Auth Cand' },
  })
  assert.equal(reg.status, 201)
  const token = reg.json.token

  const meOk = await request(app, 'GET', '/api/auth/me', { headers: { authorization: `Bearer ${token}` } })
  assert.equal(meOk.status, 200)

  // Admin-side session revocation: bump the token version → old JWT dies.
  const user = await userDb.findUserByEmail(email)
  await userDb.updateUserAccount(user.id, { bumpTokenVersion: true })
  const meRevoked = await request(app, 'GET', '/api/auth/me', { headers: { authorization: `Bearer ${token}` } })
  assert.equal(meRevoked.status, 401, 'pre-bump tokens are revoked')
  assert.match(meRevoked.json.error, /revoked/i)

  // Fresh login works and carries the new version…
  const login = await request(app, 'POST', '/api/auth/login', { body: { email, password } })
  assert.equal(login.status, 200)
  const me2 = await request(app, 'GET', '/api/auth/me', { headers: { authorization: `Bearer ${login.json.token}` } })
  assert.equal(me2.status, 200)

  // …until suspension blocks both sign-in and existing tokens.
  await userDb.updateUserAccount(user.id, { accountState: 'suspended', bumpTokenVersion: true })
  const loginSuspended = await request(app, 'POST', '/api/auth/login', { body: { email, password } })
  assert.equal(loginSuspended.status, 403)
  assert.match(loginSuspended.json.error, /suspended/i)
  const meSuspended = await request(app, 'GET', '/api/auth/me', { headers: { authorization: `Bearer ${login.json.token}` } })
  assert.ok([401, 403].includes(meSuspended.status), 'suspended account tokens rejected')

  // Reactivation restores sign-in.
  await userDb.updateUserAccount(user.id, { accountState: 'active' })
  const loginBack = await request(app, 'POST', '/api/auth/login', { body: { email, password } })
  assert.equal(loginBack.status, 200)
})

// ── Score-correction sanitisation ────────────────────────────────────────────
test('sanitizeCorrectionScores: clamps 0–100, recomputes weighted overall, rejects mass assignment', () => {
  const input = { criticalThinking: 250, communication: -10, collaboration: 80.6, problemSolving: 70, aiDigitalFluency: 'not-a-number' }
  const clean = sanitizeCorrectionScores(input)
  assert.equal(clean.criticalThinking, 100)
  assert.equal(clean.communication, 0)
  assert.equal(clean.collaboration, 81)
  assert.equal(clean.aiDigitalFluency, 0)
  const expectedOverall = Math.round(
    DIMENSION_KEYS.reduce((s, k) => s + clean[k] * DIMENSION_WEIGHTS[k], 0),
  )
  assert.equal(clean.overall, Math.max(0, Math.min(100, expectedOverall)), 'overall recomputed from canonical weights')

  assert.throws(() => sanitizeCorrectionScores({ ...input, overall: 100 }), /unknown score keys/, 'overall cannot be injected')
  assert.throws(() => sanitizeCorrectionScores({ ...input, isAdmin: true }), /unknown score keys/)
  assert.throws(() => sanitizeCorrectionScores({ criticalThinking: 50 }), /missing score keys/)
  assert.throws(() => sanitizeCorrectionScores(null), /scores object required/)
})

// ── PII masking ──────────────────────────────────────────────────────────────
test('maskEmail and maskVerification hide identity while keeping operational signal', () => {
  assert.equal(maskEmail('someone@example.com')[0], 's')
  assert.ok(maskEmail('someone@example.com').includes('@example.com'))
  assert.ok(!maskEmail('someone@example.com').includes('omeone'))
  assert.equal(maskEmail(''), '')

  const masked = maskVerification({
    sessionId: 's1', fullName: 'Real Name', fathersName: 'Parent', dob: '2000-01-01',
    aadhaarLast4: '9999', nameMatch: true, matchScore: 0.93, status: 'verified', at: 'now',
  })
  assert.equal(masked.pii, 'masked')
  assert.equal(masked.status, 'verified')
  assert.equal(masked.nameMatch, true)
  for (const banned of ['fullName', 'fathersName', 'dob', 'aadhaarLast4']) {
    assert.ok(!(banned in masked), `${banned} must not survive masking`)
  }
})

// ── Dispute state machine ────────────────────────────────────────────────────
test('dispute workflow: transitions follow §10; terminal states only reopen', () => {
  assert.ok(canTransitionDispute('open', 'assigned'))
  assert.ok(canTransitionDispute('decision_proposed', 'resolved'))
  assert.ok(canTransitionDispute('resolved', 'reopened'))
  assert.ok(!canTransitionDispute('open', 'resolved'), 'no resolution without review path')
  assert.ok(!canTransitionDispute('resolved', 'assigned'), 'terminal states cannot be edited, only reopened')
  assert.ok(!canTransitionDispute('nope', 'open'))

  // Every named transition target is a real state.
  for (const [from, targets] of Object.entries(DISPUTE_TRANSITIONS)) {
    assert.ok(DISPUTE_STATES.includes(from))
    for (const to of targets) assert.ok(DISPUTE_STATES.includes(to), `${from}→${to}`)
  }
  // Coarse mapping stays within the store CHECK constraint.
  for (const s of DISPUTE_STATES) {
    assert.ok(['open', 'in_review', 'resolved'].includes(coarseDisputeStatus(s)))
  }
})

// ── Permission-key source scan ───────────────────────────────────────────────
test('every requirePermission() key used by admin routes exists in the catalogue', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'routes', 'admin')
  const known = new Set([...Object.keys(PERMISSIONS), '*'])
  let found = 0
  for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), 'utf8')
    for (const m of src.matchAll(/requirePermission\('([^']+)'\)/g)) {
      found += 1
      assert.ok(known.has(m[1]), `${f} uses undeclared permission '${m[1]}'`)
    }
  }
  assert.ok(found >= 20, `expected a meaningful number of guarded endpoints, found ${found}`)
})

// ── Ship-dark contract extends to every Phase 2 namespace ───────────────────
test('Phase 2 namespaces are dark without PRISM_ADMIN_CONSOLE', async () => {
  delete process.env.PRISM_ADMIN_CONSOLE
  const app = buildApp()
  for (const path of [
    '/api/admin/users', '/api/admin/sessions', '/api/admin/reports',
    '/api/admin/disputes', '/api/admin/payments', '/api/admin/records/consents',
    '/api/admin/search?q=abc',
  ]) {
    const r = await request(app, 'GET', path)
    assert.equal(r.status, 404, `${path} must be dark`)
  }
})
