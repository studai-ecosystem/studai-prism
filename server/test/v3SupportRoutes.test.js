// PROD-READY Phase 4 — /api/v1 support routes for V3 sessions (human review,
// pre-start accommodation, identity check). Real /api/v1 and admin handlers
// over memory campus repositories, a fake engine, the deterministic audit AI
// provider (PRISM_AUDIT_AI) for a real universal DRAFT run, and the real v1
// JSON store (isolated data directory) for the records the frozen engine
// reads (v1_accommodations, v1_verifications). Covers: flag-off 404 and the
// unchanged P5.7 path, zod .strict() validation, owner-only access,
// idempotency keys, audit events, the ApiError envelope, one free review per
// assessment, accommodations only before the start, and the proof that an
// approved accommodation never changes judging.
import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createV1Router } from '../routes/v1/index.js'
import { createReportReviewsAdminRouter } from '../routes/admin/reportReviews.js'
import { createAccommodationRequestsAdminRouter } from '../routes/admin/accommodationRequests.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../domain/sharing/copyVersions.js'
import { draftBankScenarios } from '../domain/assessments/draftSegments.js'
import { CORE_TEAMREADY_A, CORE_TEAMREADY_A_FORM_ID } from '../domain/assessments/universalForm.js'
import { createSliceEvaluator } from '../domain/evidence/sliceEvaluator.js'
import { legacySupportSources } from '../domain/support/legacySources.js'
import { REVIEW_OUTCOME_COPY } from '../domain/support/service.js'
import { ApiError } from '../domain/http/errors.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'
import { CAMPUS_FLAGS } from '../domain/flags/index.js'
import { assuranceForSession } from '../lib/identityAssurance.js'
import evidenceGraph from '../lib/evidenceGraph.js'
import * as store from '../lib/store.js'

process.env.NODE_ENV = 'test'
process.env.PRISM_AUDIT_AI = 'true'
delete process.env.PRISM_AUDIT_AI_FAULT
process.env.PRISM_DRAFT_CONTENT = 'true'
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_ASSESSMENT_WORKSPACE_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'
const { createCompletion } = await import('../services/ai/completionService.js')

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-10-10T10:00:00Z')
const day = 86400000
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()
const USERS = {
  student: { id: 'student-p4', email: 'p4@test.local', name: 'Synthetic Student' },
  other: { id: 'student-p4-other', email: 'p4o@test.local', name: 'Other Student' },
}
const ADMINS = {
  manager: { id: '11111111-1111-4111-8111-111111111111', permissions: new Set(['accommodations:read', 'accommodations:manage', 'reports:review']) },
  reader: { id: '22222222-2222-4222-8222-222222222222', permissions: new Set(['accommodations:read']) },
}
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-consent.v1' }
const ANSWER = 'Is 24 the confirmed number or only the sign-ups? Two of the tasks still have no owner, so I will assign them before we plan.'
const NEEDS = 'I have a visual impairment and need a text-only assessment without the camera check.'
let keySeq = 0
const key = (label = 'k') => `p4-${label}-${process.pid}-${(keySeq += 1)}`

const withFlag = async (on, fn) => {
  const prev = process.env.PRISM_V3_SUPPORT_ROUTES
  if (on) process.env.PRISM_V3_SUPPORT_ROUTES = 'true'
  else delete process.env.PRISM_V3_SUPPORT_ROUTES
  try { return await fn() } finally { if (prev === undefined) delete process.env.PRISM_V3_SUPPORT_ROUTES; else process.env.PRISM_V3_SUPPORT_ROUTES = prev }
}

function fakeEngine(state) {
  return {
    async recordConsent({ sessionId, scopes }) { state.consents[sessionId] = scopes },
    async start() { throw new Error('a universal run never starts the legacy engine') },
    async message() { throw new Error('no engine dialogue for a universal run') },
    async saveArtifact() { throw new Error('no engine artifacts for a universal run') },
    async evaluate() { throw new Error('legacy scoring must never run for a draft run') },
    async evaluateStatus() { return 'IDLE' },
  }
}

