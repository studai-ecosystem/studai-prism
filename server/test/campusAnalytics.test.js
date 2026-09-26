// C10.01–C10.04, C10.07 — campus analytics over the real /api/v1 handlers
// with memory repositories and synthetic sponsored sessions. Proves: groups
// below the minimum size are suppressed whole (9 vs 10; org setting with a
// floor of 5); a lone small group in a comparison gets a complementary one;
// every view is scoped to the caller's cohorts; no endpoint returns a student
// list, ranking or composite; exports and reports are audited; top needs use
// a documented method. Synthetic users, sessions and decisions only.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { PRIMARY_CAPABILITY_IDS } from '../domain/assessments/catalog.js'
import { createAnalyticsService } from '../domain/analytics/service.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_CAMPUS_ANALYTICS = 'true'

const SCENARIOS = { generalScenarios: [{ id: 'syn-an-a' }], bankScenarios: {} }
const CAP = PRIMARY_CAPABILITY_IDS[0]
const u = (id, name) => ({ id, email: `${id}@test.local`, name })
const STAFF = {
  owner: u('owner-an', 'Synthetic Owner'),
  director: u('director-an', 'Synthetic Director'),
  officer: u('officer-an', 'Synthetic Officer'),
  officerX: u('officer-an-x', 'Export Officer'),
  coordinator: u('coord-an', 'Synthetic Coordinator'),
  mentor: u('mentor-an', 'Synthetic Mentor'),
  student: u('student-an-0', 'Student Zero'),
}
const SESSIONS = {}
const legacy = {
  listEntitlements: async () => [], listSessionIds: async () => [],
  getSession: async (id) => (SESSIONS[id] ? { scenarioId: 'syn-an-a', userId: SESSIONS[id], history: [] } : null),
  getReport: async (id) => (SESSIONS[id] ? { userId: SESSIONS[id], issuedAt: '2026-10-12T10:00:00Z' } : null),
  getEntitlement: async () => null, createEntitlement: async () => null, adminState: async () => null,
  paths: { purchase: '/payment', start: () => '/', resume: () => '/', report: () => '/' },
}

