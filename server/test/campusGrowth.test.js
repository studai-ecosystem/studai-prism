// C9.02–C9.05, C9.07 — reassessment + growth over the real /api/v1 handlers
// with memory repositories. Proves: every form pair starts PENDING and nothing
// is approved automatically; APPROVED needs evidence and a second approval;
// no growth change appears for an unapproved pair or without SUFFICIENT
// evidence in both sessions (API); snapshots are written once and audited;
// reassessment cycles are scoped per role and roster the baseline cohorts;
// campus outcomes are comparable-only with small groups suppressed.
// Synthetic users, sessions and decisions only.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { PRIMARY_CAPABILITY_IDS, buildCatalog, CORE_DEFINITION_ID } from '../domain/assessments/catalog.js'
import { buildStudentReportV3, reportContentHash, REPORT_V3_BUILDER_VERSION } from '../domain/reports/v3/build.js'
import { assertReportSafe } from '../domain/reports/v3/schema.js'
import { compareCapability, choosePair, canonicalPair } from '../domain/growth/snapshot.js'
import { createGrowthService } from '../domain/growth/service.js'
import { createSessionEntryLoader } from '../domain/growth/entries.js'

// Enabled inside this test process only (K2).
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_GROWTH_ENABLED = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'

const SCENARIOS = { generalScenarios: [{ id: 'syn-growth-a' }, { id: 'syn-growth-b' }], bankScenarios: {} }
const FORM_A = 'prism-workplace-core:syn-growth-a:1.0.0'
const FORM_B = 'prism-workplace-core:syn-growth-b:1.0.0'
const CAP = PRIMARY_CAPABILITY_IDS[0]
const u = (id, name) => ({ id, email: `${id}@test.local`, name })
const USERS = {
  owner: u('owner-g', 'Synthetic Owner'),
  officer: u('officer-g', 'Synthetic Officer'),
  coordinator: u('coord-g', 'Synthetic Coordinator'),
  mentor: u('mentor-g', 'Synthetic Mentor'),
  s1: u('student-g1', 'Student One'),
  p1: u('personal-g1', 'Personal Student'),
}

// Two personal sessions (baseline syn-growth-a, later syn-growth-b), issued reports.
const SESSIONS = {
  'sess-g-1': { userId: USERS.p1.id, scenarioId: 'syn-growth-a', startedAt: '2026-09-01T09:00:00Z', completedAt: '2026-09-01T10:00:00Z' },
  'sess-g-2': { userId: USERS.p1.id, scenarioId: 'syn-growth-b', startedAt: '2026-10-01T09:00:00Z', completedAt: '2026-10-01T10:00:00Z' },
}
const HELD = new Set()
const legacy = {
  listEntitlements: async () => [],
  listSessionIds: async (userId) => Object.entries(SESSIONS).filter(([, s]) => s.userId === userId).map(([id]) => id),
  getSession: async (id) => (SESSIONS[id] ? { ...SESSIONS[id], history: [] } : null),
  getReport: async (id) => (SESSIONS[id] ? { userId: SESSIONS[id].userId, issuedAt: SESSIONS[id].completedAt } : null),
  getEntitlement: async () => null,
  createEntitlement: async () => null,
  adminState: async (id) => (HELD.has(id) ? { invalid: false, reviewState: 'held' } : null),
  paths: { purchase: '/payment', start: () => '/', resume: () => '/', report: () => '/' },
}