// One synthetic college, the student on a sponsored universal assignment.
// `judgeCalls` records every request the evidence evaluator sends to the model.
async function world() {
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: `syn-p4-${Math.random().toString(36).slice(2, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  for (const u of Object.values(USERS)) await repos.memberships.upsertMembership({ organizationId: org.id, userId: u.id, role: 'STUDENT', status: 'ACTIVE' })
  const state = { payments: [], sessions: {}, consents: {} }
  const judgeCalls = []
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listEntitlements: async () => [],
    listSessionIds: async (uid) => Object.values(state.sessions).filter((s) => s.userId === uid).map((s) => s.sessionId),
    getSession: async (sid) => (state.sessions[sid] ? structuredClone(state.sessions[sid]) : null),
    getReport: async () => null,
    getEntitlement: async (sid) => state.payments.find((p) => p.sessionId === sid) || null,
    createEntitlement: async (rec) => { state.payments.push({ ...rec, consumed: false, createdAt: NOW.toISOString() }); return rec },
    createSession: async (sid, rec) => { state.sessions[sid] = { sessionId: sid, ...structuredClone(rec), startedAt: NOW.getTime() - 60000, completedAt: null } },
    updateSession: async (sid, patch) => { Object.assign(state.sessions[sid], structuredClone(patch)); return structuredClone(state.sessions[sid]) },
    // The real v1 store (isolated data dir) and the real assurance rule.
    ...legacySupportSources(store, { assuranceFor: (sid) => assuranceForSession(sid) }),
  }
  const audits = []
  const campus = createCampusContext({
    repos, clock: () => NOW, legacy, engine: fakeEngine(state), users: { findById: async (id) => Object.values(USERS).find((u) => u.id === id) || null },
    sliceEvaluator: createSliceEvaluator({
      complete: (params, options) => { judgeCalls.push(structuredClone(params)); return createCompletion(params, options) },
      recordUnit: (unit, tx) => evidenceGraph.recordEvidenceUnit(unit, tx),
    }),
    scenarioSource: async () => ({ generalScenarios: [], bankScenarios: draftBankScenarios() }),
    evidence: { units: (sid) => evidenceGraph.getEvidenceUnits(sid) },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
  })
  const requireUser = (req, _res, next) => {
    const user = USERS[req.get('x-test-user')]
    if (!user) return next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.'))
    req.user = user
    return next()
  }
  const adminAudits = []
  const asAdmin = (req, _res, next) => { req.admin = ADMINS[req.get('x-test-admin')] || null; req.requestId = 'req-p4-admin'; next() }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  app.use('/api/admin/report-reviews', asAdmin, createReportReviewsAdminRouter({ campus, audit: async (_req, e) => adminAudits.push(e) }))
  app.use('/api/admin/accommodation-requests', asAdmin, createAccommodationRequestsAdminRouter({ campus, audit: async (_req, e) => adminAudits.push(e) }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const workspaces = {}
  for (const [label, u] of Object.entries(USERS)) {
    const list = await campus.workspaceService.listWorkspaces(u)
    workspaces[label] = { campus: list.find((w) => w.type === 'CAMPUS_STUDENT').id, personal: list.find((w) => w.type === 'PERSONAL').id }
  }
  const call = async (who, method, path, body, headers = {}, ws = 'campus') => {
    const r = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(who ? { 'x-test-user': who, 'X-Prism-Workspace': workspaces[who][ws] } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) }
  }
  const admin = async (who, method, path, body) => {
    const r = await fetch(`${base}/api/admin${path}`, { method, headers: { ...(who ? { 'x-test-admin': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  await campus.catalog.ensureSeeded()
  await repos.entitlements.createEntitlement({ organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 20, validFrom: iso(-day), validUntil: iso(30 * day), status: 'ACTIVE' })
  async function assignment({ requestable = true } = {}) {
    const a = await repos.assessments.createAssignment({
      id: crypto.randomUUID(), definitionId: CORE_TEAMREADY_A.id, formPolicy: 'FIXED_FORM', formId: CORE_TEAMREADY_A_FORM_ID, sponsorType: 'INSTITUTION', organizationId: org.id,
      windowStart: iso(-day), windowEnd: iso(7 * day), integrityPolicy: 'STANDARD', accommodationsPolicy: requestable ? { requestable: true } : { requestable: false }, reminderPolicy: {},
      createdBy: 'owner', status: 'ACTIVE', targets: Object.values(USERS).map((u) => ({ targetType: 'USER', targetId: u.id })),
    })
    for (const u of Object.values(USERS)) await repos.assessments.addStudent({ assignmentId: a.id, userId: u.id, status: 'ASSIGNED' })
    for (const who of Object.keys(USERS)) await call(who, 'POST', `/assessment-assignments/${a.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true })
    return a
  }
  // A full universal run: start → begin → one answer → finish (the report is published).
  async function run(who, assignmentId, { answer = ANSWER } = {}) {
    const started = await call(who, 'POST', `/assessment-assignments/${assignmentId}/start`, { consent: CONSENT }, { 'Idempotency-Key': key('start') })
    assert.equal(started.status, 201, JSON.stringify(started.body))
    const sid = started.body.data.sessionId
    assert.equal((await call(who, 'POST', `/assessment-sessions/${sid}/begin`, {}, { 'Idempotency-Key': key('begin') })).status, 200)
    const sent = await call(who, 'POST', `/assessment-sessions/${sid}/messages`, { clientEventId: 'evt-p4-answer-0001', text: answer })
    assert.equal(sent.status, 201, JSON.stringify(sent.body))
    const fin = await call(who, 'POST', `/assessment-sessions/${sid}/finish`, { early: true })
    assert.equal(fin.status, 200, JSON.stringify(fin.body))
    return sid
  }
  return { repos, campus, state, audits, adminAudits, judgeCalls, call, admin, assignment, run, org, close: () => server.close() }
}