async function world({ inA = 12, inB = 4 } = {}) {
  const now = new Date('2026-10-20T09:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic Analytics University', slug: `syn-an-${Math.random().toString(36).slice(2, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const d1 = await repos.organizations.createDepartment({ organizationId: org.id, name: 'Commerce' })
  const d2 = await repos.organizations.createDepartment({ organizationId: org.id, name: 'Engineering' })
  const cohortA = await repos.organizations.createCohort({ organizationId: org.id, departmentId: d1.id, name: 'Commerce 2027' })
  const cohortB = await repos.organizations.createCohort({ organizationId: org.id, departmentId: d2.id, name: 'Engineering 2027' })
  const m = (userId, role, extra = {}) => repos.memberships.upsertMembership({ organizationId: org.id, userId, role, status: 'ACTIVE', ...extra })
  await m(STAFF.owner.id, 'ORG_OWNER')
  await m(STAFF.director.id, 'PLACEMENT_DIRECTOR')
  await m(STAFF.officer.id, 'PLACEMENT_OFFICER', { scope: { cohortIds: [cohortA.id] } })
  await m(STAFF.officerX.id, 'PLACEMENT_OFFICER', { scope: { cohortIds: [cohortA.id], permissions: ['exports.cohort'] } })
  await m(STAFF.coordinator.id, 'DEPARTMENT_COORDINATOR', { departmentId: d2.id })
  await m(STAFF.mentor.id, 'FACULTY_MENTOR', { scope: { cohortIds: [cohortA.id] } })
  const students = { A: [], B: [] }
  for (const [key, cohort, count] of [['A', cohortA, inA], ['B', cohortB, inB]]) {
    for (let i = 0; i < count; i += 1) {
      const id = `student-an-${key}${i}`
      await m(id, 'STUDENT')
      await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: id })
      students[key].push(id)
    }
  }
  await m(STAFF.student.id, 'STUDENT')
  const audits = []
  const campus = createCampusContext({
    repos, clock: () => now, legacy, scenarioSource: async () => SCENARIOS,
    users: { findById: async () => null, findByEmail: async () => null },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
  })
  const requireUser = (req, _res, next) => {
    const who = req.get('x-test-user')
    const user = STAFF[who]
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
  const call = async (who, method, path, body) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'x-test-user': who, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  // One sponsored assignment for both cohorts; completing students get a synthetic session.
  const cat = await call('owner', 'GET', `/organizations/${org.id}/assessment-catalog`)
  const assignment = (await call('owner', 'POST', `/organizations/${org.id}/assignments`, { definitionId: cat.body.data.items[0].id, cohortIds: [cohortA.id, cohortB.id], windowStart: '2026-10-10T08:00:00.000Z', windowEnd: '2026-10-30T18:00:00.000Z' })).body.data
  const complete = async (userId) => {
    const sessionId = `sess-an-${userId}`
    SESSIONS[sessionId] = userId
    await repos.assessments.updateStudent({ assignmentId: assignment.id, userId, patch: { status: 'COMPLETED', sessionId, startedAt: '2026-10-12T09:00:00Z', completedAt: '2026-10-12T10:00:00Z' } })
  }
  return { repos, org, d1, d2, cohortA, cohortB, students, campus, audits, call, complete, assignment, close: () => server.close() }
}
const o = (w, p) => `/organizations/${w.org.id}${p}`
const noIdentity = (body, w) => {
  const text = JSON.stringify(body)
  for (const id of [...w.students.A, ...w.students.B]) assert.ok(!text.includes(id), `aggregate leaks ${id}`)
  assert.ok(!/"(score|rank|average|composite|percentile)"/i.test(text), 'no score, rank or composite field')
}

test('flag off: analytics and reports are dark', async () => {
  const w = await world()
  try {
    process.env.PRISM_CAMPUS_ANALYTICS = 'false'
    for (const p of ['/analytics/capabilities', '/analytics/sufficiency', '/analytics/comparison', '/analytics/completion', '/settings/analytics']) assert.equal((await w.call('owner', 'GET', o(w, p))).status, 404, p)
    assert.equal((await w.call('owner', 'POST', o(w, '/reports/cohort'), {})).status, 404)
  } finally {
    process.env.PRISM_CAMPUS_ANALYTICS = 'true'
    w.close()
  }
})

test('suppression: 9 assessed students are hidden whole, 10 are shown; the org setting moves the threshold (floor 5)', async () => {
  const w = await world()
  try {
    for (const id of w.students.A.slice(0, 9)) await w.complete(id)
    let v = await w.call('owner', 'GET', o(w, '/analytics/capabilities'))
    assert.equal(v.status, 200)
    assert.deepEqual([v.body.data.suppressed, v.body.data.reason, v.body.data.capabilities.length, v.body.data.minGroupSize], [true, 'SMALL_GROUP', 0, 10])
    for (const p of ['/analytics/capabilities', '/analytics/sufficiency']) {
      const d = (await w.call('owner', 'GET', o(w, p))).body.data
      assert.ok(!('assessed' in d) && !('underReview' in d), `${p}: a hidden view carries no counts at all`)
    }
    await w.complete(w.students.A[9])
    v = await w.call('owner', 'GET', o(w, '/analytics/capabilities'))
    assert.equal(v.body.data.suppressed, false)
    assert.equal(v.body.data.assessed, 10)
    const row = v.body.data.capabilities.find((c) => c.capabilityId === CAP)
    assert.deepEqual([row.n, row.buckets.INSUFFICIENT, row.buckets.DEMONSTRATED], [10, 10, 0], 'no admissible evidence → Insufficient evidence, never a level')
    assert.equal(v.body.data.bucketLabels.INSUFFICIENT, 'Insufficient evidence')
    assert.match(v.body.data.method, /below "Demonstrated" or without enough evidence/)
    noIdentity(v.body, w)
    const s = await w.call('owner', 'GET', o(w, '/analytics/sufficiency'))
    assert.equal(s.body.data.capabilities.find((c) => c.capabilityId === CAP).statuses.INSUFFICIENT_EVIDENCE, 10)

    assert.equal((await w.call('director', 'PATCH', o(w, '/settings/analytics'), { minAggregateGroupSize: 12 })).status, 403, 'owners only')
    assert.equal((await w.call('owner', 'PATCH', o(w, '/settings/analytics'), { minAggregateGroupSize: 4 })).status, 422, 'floor 5')
    const set = await w.call('owner', 'PATCH', o(w, '/settings/analytics'), { minAggregateGroupSize: 11 })
    assert.equal(set.body.data.minAggregateGroupSize, 11)
    assert.equal((await w.call('owner', 'GET', o(w, '/analytics/capabilities'))).body.data.suppressed, true, '10 < 11 → hidden')
    assert.ok((await w.repos.campusAdmin.listOrgAudit(w.org.id)).some((e) => e.action === 'analytics.settings.updated'))
  } finally { w.close() }
})

test('scope: each role counts only its cohorts; students and outsiders get 404', async () => {
  const w = await world({ inA: 12, inB: 11 })
  try {
    for (const id of [...w.students.A, ...w.students.B]) await w.complete(id)
    const assessed = async (who) => (await w.call(who, 'GET', o(w, '/analytics/capabilities'))).body.data.assessed
    assert.equal(await assessed('owner'), 23)
    assert.equal(await assessed('officer'), 12, 'officer: cohort A only')
    assert.equal(await assessed('mentor'), 12)
    assert.equal(await assessed('coordinator'), 11, 'coordinator: own department only')
    assert.equal((await w.call('student', 'GET', o(w, '/analytics/capabilities'))).status, 404)
    const f = await w.call('coordinator', 'GET', o(w, `/analytics/capabilities?cohortId=${w.cohortA.id}`))
    assert.deepEqual([f.body.data.suppressed, f.body.data.capabilities.length, 'assessed' in f.body.data], [true, 0, false], 'a filter outside the reach adds nothing')
    const c = await w.call('officer', 'GET', o(w, '/analytics/completion'))
    assert.deepEqual(c.body.data.funnel, { assigned: 12, acknowledged: 12, started: 12, completed: 12 })
    assert.equal((await w.call('owner', 'GET', o(w, '/analytics/capabilities?cohortId=not-a-uuid'))).status, 422)
  } finally { w.close() }
})

test('comparison: a small group is hidden and the next smallest is hidden with it (complementary suppression)', async () => {
  const w = await world({ inA: 12, inB: 4 })
  try {
    for (const id of [...w.students.A, ...w.students.B]) await w.complete(id)
    const byCohort = (await w.call('owner', 'GET', o(w, '/analytics/comparison?groupBy=cohort'))).body.data
    const a = byCohort.groups.find((g) => g.groupId === w.cohortA.id)
    const b = byCohort.groups.find((g) => g.groupId === w.cohortB.id)
    assert.deepEqual([b.suppressed, b.reason], [true, 'SMALL_GROUP'])
    assert.deepEqual([a.suppressed, a.complementary], [true, true], 'otherwise B = total − A')
    assert.ok(!('n' in a) && !('n' in b))
    const byDept = (await w.call('owner', 'GET', o(w, '/analytics/comparison?groupBy=department'))).body.data
    assert.deepEqual(byDept.groups.map((g) => [g.name, g.suppressed]), [['Commerce', true], ['Engineering', true]])
    noIdentity(byCohort, w)
  } finally { w.close() }
})

test('top needs and distributions from synthetic decisions: documented method, counts not percentages, no student fields', async () => {
  const w = await world({ inA: 12, inB: 0 })
  try {
    for (const id of w.students.A) await w.complete(id)
    const bands = ['EARLY', 'EARLY', 'DEVELOPING', 'DEVELOPING', 'DEVELOPING', 'DEMONSTRATED', 'DEMONSTRATED', 'DEMONSTRATED', 'STRONG', 'STRONG', null, null]
    const entryFor = async (sessionId) => {
      const i = w.students.A.indexOf(sessionId.replace('sess-an-', ''))
      const band = bands[i]
      return {
        session: { sessionId, completedAt: '2026-10-12T10:00:00Z' }, definition: { measures: [CAP] }, form: null,
        decisions: { [CAP]: band ? { status: i % 2 ? 'SUFFICIENT' : 'PROVISIONAL', level: { band, label: band } } : { status: 'INSUFFICIENT_EVIDENCE', level: null } },
      }
    }
    const svc = createAnalyticsService({ repos: w.repos, entryFor })
    const owner = await w.campus.workspaceService.actorFor(STAFF.owner)
    const v = await svc.capabilities(owner, w.org.id)
    const row = v.capabilities[0]
    assert.deepEqual(row.buckets, { INSUFFICIENT: 2, EARLY: 2, DEVELOPING: 3, DEMONSTRATED: 3, STRONG: 2 })
    assert.deepEqual(v.topNeeds, [{ capabilityId: CAP, name: row.name, needs: 7, of: 12 }])
    assert.ok(!JSON.stringify(v).includes('%'))
    noIdentity(v, w)
  } finally { w.close() }
})

test('exports and reports: permissioned, aggregate-only, formula-safe and audited', async () => {
  const w = await world({ inA: 12, inB: 4 })
  try {
    for (const id of [...w.students.A, ...w.students.B]) await w.complete(id)
    assert.equal((await w.call('officer', 'POST', o(w, '/analytics/exports'), { view: 'capabilities' })).status, 404, 'officer without the export permission')
    const x = await w.call('officerX', 'POST', o(w, '/analytics/exports'), { view: 'comparison', groupBy: 'cohort' })
    assert.equal(x.status, 200)
    assert.match(x.body.data.csv, /^Cohort,Capability,Students assessed,Insufficient evidence/)
    assert.match(x.body.data.csv, /Data hidden because this segment is too small for aggregate reporting\./)
    assert.ok(!x.body.data.csv.includes('Engineering 2027'), 'out-of-scope cohorts never appear')
    noIdentity(x.body, w)
    assert.equal((await w.call('owner', 'POST', o(w, '/analytics/exports'), { view: 'students' })).status, 422, 'no student-level export view exists')

    assert.equal((await w.call('coordinator', 'POST', o(w, '/reports/cohort'), { cohortId: w.cohortA.id })).status, 404, 'another department\'s cohort')
    const rep = await w.call('owner', 'POST', o(w, '/reports/cohort'), {})
    assert.equal(rep.status, 200)
    assert.equal(rep.body.data.kind, 'EXECUTIVE')
    assert.deepEqual(rep.body.data.participation.funnel.completed, 16)
    assert.ok(rep.body.data.recommendedActions.every((a) => typeof a.text === 'string'))
    assert.match(rep.body.data.privacy, /No personal Prism data/)
    noIdentity(rep.body, w)
    const dept = await w.call('owner', 'POST', o(w, '/reports/cohort'), { departmentId: w.d1.id })
    assert.equal(dept.body.data.kind, 'DEPARTMENT')
    assert.equal(dept.body.data.capabilities.assessed, 12)
    const log = await w.repos.campusAdmin.listOrgAudit(w.org.id)
    assert.deepEqual(log.filter((e) => e.action === 'report.exported').map((e) => e.targetType).sort(), ['ANALYTICS', 'COHORT_REPORT', 'COHORT_REPORT'])
  } finally { w.close() }
})

const CAP2 = PRIMARY_CAPABILITY_IDS[1]
const decided = (measures) => ({ session: { completedAt: '2026-10-12T10:00:00Z' }, definition: { measures }, form: null, decisions: Object.fromEntries(measures.map((m) => [m, { status: 'SUFFICIENT', level: { band: 'DEVELOPING', label: 'Developing' } }])) })

test('held sessions count as under review, not assessed; a date range outside the window hides the view', async () => {
  const w = await world({ inA: 12, inB: 0 })
  try {
    for (const id of w.students.A) await w.complete(id)
    const held = new Set(w.students.A.slice(0, 2).map((id) => `sess-an-${id}`))
    const svc = createAnalyticsService({ repos: w.repos, entryFor: async (sid) => (held.has(sid) ? null : decided([CAP])) })
    const owner = await w.campus.workspaceService.actorFor(STAFF.owner)
    const v = await svc.capabilities(owner, w.org.id)
    assert.deepEqual([v.suppressed, v.assessed, v.underReview], [false, 10, 2])
    assert.equal((await svc.capabilities(owner, w.org.id, { from: '2026-10-13' })).suppressed, true, 'completed before the range')
    assert.equal((await svc.capabilities(owner, w.org.id, { to: '2026-10-12' })).assessed, 10, 'the to-date is inclusive')
  } finally { w.close() }
})

test('complementary suppression ignores empty groups and applies per capability column', async () => {
  const w = await world({ inA: 12, inB: 12 })
  try {
    await w.repos.organizations.createCohort({ organizationId: w.org.id, departmentId: w.d2.id, name: 'Empty 2028' })
    for (const id of [...w.students.A, ...w.students.B]) await w.complete(id)
    const fewB = new Set(w.students.B.slice(0, 3).map((id) => `sess-an-${id}`))
    const svc = createAnalyticsService({ repos: w.repos, entryFor: async (sid) => (sid.includes('-A') || fewB.has(sid) ? decided([CAP, CAP2]) : decided([CAP])) })
    const owner = await w.campus.workspaceService.actorFor(STAFF.owner)
    const v = await svc.comparison(owner, w.org.id, { groupBy: 'cohort' })
    const g = (id) => v.groups.find((x) => x.groupId === id)
    assert.deepEqual([g(w.cohortA.id).suppressed, g(w.cohortB.id).suppressed], [false, false], 'an empty cohort does not trigger group suppression')
    const cell = (gid, cap) => g(gid).capabilities.find((c) => c.capabilityId === cap)
    assert.deepEqual([cell(w.cohortA.id, CAP).suppressed, cell(w.cohortB.id, CAP).suppressed], [false, false])
    assert.equal(cell(w.cohortB.id, CAP2).suppressed, true, '3 measured students: hidden')
    assert.deepEqual([cell(w.cohortA.id, CAP2).suppressed, cell(w.cohortA.id, CAP2).complementary], [true, true], 'otherwise B = column total − A')
    assert.ok(!('n' in cell(w.cohortA.id, CAP2)))
  } finally { w.close() }
})

test('students outside every group form an explicit, suppressible row (no implicit residue)', async () => {
  const w = await world({ inA: 12, inB: 0 })
  try {
    const loose = await w.repos.organizations.createCohort({ organizationId: w.org.id, name: 'Unassigned 2027' })
    const ids = ['student-an-L0', 'student-an-L1', 'student-an-L2']
    for (const id of ids) {
      await w.repos.memberships.upsertMembership({ organizationId: w.org.id, userId: id, role: 'STUDENT', status: 'ACTIVE' })
      await w.repos.organizations.addCohortMember({ cohortId: loose.id, userId: id })
    }
    const cat = await w.call('owner', 'GET', o(w, '/assessment-catalog'))
    const second = (await w.call('owner', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [loose.id], windowStart: '2026-10-10T08:00:00.000Z', windowEnd: '2026-10-30T18:00:00.000Z' })).body.data
    for (const id of ids) {
      SESSIONS[`sess-an-${id}`] = id
      await w.repos.assessments.updateStudent({ assignmentId: second.id, userId: id, patch: { status: 'COMPLETED', sessionId: `sess-an-${id}`, startedAt: '2026-10-12T09:00:00Z', completedAt: '2026-10-12T10:00:00Z' } })
    }
    for (const id of w.students.A) await w.complete(id)
    const v = (await w.call('owner', 'GET', o(w, '/analytics/comparison?groupBy=department'))).body.data
    const none = v.groups.find((g) => g.groupId === 'NONE')
    assert.deepEqual([none?.name, none?.suppressed], ['No department', true])
    assert.equal(v.groups.find((g) => g.name === 'Commerce').suppressed, true, 'complementary: otherwise the residue = total − Commerce')
  } finally { w.close() }
})

test('missions view hides small interventions; reports include only the target department\'s interventions and reassessments', async () => {
  const w = await world({ inA: 12, inB: 4 })
  try {
    for (const id of [...w.students.A, ...w.students.B]) await w.complete(id)
    const interventions = [
      { id: 'int-a', organizationId: w.org.id, cohortId: w.cohortA.id, name: 'Commerce practice', status: 'ACTIVE', startsOn: '2026-10-21', endsOn: '2026-11-04' },
      { id: 'int-b', organizationId: w.org.id, cohortId: w.cohortB.id, name: 'Engineering practice', status: 'ACTIVE', startsOn: '2026-10-21', endsOn: '2026-11-04' },
    ]
    const members = { 'int-a': 12, 'int-b': 4 }
    const development = { interventionSummary: async (i) => ({ targetCapability: { id: CAP, name: null }, counts: { members: members[i.id], started: members[i.id], completedAll: 1 } }) }
    const cycles = [
      { id: 'cyc-a', name: 'Commerce reassessment', status: 'SCHEDULED', cohortIds: [w.cohortA.id], windowStart: '2026-11-10T08:00:00Z', windowEnd: '2026-11-20T18:00:00Z', comparability: 'SAME_FORM' },
      { id: 'cyc-b', name: 'Engineering reassessment', status: 'SCHEDULED', cohortIds: [w.cohortB.id], windowStart: '2026-11-10T08:00:00Z', windowEnd: '2026-11-20T18:00:00Z', comparability: 'SAME_FORM' },
    ]
    const outcomeArgs = []
    const growth = { listCycles: async () => cycles, outcomes: async (_a, _o, args) => { outcomeArgs.push(args); return { items: [] } } }
    const repos = { ...w.repos, development: { listInterventions: async () => interventions }, growth: {} }
    const svc = createAnalyticsService({ repos, entryFor: async () => decided([CAP]), growth })
    const owner = await w.campus.workspaceService.actorFor(STAFF.owner)
    const m = await svc.missions(owner, w.org.id, { development })
    assert.deepEqual(m.interventions.map((i) => [i.name, i.suppressed, i.members]), [['Commerce practice', false, 12], ['Engineering practice', true, undefined]])
    await w.repos.analytics.saveSettings({ organizationId: w.org.id, minAggregateGroupSize: 7, updatedBy: STAFF.owner.id })
    await svc.interventions(owner, w.org.id, { development })
    assert.equal(outcomeArgs.at(-1).minGroupSize, 7, 'growth outcomes use the organization threshold')
    const orgAudit = async () => {}
    const dept = await svc.cohortReport({}, owner, w.org.id, { departmentId: w.d1.id }, { orgAudit, development })
    assert.deepEqual(dept.interventions.map((i) => i.interventionId), ['int-a'])
    assert.deepEqual(dept.reassessments.map((c) => c.id), ['cyc-a'])
    const exec = await svc.cohortReport({}, owner, w.org.id, {}, { orgAudit, development })
    assert.deepEqual(exec.interventions.map((i) => i.interventionId).sort(), ['int-a', 'int-b'])
    assert.equal(exec.interventions.find((i) => i.interventionId === 'int-b').suppressed, true)
  } finally { w.close() }
})

test('CSV export neutralises spreadsheet formulas in names', async () => {
  const w = await world({ inA: 12, inB: 0 })
  try {
    const evil = await w.repos.organizations.createCohort({ organizationId: w.org.id, departmentId: w.d1.id, name: '=HYPERLINK("http://example.test")' })
    for (const id of w.students.A) { await w.repos.organizations.addCohortMember({ cohortId: evil.id, userId: id }); await w.complete(id) }
    const x = await w.call('owner', 'POST', o(w, '/analytics/exports'), { view: 'comparison', groupBy: 'cohort' })
    assert.equal(x.status, 200)
    assert.ok(x.body.data.csv.includes(`"'=HYPERLINK(""http://example.test"")"`), 'formula prefixed and quoted')
    assert.ok(!/(^|,)=HYPERLINK/m.test(x.body.data.csv))
  } finally { w.close() }
})