async function world({ publishedSnapshots = true } = {}) {
  let now = new Date('2026-10-10T09:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic Growth University', slug: 'syn-growth-u', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const d1 = await repos.organizations.createDepartment({ organizationId: org.id, name: 'Commerce' })
  const d2 = await repos.organizations.createDepartment({ organizationId: org.id, name: 'Engineering' })
  const cohortA = await repos.organizations.createCohort({ organizationId: org.id, departmentId: d1.id, name: 'Commerce 2027' })
  const m = (userId, role, extra = {}) => repos.memberships.upsertMembership({ organizationId: org.id, userId, role, status: 'ACTIVE', ...extra })
  await m(USERS.owner.id, 'ORG_OWNER')
  await m(USERS.officer.id, 'PLACEMENT_OFFICER', { scope: { cohortIds: [cohortA.id] } })
  await m(USERS.coordinator.id, 'DEPARTMENT_COORDINATOR', { departmentId: d2.id })
  await m(USERS.mentor.id, 'FACULTY_MENTOR', { scope: { cohortIds: [cohortA.id] } })
  await m(USERS.s1.id, 'STUDENT')
  await repos.organizations.addCohortMember({ cohortId: cohortA.id, userId: USERS.s1.id })
  const byId = new Map(Object.values(USERS).map((x) => [x.id, x]))
  const audits = []
  const campus = createCampusContext({
    repos, clock: () => now, legacy, scenarioSource: async () => SCENARIOS,
    users: { findById: async (id) => byId.get(id) || null, findByEmail: async (e) => [...byId.values()].find((x) => x.email === e) || null },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
  })
  // Synthetic published-state fixtures have known allocated forms and no
  // judged evidence. They do not reinterpret or migrate an unsupported run.
  if (publishedSnapshots) {
    const definition = buildCatalog(SCENARIOS).definitions.find((d) => d.id === CORE_DEFINITION_ID)
    for (const [sessionId, session] of Object.entries(SESSIONS)) {
      const allocation = {
        fixture: 'campus-growth-published-snapshot', methodVersion: 'synthetic-growth-allocation.v1',
        scenarioId: session.scenarioId, scenarioVersion: '1.0.0',
        formId: session.scenarioId === 'syn-growth-a' ? FORM_A : FORM_B,
        measures: [...PRIMARY_CAPABILITY_IDS], evidenceIds: [],
      }
      const report = assertReportSafe(buildStudentReportV3({
        sessionId, definition, formId: allocation.formId, units: [], turns: [],
        header: { assessmentTitle: definition.title, completedAt: session.completedAt, scope: 'PERSONAL' },
      }))
      await repos.sessionIo.putClientEvent({ sessionId, clientEventId: 'start', kind: 'START', response: { fixtureAllocationArchive: allocation } })
      await repos.reportVersions.append({
        sessionId, version: 1, contentHash: reportContentHash(report), builderVersion: REPORT_V3_BUILDER_VERSION,
        report, issuedAt: session.completedAt, reason: 'INITIAL',
      })
    }
  }
  const requireUser = (req, _res, next) => {
    const user = USERS[req.get('x-test-user')]
    if (!user) return next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.'))
    req.user = user
    return next()
  }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = async (who, method, path, body, headers = {}) => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { ...(who ? { 'x-test-user': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  return { repos, org, cohortA, campus, audits, call, setNow: (d) => { now = d }, close: () => server.close() }
}
const o = (w, p = '') => `/organizations/${w.org.id}${p}`
const WINDOW = { windowStart: '2026-10-10T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z' }
const LATER = { windowStart: '2026-12-01T08:00:00.000Z', windowEnd: '2026-12-15T18:00:00.000Z' }

// Synthetic decisions (clearly not real evidence): a capability at a band.
const decision = (band, status = 'SUFFICIENT') => ({ status, level: { band, label: band }, rulesVersion: 'rules-synthetic', consideredUnitIds: ['u-syn'], unitIds: ['u-syn'] })
const entry = (sessionId, completedAt, formId, band, status) => ({
  session: { sessionId, completedAt }, definition: { title: 'Synthetic assessment', measures: [CAP] }, form: { id: formId, version: '1.0.0' },
  decisions: band ? { [CAP]: decision(band, status) } : {},
})

test('growth legacy-only fixture: original histories remain reachable but unsupported allocations produce no V3 comparison', async () => {
  const w = await world({ publishedSnapshots: false })
  try {
    for (const [sessionId, session] of Object.entries(SESSIONS)) await w.repos.sessionIo.putClientEvent({
      sessionId, clientEventId: 'start', kind: 'START',
      response: { runPin: { scenarioId: session.scenarioId, methodVersion: 'unsupported-historical-method', snapshotVersion: 'unsupported-old-allocation' } },
    })
    await w.campus.growth.decide({ formAId: FORM_A, formBId: FORM_B, status: 'APPROVED', evidenceRef: 'equating-run-9', reason: 'Equating run frozen and reviewed', decidedBy: 'adm-2', approvalId: 'appr-2' })
    const history = await w.call('p1', 'GET', '/me/history')
    assert.deepEqual(history.body.data.items.map((item) => item.sourceId).sort(), ['sess-g-1', 'sess-g-2'])
    assert.ok(history.body.data.items.every((item) => item.status === 'COMPLETED'))
    const growth = (await w.call('p1', 'GET', '/me/growth')).body.data
    assert.equal(growth.comparable, false)
    assert.equal(growth.reason, 'NEEDS_COMPARABLE_REASSESSMENT')
    assert.deepEqual(growth.assessments, [])
    assert.deepEqual(growth.changes, [])
    const originals = await Promise.all(Object.keys(SESSIONS).map((id) => legacy.getReport(id)))
    await assert.rejects(w.campus.reports.publish('sess-g-1'), { code: 'PINNED_METHOD_UNAVAILABLE' })
    assert.deepEqual(await Promise.all(Object.keys(SESSIONS).map((id) => legacy.getReport(id))), originals)
    assert.equal(w.repos.db.reportVersions.length, 0)
    assert.equal((await w.repos.growth.listSnapshots({ userId: USERS.p1.id })).length, 0)
    for (const item of history.body.data.items) {
      assert.equal(item.permittedAction.to, legacy.paths.report(item.sourceId, false), 'no-snapshot histories retain the original report reader')
      assert.notEqual(item.reportFormat, 'V3')
    }
  } finally { w.close() }
})

test('flag off: reassessment and growth analytics routes are dark; /me/growth keeps the not-comparable shape', async () => {
  const w = await world()
  try {
    process.env.PRISM_GROWTH_ENABLED = 'false'
    assert.equal((await w.call('owner', 'GET', o(w, '/reassessments'))).status, 404)
    assert.equal((await w.call('owner', 'GET', o(w, '/analytics/growth'))).status, 404)
    const g = await w.call('p1', 'GET', '/me/growth')
    assert.equal(g.status, 200)
    assert.equal(g.body.data.comparable, false)
    assert.equal(g.body.data.reason, 'FORMS_NOT_VALIDATED_FOR_COMPARISON')
    assert.equal(g.body.data.growthEnabled, false)
    assert.deepEqual(g.body.data.changes, [])
  } finally {
    process.env.PRISM_GROWTH_ENABLED = 'true'
    w.close()
  }
})

test('equivalence registry: every pair starts PENDING; APPROVED needs evidence and a second approval; decisions are kept', async () => {
  const w = await world()
  try {
    const g = w.campus.growth
    const pairs = await g.registry()
    assert.deepEqual(pairs.map((p) => [p.formA.id, p.formB.id, p.status]), [[FORM_A, FORM_A, 'PENDING'], [FORM_A, FORM_B, 'PENDING'], [FORM_B, FORM_B, 'PENDING']], 'nothing is approved automatically')
    await assert.rejects(g.decide({ formAId: FORM_B, formBId: FORM_A, status: 'APPROVED', evidenceRef: 'study-7', reason: 'Equating study passed', decidedBy: 'adm-1' }), /second administrator/)
    await assert.rejects(g.decide({ formAId: FORM_B, formBId: FORM_A, status: 'APPROVED', evidenceRef: '', reason: 'Equating study passed', decidedBy: 'adm-1', approvalId: 'appr-1' }), /Cite the evidence/)
    await assert.rejects(g.decide({ formAId: FORM_B, formBId: FORM_A, status: 'APPROVED', evidenceRef: 'study-7', reason: 'short', decidedBy: 'adm-1', approvalId: 'appr-1' }), /specific reason/)
    await assert.rejects(g.decide({ formAId: FORM_A, formBId: 'not-a-form', status: 'REJECTED', evidenceRef: 'study-7', reason: 'Not the same construct', decidedBy: 'adm-1' }), (e) => e.code === 'NOT_FOUND')
    const rej = await g.decide({ formAId: FORM_B, formBId: FORM_A, status: 'REJECTED', evidenceRef: 'dif-run-3', reason: 'Scenario difficulty differs too much', decidedBy: 'adm-1' })
    assert.equal(rej.after.status, 'REJECTED')
    const ok = await g.decide({ formAId: FORM_A, formBId: FORM_B, status: 'APPROVED', evidenceRef: 'equating-run-9', reason: 'Equating run frozen and reviewed', decidedBy: 'adm-2', approvalId: 'appr-2' })
    assert.equal(ok.after.status, 'APPROVED')
    const { formAId, formBId } = canonicalPair(FORM_B, FORM_A)
    assert.deepEqual((await w.repos.growth.listDecisions(formAId, formBId)).map((d) => d.status), ['REJECTED', 'APPROVED'])
    assert.deepEqual(w.audits.filter((e) => e.type === 'growth.equivalence.decided').map((e) => e.payload.to), ['REJECTED', 'APPROVED'])
  } finally { w.close() }
})

test('growth: no change without an APPROVED pair or without SUFFICIENT evidence in both; snapshots written once', async () => {
  const w = await world()
  try {
    // Unapproved pair → no delta anywhere in the API.
    let g = await w.call('p1', 'GET', '/me/growth')
    assert.equal(g.body.data.comparable, false)
    assert.equal(g.body.data.reason, 'FORMS_NOT_VALIDATED_FOR_COMPARISON')
    assert.equal(g.body.data.comparison, null)
    assert.deepEqual(g.body.data.changes, [])
    assert.deepEqual(g.body.data.assessments.map((a) => a.form.id), [FORM_B, FORM_A])

    // Approved pair, but the stored evidence is not SUFFICIENT → still no change.
    await w.campus.growth.decide({ formAId: FORM_A, formBId: FORM_B, status: 'APPROVED', evidenceRef: 'equating-run-9', reason: 'Equating run frozen and reviewed', decidedBy: 'adm-2', approvalId: 'appr-2' })
    g = await w.call('p1', 'GET', '/me/growth')
    assert.equal(g.body.data.comparable, false)
    assert.equal(g.body.data.reason, 'EVIDENCE_NOT_SUFFICIENT_FOR_COMPARISON')
    assert.equal(g.body.data.comparison.baseline.sessionId, 'sess-g-1')
    assert.equal(g.body.data.comparison.formPair.status, 'APPROVED')
    assert.ok(g.body.data.changes.every((c) => c.comparable === false && !('direction' in c)))
    assert.equal((await w.repos.growth.listSnapshots({ userId: USERS.p1.id })).length, 0)

    // Synthetic SUFFICIENT decisions on the approved pair → a level-label change.
    const svc = w.campus.growth
    const entries = [entry('s-2', '2026-10-01T10:00:00.000Z', FORM_B, 'DEMONSTRATED'), entry('s-1', '2026-09-01T10:00:00.000Z', FORM_A, 'DEVELOPING')]
    const first = await svc.growthFor(USERS.p1, { type: 'PERSONAL' }, entries)
    assert.equal(first.comparable, true)
    assert.deepEqual(first.changes.map((c) => [c.capabilityId, c.from.band, c.to.band, c.direction, c.uncertainty, c.uncertaintyStatus]), [[CAP, 'DEVELOPING', 'DEMONSTRATED', 'HIGHER', null, 'NOT_VALIDATED']])
    assert.ok(!/"score"|"delta"|percent|"points"/i.test(JSON.stringify(first)), 'a level-label change, never a score')
    await svc.growthFor(USERS.p1, { type: 'PERSONAL' }, entries)
    assert.equal((await w.repos.growth.listSnapshots({ userId: USERS.p1.id })).length, 1, 'snapshot written once')
    assert.equal(w.audits.filter((e) => e.type === 'growth.snapshot.created').length, 1)

    // One side PROVISIONAL → not comparable; a REJECTED pair → not paired.
    const provisional = await svc.growthFor(USERS.p1, { type: 'PERSONAL' }, [entries[0], entry('s-1', '2026-09-01T10:00:00.000Z', FORM_A, 'DEVELOPING', 'PROVISIONAL')])
    assert.equal(provisional.comparable, false)
    assert.equal(provisional.changes[0].reason, 'EVIDENCE_NOT_SUFFICIENT_IN_BOTH')
    await svc.decide({ formAId: FORM_A, formBId: FORM_B, status: 'REJECTED', evidenceRef: 'dif-run-4', reason: 'Later review found DIF on one form', decidedBy: 'adm-3' })
    const rejected = await svc.growthFor(USERS.p1, { type: 'PERSONAL' }, entries)
    assert.equal(rejected.reason, 'FORMS_NOT_VALIDATED_FOR_COMPARISON')
    assert.deepEqual(rejected.changes, [])
  } finally { w.close() }
})

test('held or invalidated sessions are never compared', async () => {
  const w = await world()
  try {
    await w.campus.growth.decide({ formAId: FORM_A, formBId: FORM_B, status: 'APPROVED', evidenceRef: 'equating-run-9', reason: 'Equating run frozen and reviewed', decidedBy: 'adm-2', approvalId: 'appr-2' })
    HELD.add('sess-g-2')
    const g = await w.call('p1', 'GET', '/me/growth')
    assert.equal(g.body.data.reason, 'NEEDS_COMPARABLE_REASSESSMENT', 'the held session is not a formal reassessment')
    assert.deepEqual(g.body.data.assessments.map((a) => a.sessionId), ['sess-g-1'])
    const load = createSessionEntryLoader({ catalog: w.campus.catalog, evidence: { units: async () => [] }, legacy })
    assert.equal(await load('sess-g-2'), null, 'held → not loaded for campus outcomes either')
    assert.equal(await load('no-such-session'), null, 'no issued report → not loaded')
    assert.equal((await load('sess-g-1')).form.id, FORM_A)
  } finally {
    HELD.clear()
    w.close()
  }
})

test('comparison rules: sufficiency, rules version and pairing are all required', () => {
  assert.equal(compareCapability(null, decision('STRONG')).reason, 'NOT_MEASURED_IN_BOTH')
  assert.equal(compareCapability(decision('EARLY', 'PROVISIONAL'), decision('STRONG')).reason, 'EVIDENCE_NOT_SUFFICIENT_IN_BOTH')
  assert.equal(compareCapability({ ...decision('EARLY'), rulesVersion: 'r1' }, { ...decision('STRONG'), rulesVersion: 'r2' }).reason, 'DIFFERENT_EVIDENCE_RULES')
  assert.equal(compareCapability(decision('STRONG'), decision('DEVELOPING')).direction, 'LOWER')
  assert.equal(compareCapability(decision('DEMONSTRATED'), decision('DEMONSTRATED')).direction, 'SAME')
  assert.equal(choosePair([entry('x', '2026-10-01', FORM_B, 'EARLY')], new Map()).reason, 'NEEDS_COMPARABLE_REASSESSMENT')
  assert.equal(choosePair([entry('x', '2026-10-01', FORM_B), { ...entry('y', '2026-09-01', FORM_A), form: null }], new Map([['a|b', {}]])).reason, 'NEEDS_COMPARABLE_REASSESSMENT', 'a session without a known form never pairs')
})

test('reassessment cycles: scoped per role, roster the baseline cohorts, close the assignment, audited', async () => {
  const w = await world()
  try {
    const cat = await w.call('owner', 'GET', o(w, '/assessment-catalog'))
    const baseline = await w.call('owner', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohortA.id], ...WINDOW })
    assert.equal(baseline.status, 201)
    const body = { name: 'December reassessment', baselineAssignmentId: baseline.body.data.id, ...LATER }
    assert.equal((await w.call('mentor', 'POST', o(w, '/reassessments'), body)).status, 404)
    assert.equal((await w.call('coordinator', 'POST', o(w, '/reassessments'), body)).status, 403, 'not another department\'s cohorts')
    assert.equal((await w.call('owner', 'POST', o(w, '/reassessments'), { ...body, windowStart: '2026-10-01T08:00:00.000Z' })).status, 422, 'must open after the baseline')
    assert.equal((await w.call('owner', 'POST', o(w, '/reassessments'), { ...body, baselineAssignmentId: 'unknown-assignment' })).status, 422)
    const created = await w.call('officer', 'POST', o(w, '/reassessments'), body)
    assert.equal(created.status, 201)
    const c = created.body.data
    assert.equal(c.status, 'SCHEDULED')
    assert.equal(c.rostered, 1)
    assert.equal(c.comparability, 'PENDING', 'staff are told the forms are not yet approved')
    assert.deepEqual(c.cohortIds, [w.cohortA.id])

    // Mentors (ASSIGNED) read; a coordinator of another department sees nothing.
    assert.deepEqual((await w.call('mentor', 'GET', o(w, '/reassessments'))).body.data.items.map((x) => x.id), [c.id])
    assert.deepEqual((await w.call('coordinator', 'GET', o(w, '/reassessments'))).body.data.items, [])
    assert.equal((await w.call('coordinator', 'GET', o(w, `/reassessments/${c.id}`))).status, 404)

    // The student is rostered and sees the reassessment in their campus growth view.
    const ws = (await w.campus.workspaceService.listWorkspaces(USERS.s1)).find((x) => x.type === 'CAMPUS_STUDENT')
    const g = await w.call('s1', 'GET', '/me/growth', undefined, { 'X-Prism-Workspace': ws.id })
    assert.deepEqual(g.body.data.reassessments.map((r) => [r.id, r.assignmentId, r.status]), [[c.id, c.reassessment.assignmentId, 'SCHEDULED']])
    assert.equal((await w.call('p1', 'GET', '/me/growth')).body.data.reassessments.length, 0, 'personal workspace has none')

    assert.equal((await w.call('mentor', 'POST', o(w, `/reassessments/${c.id}/status`), { status: 'CANCELLED' })).status, 404)
    assert.equal((await w.call('coordinator', 'POST', o(w, `/reassessments/${c.id}/status`), { status: 'CANCELLED' })).status, 404, 'not another department\'s reassessment')
    assert.equal((await w.repos.growth.getCycle(c.id)).status, 'SCHEDULED')
    const cancelled = await w.call('owner', 'POST', o(w, `/reassessments/${c.id}/status`), { status: 'CANCELLED' })
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.body.data.status, 'CANCELLED')
    assert.equal((await w.repos.assessments.getAssignment(c.reassessment.assignmentId)).status, 'CANCELLED')
    assert.equal((await w.call('owner', 'POST', o(w, `/reassessments/${c.id}/status`), { status: 'CLOSED' })).status, 409)
    const log = await w.repos.campusAdmin.listOrgAudit(w.org.id)
    assert.ok(['reassessment.created', 'reassessment.cancelled'].every((a) => log.some((e) => e.action === a)))
    assert.ok(w.audits.some((e) => e.type === 'campus.reassessment.created'))
  } finally { w.close() }
})

test('campus growth outcomes: comparable only, small groups suppressed whole, scoped roles count only their cohorts', async () => {
  const w = await world()
  try {
    // Ten more synthetic students in the cohort, and a second cohort outside the officer's reach.
    const extra = Array.from({ length: 10 }, (_, i) => `student-gx${i}`)
    for (const id of extra) {
      await w.repos.memberships.upsertMembership({ organizationId: w.org.id, userId: id, role: 'STUDENT', status: 'ACTIVE' })
      await w.repos.organizations.addCohortMember({ cohortId: w.cohortA.id, userId: id })
    }
    const cohortC = await w.repos.organizations.createCohort({ organizationId: w.org.id, name: 'Commerce 2028' })
    const others = Array.from({ length: 10 }, (_, i) => `student-gy${i}`)
    for (const id of others) {
      await w.repos.memberships.upsertMembership({ organizationId: w.org.id, userId: id, role: 'STUDENT', status: 'ACTIVE' })
      await w.repos.organizations.addCohortMember({ cohortId: cohortC.id, userId: id })
    }
    const cat = await w.call('owner', 'GET', o(w, '/assessment-catalog'))
    const baseline = await w.call('owner', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohortA.id, cohortC.id], ...WINDOW })
    const cycle = (await w.call('owner', 'POST', o(w, '/reassessments'), { name: 'Outcome check', baselineAssignmentId: baseline.body.data.id, ...LATER })).body.data
    await w.campus.growth.decide({ formAId: FORM_A, formBId: FORM_B, status: 'APPROVED', evidenceRef: 'equating-run-9', reason: 'Equating run frozen and reviewed', decidedBy: 'adm-2', approvalId: 'appr-2' })

    const students = [USERS.s1.id, ...extra]
    const complete = async (assignmentId, userId, sessionId) => w.repos.assessments.updateStudent({ assignmentId, userId, patch: { status: 'COMPLETED', sessionId, startedAt: '2026-10-11T09:00:00Z', completedAt: '2026-10-11T10:00:00Z' } })
    // Synthetic sessions: baseline on form A at DEVELOPING, reassessment on form B at DEMONSTRATED.
    const sessions = new Map()
    const setup = async (n) => {
      for (const [i, id] of students.slice(0, n).entries()) {
        await complete(baseline.body.data.id, id, `b-${i}`)
        await complete(cycle.reassessment.assignmentId, id, `r-${i}`)
        sessions.set(`b-${i}`, entry(`b-${i}`, '2026-10-11T10:00:00.000Z', FORM_A, 'DEVELOPING'))
        sessions.set(`r-${i}`, entry(`r-${i}`, '2026-12-02T10:00:00.000Z', FORM_B, i % 3 === 0 ? 'DEVELOPING' : 'DEMONSTRATED'))
      }
    }
    const svc = createGrowthService({ repos: w.repos, catalog: w.campus.catalog, clock: () => new Date('2026-12-20T09:00:00Z'), entryFor: async (id) => sessions.get(id) || null })
    const owner = await w.campus.workspaceService.actorFor(USERS.owner)

    await setup(9)
    let out = (await svc.outcomes(owner, w.org.id, { admin: w.campus.admin })).items[0]
    assert.equal(out.counts.comparable, 9)
    assert.deepEqual(out.capabilities, [{ capabilityId: CAP, name: out.capabilities[0].name, suppressed: true, reason: 'SMALL_GROUP' }], '9 students: suppressed, never a partial number')

    await setup(10)
    out = (await svc.outcomes(owner, w.org.id, { admin: w.campus.admin })).items[0]
    const capRow = out.capabilities[0]
    assert.equal(capRow.suppressed, false)
    assert.deepEqual([capRow.n, capRow.higher, capRow.same, capRow.lower], [10, 6, 4, 0])
    assert.ok(!JSON.stringify(out).match(/"(userId|sessionId|name)":"(student|Student)/), 'no student identity in the aggregate')
    assert.ok(!/rank|score|percent/i.test(JSON.stringify(out.capabilities)))
    assert.equal((await w.repos.growth.listSnapshots({ userId: USERS.s1.id, organizationId: w.org.id })).length, 0, 'staff aggregate views never write student snapshots')

    // A scoped officer (cohort A only) counts only cohort A students, even when the cycle spans both cohorts.
    for (const [i, id] of others.entries()) {
      await complete(baseline.body.data.id, id, `ob-${i}`)
      await complete(cycle.reassessment.assignmentId, id, `or-${i}`)
      sessions.set(`ob-${i}`, entry(`ob-${i}`, '2026-10-11T10:00:00.000Z', FORM_A, 'DEVELOPING'))
      sessions.set(`or-${i}`, entry(`or-${i}`, '2026-12-02T10:00:00.000Z', FORM_B, 'STRONG'))
    }
    const officer = await w.campus.workspaceService.actorFor(USERS.officer)
    const all = (await svc.outcomes(owner, w.org.id, { admin: w.campus.admin })).items[0]
    const scoped = (await svc.outcomes(officer, w.org.id, { admin: w.campus.admin })).items[0]
    assert.deepEqual([all.counts.comparable, all.capabilities[0].n, all.capabilities[0].higher], [20, 20, 16])
    assert.deepEqual([scoped.counts.comparable, scoped.capabilities[0].n, scoped.capabilities[0].higher], [10, 10, 6])

    // An unapproved pair counts as not comparable, not as a change.
    await svc.decide({ formAId: FORM_A, formBId: FORM_B, status: 'REJECTED', evidenceRef: 'dif-run-4', reason: 'Later review found DIF on one form', decidedBy: 'adm-3' })
    out = (await svc.outcomes(owner, w.org.id, { admin: w.campus.admin })).items[0]
    assert.equal(out.counts.formsNotApproved, 20)
    assert.deepEqual(out.capabilities, [])

    // Through the API: analytics.read, and a coordinator of another department sees no cycle.
    assert.equal((await w.call('owner', 'GET', o(w, '/analytics/growth'))).status, 200)
    assert.deepEqual((await w.call('coordinator', 'GET', o(w, '/analytics/growth'))).body.data.items, [])
    assert.equal((await w.call('s1', 'GET', o(w, '/analytics/growth'))).status, 404)
  } finally { w.close() }
})