const ROUTES = (sid, aid) => [
  ['GET', `/assessment-sessions/${sid}/human-review`],
  ['POST', `/assessment-sessions/${sid}/human-review`, { reason: 'Please have a person look at my report.' }],
  ['GET', `/assessment-assignments/${aid}/accommodation`],
  ['POST', `/assessment-assignments/${aid}/accommodation`, { needs: NEEDS }],
  ['GET', `/assessment-sessions/${sid}/identity-check`],
  ['POST', `/assessment-sessions/${sid}/identity-check`, { level: 'L1', declaredName: 'Synthetic Student', confirm: true }],
  ['GET', '/me/support-requests'],
]

test('flag registered OFF; client-visible; every route 404s with the flag off and the existing P5.7 review path is unchanged', async () => {
  const entry = FLAG_CATALOGUE.find((f) => f.key === 'PRISM_V3_SUPPORT_ROUTES')
  assert.ok(entry, 'registered in lib/flagRegistry.js')
  assert.match(entry.dataGate, /HA-C001/, 'names the human flip')
  assert.ok(CAMPUS_FLAGS.includes('PRISM_V3_SUPPORT_ROUTES'), 'exposed to the client allow-list so the UI hides entry points while off')
  const w = await world()
  try {
    const a = await w.assignment()
    const sid = await w.run('student', a.id)
    await withFlag(false, async () => {
      for (const [method, path, body] of ROUTES(sid, a.id)) {
        const r = await w.call('student', method, path, body, { 'Idempotency-Key': key('off') })
        assert.equal(r.status, 404, `${method} ${path}`)
        assert.equal(r.body.error.code, 'NOT_FOUND')
      }
      assert.equal((await w.admin('manager', 'GET', '/accommodation-requests')).status, 404, 'the staff plane is dark too')
      // The P5.7 per-moment request (Report V3) behaves exactly as before.
      const moment = await w.call('student', 'POST', `/assessment-sessions/${sid}/report/review-request`, { category: 'INTERPRETATION', reason: 'This moment reads differently from what I meant.' })
      assert.equal(moment.status, 201, JSON.stringify(moment.body))
      assert.equal(moment.body.data.kind, 'MOMENT')
      assert.equal(moment.body.data.state, 'OPEN')
      // With the flag off, starting never touches a stored pre-start request.
      const b = await w.assignment()
      await w.repos.accommodationRequests.upsertRequest({ assignmentId: b.id, userId: USERS.student.id, organizationId: w.org.id, needs: NEEDS })
      const sid2 = await w.run('student', b.id)
      const row = await w.repos.accommodationRequests.getForAssignment(b.id, USERS.student.id)
      assert.equal(row.sessionId, null, 'not linked while dark')
      assert.equal(row.status, 'REQUESTED')
      assert.equal(await store.getAccommodation(sid2), null, 'no accommodation record written while dark')
    })
    // Shell off → 404 even with the support flag on.
    await withFlag(true, async () => {
      process.env.PRISM_APP_SHELL_V3 = 'false'
      try {
        assert.equal((await w.call('student', 'GET', `/assessment-sessions/${sid}/human-review`)).status, 404)
      } finally { process.env.PRISM_APP_SHELL_V3 = 'true' }
    })
  } finally { w.close() }
})

test('human review: one free review per assessment, idempotent while open, linked to the staff review queue, refused clearly after a decision', async () => {
  const w = await world()
  try {
    const a = await w.assignment()
    const sid = await w.run('student', a.id)
    await withFlag(true, async () => {
      const before = await w.call('student', 'GET', `/assessment-sessions/${sid}/human-review`)
      assert.equal(before.status, 200, JSON.stringify(before.body))
      assert.deepEqual(before.body.data.freeReview, { used: false, available: true })
      assert.equal(before.body.data.request, null)
      assert.deepEqual(before.body.data.turnaround, { targetBusinessDays: 7, guaranteed: false })
      assert.deepEqual(before.body.data.furtherReview, { offered: false }, 'no priced further review is invented')

      const path = `/assessment-sessions/${sid}/human-review`
      const body = { reason: 'The report does not reflect how I handled the missing owners.' }
      // Validation: Idempotency-Key required, strict body, bounded reason.
      const noKey = await w.call('student', 'POST', path, body)
      assert.equal(noKey.status, 428)
      assert.equal(noKey.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED')
      assert.equal((await w.call('student', 'POST', path, { ...body, priority: 'urgent' }, { 'Idempotency-Key': key() })).status, 422, 'unknown fields are rejected (.strict())')
      const short = await w.call('student', 'POST', path, { reason: 'bad' }, { 'Idempotency-Key': key() })
      assert.equal(short.status, 422)
      assert.equal(short.body.error.code, 'VALIDATION_FAILED')
      assert.ok(short.body.error.requestId !== undefined, 'ApiError envelope')
      // Owner-only: another student and the wrong workspace get 404.
      assert.equal((await w.call('other', 'POST', path, body, { 'Idempotency-Key': key() })).status, 404)
      assert.equal((await w.call('other', 'GET', path)).status, 404)
      assert.equal((await w.call('student', 'GET', path, null, {}, 'personal')).status, 404, 'a sponsored session is not visible from the personal workspace')

      const k = key('review')
      const created = await w.call('student', 'POST', path, body, { 'Idempotency-Key': k })
      assert.equal(created.status, 201, JSON.stringify(created.body))
      assert.equal(created.body.data.request.state, 'OPEN')
      assert.deepEqual(created.body.data.freeReview, { used: true, available: false })
      const replay = await w.call('student', 'POST', path, body, { 'Idempotency-Key': k })
      assert.equal(replay.status, 201)
      assert.equal(replay.headers.get('idempotent-replay'), 'true')
      assert.equal(replay.body.data.request.id, created.body.data.request.id)
      const again = await w.call('student', 'POST', path, { reason: 'Asking again with different words, same review.' }, { 'Idempotency-Key': key() })
      assert.equal(again.status, 200, 'idempotent while open (APPEALS policy)')
      assert.equal(again.body.data.request.id, created.body.data.request.id)
      // Two concurrent requests with different keys still leave one review.
      await Promise.all([1, 2].map(() => w.call('student', 'POST', path, body, { 'Idempotency-Key': key() })))
      const kinds = w.repos.db.reportReviewRequests.filter((r) => r.sessionId === sid)
      assert.equal(kinds.filter((r) => r.kind === 'HUMAN_REVIEW').length, 1, 'one free review per assessment')
      assert.ok(w.audits.some((e) => e.type === 'support.human_review.requested' && e.payload.reviewRequestId === created.body.data.request.id && e.payload.free === true))
      assert.ok(!JSON.stringify(w.audits).includes('missing owners'), 'the learner\'s reason is never written to an audit row')
      // The owner's report says a person is reviewing it.
      assert.equal((await w.call('student', 'GET', `/assessment-sessions/${sid}/report`)).body.data.review.pending, true)

      // Staff act on it in the existing review queue.
      const queue = await w.admin('manager', 'GET', '/report-reviews')
      assert.equal(queue.status, 200)
      const item = queue.body.items.find((i) => i.id === created.body.data.request.id)
      assert.ok(item, 'the free review is in the staff queue')
      assert.equal(item.kind, 'HUMAN_REVIEW')
      const decided = await w.admin('manager', 'POST', `/report-reviews/${item.id}/decide`, { decision: 'UPHOLD', reason: 'Private reviewer reasoning: the evidence supports the report.' })
      assert.equal(decided.status, 200, JSON.stringify(decided.body))

      const after = await w.call('student', 'GET', path)
      assert.equal(after.body.data.request.state, 'RESOLVED')
      assert.equal(after.body.data.request.outcome.decision, 'UPHOLD')
      assert.equal(after.body.data.request.outcome.explanation, REVIEW_OUTCOME_COPY.UPHOLD)
      assert.ok(!JSON.stringify(after.body).includes('Private reviewer reasoning'), 'reviewer reasoning stays private')

      const refused = await w.call('student', 'POST', path, body, { 'Idempotency-Key': key() })
      assert.equal(refused.status, 409)
      assert.equal(refused.body.error.code, 'REVIEW_ALREADY_USED')
      assert.match(refused.body.error.message, /free human review for this assessment has already been completed/)
      assert.deepEqual(refused.body.error.details.furtherReview, { offered: false })
      assert.ok(w.audits.some((e) => e.type === 'support.human_review.refused'))

      // Settings list: the caller's own reviews in this workspace only.
      const mine = await w.call('student', 'GET', '/me/support-requests')
      assert.equal(mine.status, 200)
      assert.equal(mine.body.data.humanReviews.length, 1)
      assert.equal(mine.body.data.humanReviews[0].sessionId, sid)
      assert.equal((await w.call('other', 'GET', '/me/support-requests')).body.data.humanReviews.length, 0)
    })
  } finally { w.close() }
})

test('human review: needs a published report; personal legacy sessions keep their own routes (404 here)', async () => {
  const w = await world()
  try {
    const a = await w.assignment()
    const started = await w.call('student', 'POST', `/assessment-assignments/${a.id}/start`, { consent: CONSENT }, { 'Idempotency-Key': key('start') })
    const sid = started.body.data.sessionId
    w.state.sessions['legacy-personal-0001'] = { sessionId: 'legacy-personal-0001', userId: USERS.student.id, scenarioId: 'x' }
    await withFlag(true, async () => {
      const notReady = await w.call('student', 'POST', `/assessment-sessions/${sid}/human-review`, { reason: 'Please review this assessment for me.' }, { 'Idempotency-Key': key() })
      assert.equal(notReady.status, 409)
      assert.equal(notReady.body.error.code, 'REPORT_NOT_READY')
      const status = await w.call('student', 'GET', `/assessment-sessions/${sid}/human-review`)
      assert.deepEqual(status.body.data.freeReview, { used: false, available: false })
      assert.equal((await w.call('student', 'GET', '/assessment-sessions/legacy-personal-0001/human-review', null, {}, 'personal')).status, 404)
      assert.equal((await w.call('student', 'GET', '/assessment-sessions/bad id/human-review')).status, 404)
    })
  } finally { w.close() }
})

test('accommodation: requested before the start, decided by a person, linked at start, refused after the start with honest copy', async () => {
  const w = await world()
  try {
    const a = await w.assignment()
    await withFlag(true, async () => {
      const path = `/assessment-assignments/${a.id}/accommodation`
      const empty = await w.call('student', 'GET', path)
      assert.equal(empty.status, 200, JSON.stringify(empty.body))
      assert.equal(empty.body.data.requestable, true)
      assert.equal(empty.body.data.request, null)
      assert.equal((await w.call('student', 'POST', path, { needs: NEEDS })).status, 428)
      assert.equal((await w.call('student', 'POST', path, { needs: NEEDS, diagnosis: 'x' }, { 'Idempotency-Key': key() })).status, 422, '.strict()')
      assert.equal((await w.call('student', 'POST', path, { needs: 'short' }, { 'Idempotency-Key': key() })).status, 422)
      assert.equal((await w.call('student', 'GET', '/assessment-assignments/not-an-id/accommodation')).status, 404)

      const created = await w.call('student', 'POST', path, { needs: NEEDS }, { 'Idempotency-Key': key('acc') })
      assert.equal(created.status, 201, JSON.stringify(created.body))
      assert.equal(created.body.data.request.status, 'REQUESTED')
      assert.equal(created.body.data.request.modes, null)
      const changed = await w.call('student', 'POST', path, { needs: `${NEEDS} Extra: larger text helps.` }, { 'Idempotency-Key': key('acc2') })
      assert.equal(changed.status, 200, 'the learner may change the text while it waits')
      assert.equal(changed.body.data.request.id, created.body.data.request.id)
      assert.ok(w.audits.some((e) => e.type === 'support.accommodation.requested'))
      assert.ok(w.audits.some((e) => e.type === 'support.accommodation.updated'))
      assert.ok(!JSON.stringify(w.audits).includes('visual impairment'), 'the needs text never reaches an audit row')
      // Another student sees nothing of it; their own request is separate.
      const theirs = await w.call('other', 'GET', path)
      assert.equal(theirs.body.data.request, null)

      // Staff plane: list without the needs text, audited detail, rules.
      assert.equal((await w.admin(null, 'GET', '/accommodation-requests')).status, 401)
      const list = await w.admin('reader', 'GET', '/accommodation-requests')
      assert.equal(list.status, 200)
      assert.equal(list.body.rows.length, 1)
      assert.ok(!JSON.stringify(list.body).includes('visual impairment'), 'the list never carries the needs text')
      const id = list.body.rows[0].id
      const detail = await w.admin('reader', 'GET', `/accommodation-requests/${id}`)
      assert.match(detail.body.accommodation.needs, /visual impairment/)
      assert.ok(w.adminAudits.some((e) => e.action === 'accommodation_viewed' && e.entityId === id))
      assert.equal((await w.admin('reader', 'POST', `/accommodation-requests/${id}/decide`, { approve: true, modes: { textOnly: true }, note: 'Approved: text only.' })).status, 403, 'deciding needs accommodations:manage')
      assert.equal((await w.admin('manager', 'POST', `/accommodation-requests/${id}/decide`, { approve: true, note: 'Approved without any mode.' })).status, 400)
      assert.equal((await w.admin('manager', 'POST', `/accommodation-requests/${id}/decide`, { approve: true, modes: { textOnly: true }, note: 'short' })).status, 400)
      const approved = await w.admin('manager', 'POST', `/accommodation-requests/${id}/decide`, { approve: true, modes: { textOnly: true, noCamera: true }, material: false, note: 'Approved: text-only, no camera; not material.' })
      assert.equal(approved.status, 200, JSON.stringify(approved.body))
      assert.equal(approved.body.status, 'APPROVED')
      assert.ok(w.audits.some((e) => e.type === 'accommodation_decided' && e.payload.approved === true), 'assessment audit plane')
      assert.ok(w.adminAudits.some((e) => e.action === 'accommodation_decided'), 'admin audit plane')
      assert.equal((await w.admin('manager', 'POST', `/accommodation-requests/${id}/decide`, { approve: false, note: 'Changing my mind later.' })).status, 409)

      const learner = await w.call('student', 'GET', path)
      assert.equal(learner.body.data.request.status, 'APPROVED')
      assert.deepEqual(learner.body.data.request.modes, { textOnly: true, noCamera: true, reducedProctoring: false })
      assert.equal(learner.body.data.request.material, undefined, 'the material judgement is internal')
      assert.equal(learner.body.data.request.decisionNote, undefined, 'the decision note is internal')
      const decidedAlready = await w.call('student', 'POST', path, { needs: NEEDS }, { 'Idempotency-Key': key() })
      assert.equal(decidedAlready.status, 409)
      assert.equal(decidedAlready.body.error.code, 'ACCOMMODATION_ALREADY_DECIDED')

      // The start links it and writes the approved decision on the session's
      // record (the activation path the engine reads).
      const started = await w.call('student', 'POST', `/assessment-assignments/${a.id}/start`, { consent: CONSENT }, { 'Idempotency-Key': key('start') })
      assert.equal(started.status, 201)
      const sid = started.body.data.sessionId
      const record = await store.getAccommodation(sid)
      assert.equal(record.status, 'approved')
      assert.deepEqual(record.modes, { textOnly: true, noCamera: true, reducedProctoring: false })
      assert.equal(record.material, false)
      assert.equal(record.decidedBy, ADMINS.manager.id)
      const linked = await w.call('student', 'GET', path)
      assert.equal(linked.body.data.request.linkedToSession, true)
      assert.equal(linked.body.data.requestable, false)
      assert.equal(linked.body.data.reason, 'ALREADY_STARTED')
      assert.ok(w.audits.some((e) => e.type === 'support.accommodation.linked' && e.sid === sid && e.payload.status === 'APPROVED'))
      const late = await w.call('student', 'POST', path, { needs: NEEDS }, { 'Idempotency-Key': key() })
      assert.equal(late.status, 409)
      assert.equal(late.body.error.code, 'ASSESSMENT_ALREADY_STARTED')
      assert.match(late.body.error.message, /arranged before an assessment starts/)
      assert.match(late.body.error.message, /human review/)
      assert.ok(w.audits.some((e) => e.type === 'support.accommodation.refused' && e.payload.reason === 'ASSESSMENT_ALREADY_STARTED'))

      // A request still waiting at the start lapses (the session runs the
      // standard administration) and can no longer be decided.
      const b = await w.assignment()
      const pending = await w.call('student', 'POST', `/assessment-assignments/${b.id}/accommodation`, { needs: NEEDS }, { 'Idempotency-Key': key() })
      const startedB = await w.call('student', 'POST', `/assessment-assignments/${b.id}/start`, { consent: CONSENT }, { 'Idempotency-Key': key('start') })
      assert.equal(startedB.status, 201)
      assert.equal((await w.call('student', 'GET', `/assessment-assignments/${b.id}/accommodation`)).body.data.request.status, 'LAPSED')
      assert.equal(await store.getAccommodation(startedB.body.data.sessionId), null, 'nothing activates for an undecided request')
      const lapsed = await w.admin('manager', 'POST', `/accommodation-requests/${pending.body.data.request.id}/decide`, { approve: true, modes: { textOnly: true }, note: 'Too late to apply this one.' })
      assert.equal(lapsed.status, 409)
      assert.equal(lapsed.body.reason, 'SESSION_STARTED')

      // An assignment whose institution did not switch requests on.
      const c = await w.assignment({ requestable: false })
      const off = await w.call('student', 'POST', `/assessment-assignments/${c.id}/accommodation`, { needs: NEEDS }, { 'Idempotency-Key': key() })
      assert.equal(off.status, 409)
      assert.equal(off.body.error.code, 'ACCOMMODATIONS_NOT_REQUESTABLE')

      // Settings: the caller's own requests in this workspace.
      const mine = await w.call('student', 'GET', '/me/support-requests')
      assert.equal(mine.body.data.accommodations.length, 2)
      assert.equal((await w.call('student', 'GET', '/me/support-requests', null, {}, 'personal')).body.data.accommodations.length, 0)
    })
  } finally { w.close() }
})

// Normalise run-specific identifiers so two runs can be compared exactly.
const normalise = (v, ids) => {
  let s = JSON.stringify(v)
  for (const id of ids) s = s.split(id).join('<SESSION>')
  // Evidence ids are content hashes that include the session id.
  return JSON.parse(s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>').replace(/ev-[0-9a-f]{16,}/g, '<EVIDENCE_ID>'))
}

test('an approved accommodation never changes judging: identical evaluator inputs, evidence and report with and without it', async () => {
  const withAcc = await world()
  const without = await world()
  try {
    await withFlag(true, async () => {
      const a1 = await withAcc.assignment()
      const req = await withAcc.call('student', 'POST', `/assessment-assignments/${a1.id}/accommodation`, { needs: NEEDS }, { 'Idempotency-Key': key() })
      const ok = await withAcc.admin('manager', 'POST', `/accommodation-requests/${req.body.data.request.id}/decide`, { approve: true, modes: { textOnly: true, noCamera: true, reducedProctoring: true }, material: true, note: 'Approved: all three modes; material.' })
      assert.equal(ok.status, 200)
      const sidA = await withAcc.run('student', a1.id)
      assert.equal((await store.getAccommodation(sidA)).status, 'approved', 'the accommodation is active on this session')
      const a2 = await without.assignment()
      const sidB = await without.run('student', a2.id)
      assert.equal(await store.getAccommodation(sidB), null)

      assert.ok(withAcc.judgeCalls.length > 0, 'the evaluator ran')
      assert.deepEqual(normalise(withAcc.judgeCalls, [sidA]), normalise(without.judgeCalls, [sidB]), 'byte-identical model inputs')
      const judged = JSON.stringify(withAcc.judgeCalls)
      for (const leak of ['visual impairment', 'textOnly', 'noCamera', 'reducedProctoring', 'accommodation', 'alternate']) assert.ok(!judged.includes(leak), `the judge never sees "${leak}"`)
      const unitsOf = async (sid) => (await evidenceGraph.getEvidenceUnits(sid)).map((u) => ({ cap: u.capability_id, status: u.evidence_status, level: u.rubric_level, behaviour: u.provenance_json?.behaviourId ?? null, excerpt: u.candidate_action_json?.dialogue_excerpt ?? null }))
        .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
      assert.deepEqual(await unitsOf(sidA), await unitsOf(sidB), 'same evidence, same levels')
      const reportOf = async (w, sid) => {
        const r = await w.call('student', 'GET', `/assessment-sessions/${sid}/report`)
        assert.equal(r.status, 200, JSON.stringify(r.body))
        return normalise({ summary: r.body.data.report.summary, moments: r.body.data.report.moments, development: r.body.data.report.development, administration: r.body.data.report.administration ?? null }, [sid])
      }
      assert.deepEqual(await reportOf(withAcc, sidA), await reportOf(without, sidB), 'same report findings')
    })
  } finally { withAcc.close(); without.close() }
})

test('judging code never reads accommodation data (static ratchet over the evaluator, scoring and AI paths)', () => {
  const dirs = ['scoring', 'engine', 'services', 'domain/evidence', 'prompts']
  const files = ['lib/judgePanel.js', 'lib/scoreAggregator.js', 'lib/microRater.js', 'domain/assessments/evaluationWorker.js']
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) walk(abs, out)
      else if (/\.(m?js|json|txt|md)$/.test(name)) out.push(abs)
    }
    return out
  }
  const all = [...dirs.flatMap((d) => walk(join(SERVER_ROOT, d))), ...files.map((f) => join(SERVER_ROOT, f)).filter((f) => { try { return statSync(f).isFile() } catch { return false } })]
  assert.ok(all.length > 20)
  const hits = all.filter((f) => /accommodation|administrationMode|alternate administration/i.test(readFileSync(f, 'utf8'))).map((f) => relative(SERVER_ROOT, f))
  assert.deepEqual(hits, [])
  // In the frozen engine the mode is set at /start, stored on the session and
  // read once more only for the charter's report disclosure sentence.
  const engine = readFileSync(join(SERVER_ROOT, 'routes/assessment.js'), 'utf8')
  assert.equal((engine.match(/administrationMode/g) || []).length, 8, 'no new use of the mode in the frozen engine')
})

test('identity check: Level 1 self-declaration only, minimal record, Level 2 by the institution, Level 3 not offered', async () => {
  const w = await world()
  try {
    const a = await w.assignment()
    const sid = await w.run('student', a.id)
    await withFlag(true, async () => {
      const path = `/assessment-sessions/${sid}/identity-check`
      const status = await w.call('student', 'GET', path)
      assert.equal(status.status, 200, JSON.stringify(status.body))
      assert.equal(status.body.data.current.level, 'L1')
      const byLevel = Object.fromEntries(status.body.data.options.map((o) => [o.level, o]))
      assert.equal(byLevel.L1.available, true)
      assert.equal(byLevel.L2.available, false)
      assert.equal(byLevel.L2.reason, 'INSTITUTION_RECORDS_THIS')
      assert.equal(byLevel.L3.available, false)
      assert.equal(byLevel.L3.reason, 'NOT_OFFERED')
      assert.equal((await w.call('other', 'GET', path)).status, 404)

      const l3 = await w.call('student', 'POST', path, { level: 'L3', confirm: true }, { 'Idempotency-Key': key() })
      assert.equal(l3.status, 409)
      assert.equal(l3.body.error.code, 'IDENTITY_LEVEL_NOT_AVAILABLE')
      assert.equal(l3.body.error.details.reason, 'NOT_OFFERED')
      const l2 = await w.call('student', 'POST', path, { level: 'L2', confirm: true }, { 'Idempotency-Key': key() })
      assert.equal(l2.body.error.details.reason, 'INSTITUTION_RECORDS_THIS')
      assert.ok(w.audits.filter((e) => e.type === 'support.identity.refused').length === 2)
      // Document numbers are never accepted (.strict()), and confirm is required.
      assert.equal((await w.call('student', 'POST', path, { level: 'L1', declaredName: 'Synthetic Student', confirm: true, aadhaarLast4: '1234' }, { 'Idempotency-Key': key() })).status, 422)
      assert.equal((await w.call('student', 'POST', path, { level: 'L1', declaredName: 'Synthetic Student' }, { 'Idempotency-Key': key() })).status, 422)
      assert.equal((await w.call('student', 'POST', path, { level: 'L1', declaredName: 'Synthetic Student', confirm: true })).status, 428)

      const declared = await w.call('student', 'POST', path, { level: 'L1', declaredName: '  synthetic   STUDENT ', confirm: true }, { 'Idempotency-Key': key() })
      assert.equal(declared.status, 201, JSON.stringify(declared.body))
      assert.equal(declared.body.data.selfDeclaration.recorded, true)
      assert.equal(declared.body.data.selfDeclaration.nameMatchesAccount, true)
      assert.equal(declared.body.data.current.level, 'L1', 'a self-declaration is Level 1')
      const record = await store.getVerification(sid)
      assert.equal(record.status, 'self_declared')
      assert.equal(record.fullName, 'synthetic STUDENT')
      for (const field of ['aadhaarLast4', 'dob', 'fathersName', 'rollNumber', 'college']) assert.ok(!record[field], `${field} is not collected`)
      assert.deepEqual(record.meta, { source: 'api_v1', level: 'L1' }, 'no IP address or device data')
      assert.equal((await w.call('student', 'POST', path, { level: 'L1', declaredName: 'Someone Else', confirm: true }, { 'Idempotency-Key': key() })).status, 200, 'write-once: the first declaration stands')
      assert.equal((await store.getVerification(sid)).fullName, 'synthetic STUDENT')
      assert.ok(w.audits.some((e) => e.type === 'support.identity.declared' && !JSON.stringify(e.payload).includes('synthetic')), 'audited without the name')

      // Even with the gated L3 flag on, a self-declaration never reads as L3.
      process.env.PRISM_IDENTITY_L3 = 'true'
      try {
        assert.equal((await w.call('student', 'GET', path)).body.data.current.level, 'L1')
      } finally { delete process.env.PRISM_IDENTITY_L3 }
    })
  } finally { w.close() }
})
