// C7.02–C7.08, C7.12 — campus administration over the real /api/v1 handlers
// with memory repositories and a synthetic user directory. Proves: every
// endpoint family is gated per role (§29.1) and tenant-isolated; scoped roles
// only see their cohorts/department; CSV import previews row errors before
// anything is written, commits idempotently and links existing accounts;
// assignments use approved definitions only and roster the targeted cohorts;
// team changes are audited and owner access is protected; there is no route
// to edit rubrics, prompts or definitions.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'

// Enabled inside this test process only (K2).
process.env.PRISM_CAMPUS_ENABLED = 'true'

const SCENARIOS = { generalScenarios: [{ id: 'syn-general-a', title: 'Synthetic Workplace Scenario' }], bankScenarios: {} }
const u = (id, name) => ({ id, email: `${id}@test.local`, name })
const USERS = {
  owner: u('owner-a', 'Synthetic Owner'),
  owner2: u('owner-b', 'Second Owner'),
  director: u('director-a', 'Synthetic Director'),
  officer: u('officer-a', 'Synthetic Officer'),
  coordinator: u('coord-a', 'Synthetic Coordinator'),
  mentor: u('mentor-a', 'Synthetic Mentor'),
  s1: u('student-1', 'Student One'),
  s2: u('student-2', '=HYPERLINK("x")'),
  newcomer: u('student-new', 'New Student'),
  outsider: u('owner-z', 'Other Owner'),
}

async function world() {
  let now = new Date('2026-10-05T09:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u-a', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const other = await repos.organizations.createOrganization({ name: 'Other University', slug: 'other-u-a', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const d1 = await repos.organizations.createDepartment({ organizationId: org.id, name: 'Commerce' })
  const d2 = await repos.organizations.createDepartment({ organizationId: org.id, name: 'Engineering' })
  const cohortA = await repos.organizations.createCohort({ organizationId: org.id, departmentId: d1.id, name: 'Commerce 2027' })
  const cohortB = await repos.organizations.createCohort({ organizationId: org.id, departmentId: d2.id, name: 'Engineering 2027' })
  const foreignCohort = await repos.organizations.createCohort({ organizationId: other.id, name: 'Foreign cohort' })
  const m = (userId, role, extra = {}) => repos.memberships.upsertMembership({ organizationId: org.id, userId, role, status: 'ACTIVE', ...extra })
  const memberships = {
    owner: await m(USERS.owner.id, 'ORG_OWNER'),
    director: await m(USERS.director.id, 'PLACEMENT_DIRECTOR'),
    officer: await m(USERS.officer.id, 'PLACEMENT_OFFICER', { scope: { cohortIds: [cohortA.id] } }),
    coordinator: await m(USERS.coordinator.id, 'DEPARTMENT_COORDINATOR', { departmentId: d2.id }),
    mentor: await m(USERS.mentor.id, 'FACULTY_MENTOR', { scope: { cohortIds: [cohortA.id] } }),
    s1: await m(USERS.s1.id, 'STUDENT'),
    s2: await m(USERS.s2.id, 'STUDENT'),
  }
  await repos.memberships.upsertMembership({ organizationId: other.id, userId: USERS.outsider.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  await repos.organizations.addCohortMember({ cohortId: cohortA.id, userId: USERS.s1.id })
  await repos.organizations.addCohortMember({ cohortId: cohortB.id, userId: USERS.s2.id })
  const byId = new Map(Object.values(USERS).map((x) => [x.id, x]))
  const users = {
    findById: async (id) => byId.get(id) || null,
    findByEmail: async (email) => [...byId.values()].find((x) => x.email === String(email).toLowerCase()) || null,
  }
  const audits = []
  const emails = []
  let tokens = 0
  const campus = createCampusContext({
    repos, clock: () => now, users, scenarioSource: async () => SCENARIOS,
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
    tokenFactory: () => `synthetic-invite-token-${String(++tokens).padStart(4, '0')}-abcdefghij`,
    sendAssignmentEmail: async (msg) => { emails.push(msg); return true },
    appUrl: 'https://prism.test.local',
  })
  const requireUser = (req, _res, next) => {
    const user = USERS[req.get('x-test-user')]
    if (!user) return next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.'))
    req.user = user
    return next()
  }
  const app = express()
  app.use(express.json({ limit: '2mb' }))
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
    const text = await r.text()
    let json = null
    try { json = JSON.parse(text) } catch { json = null }
    return { status: r.status, body: json, text, headers: r.headers }
  }
  return {
    repos, org, other, d1, d2, cohortA, cohortB, foreignCohort, memberships, campus, audits, emails, call,
    setNow: (d) => { now = d },
    close: () => server.close(),
  }
}

const o = (w, path = '') => `/organizations/${w.org.id}${path}`

test('overview + students: every role sees only its own scope; students and other orgs get 404', async () => {
  const w = await world()
  try {
    for (const who of ['owner', 'director', 'officer', 'coordinator', 'mentor']) assert.equal((await w.call(who, 'GET', o(w, '/overview'))).status, 200, who)
    for (const who of ['s1', 'outsider']) assert.equal((await w.call(who, 'GET', o(w, '/overview'))).status, 404, who)
    assert.equal((await w.call(null, 'GET', o(w, '/overview'))).status, 401)

    const ownerView = await w.call('owner', 'GET', o(w, '/students'))
    assert.equal(ownerView.body.data.total, 2)
    const officer = await w.call('officer', 'GET', o(w, '/students'))
    assert.deepEqual(officer.body.data.items.map((r) => r.userId), [USERS.s1.id])
    const coord = await w.call('coordinator', 'GET', o(w, '/students'))
    assert.deepEqual(coord.body.data.items.map((r) => r.userId), [USERS.s2.id])
    const mentor = await w.call('mentor', 'GET', o(w, '/students'))
    assert.deepEqual(mentor.body.data.items.map((r) => r.userId), [USERS.s1.id])
    assert.equal((await w.call('s1', 'GET', o(w, '/students'))).status, 404)
    assert.equal((await w.call('outsider', 'GET', o(w, '/students'))).status, 404)

    // Out-of-scope detail is indistinguishable from a missing student.
    assert.equal((await w.call('officer', 'GET', o(w, `/students/${USERS.s2.id}`))).status, 404)
    const detail = await w.call('officer', 'GET', o(w, `/students/${USERS.s1.id}`))
    assert.equal(detail.status, 200)
    assert.match(detail.body.data.privacyNote, /Personal Prism activity is excluded/)
    assert.ok(!('personalSessions' in detail.body.data))
    const access = await w.repos.audit.listDataAccess({ organizationId: w.org.id })
    assert.ok(access.some((e) => e.subjectUserId === USERS.s1.id && e.purpose === 'STUDENT_DETAIL' && e.actorUserId === USERS.officer.id))

    // Filters + pagination are server-side.
    const page = await w.call('owner', 'GET', o(w, '/students?pageSize=1&page=2'))
    assert.equal(page.body.data.items.length, 1)
    assert.equal(page.body.data.total, 2)
    const filtered = await w.call('owner', 'GET', o(w, `/students?cohortId=${w.cohortB.id}`))
    assert.deepEqual(filtered.body.data.items.map((r) => r.userId), [USERS.s2.id])
    assert.equal((await w.call('owner', 'GET', o(w, '/students?pageSize=1000'))).status, 422)
  } finally { w.close() }
})

test('export needs exports.cohort, is audited, and neutralises spreadsheet formulas', async () => {
  const w = await world()
  try {
    assert.equal((await w.call('officer', 'GET', o(w, '/students/export'))).status, 404)
    const r = await w.call('owner', 'GET', o(w, '/students/export'))
    assert.equal(r.status, 200)
    const { csv, fileName } = r.body.data
    assert.equal(fileName, 'students.csv')
    assert.match(csv, /^name,email,status,cohorts,assessment_status/)
    assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), 'formula cell is prefixed and quoted')
    const events = await w.repos.campusAdmin.listOrgAudit(w.org.id)
    assert.ok(events.some((e) => e.action === 'report.exported' && e.details.rows === 2))
  } finally { w.close() }
})

test('structure + cohorts: org.manage for structure; students.manage scope for cohorts; tenant isolation', async () => {
  const w = await world()
  try {
    assert.equal((await w.call('officer', 'POST', o(w, '/structure/campus'), { name: 'North' })).status, 404)
    const campusRow = await w.call('owner', 'POST', o(w, '/structure/campus'), { name: 'North' })
    assert.equal(campusRow.status, 201)
    assert.equal((await w.call('owner', 'POST', o(w, '/structure/department'), { name: 'Law', campusId: '00000000-0000-4000-8000-000000000000' })).status, 422)
    assert.equal((await w.call('owner', 'POST', o(w, '/structure/rubric'), { name: 'x' })).status, 404)
    const structure = await w.call('mentor', 'GET', o(w, '/structure'))
    assert.equal(structure.body.data.campuses.length, 1)

    assert.equal((await w.call('officer', 'POST', o(w, '/cohorts'), { name: 'Officer cohort' })).status, 403)
    assert.equal((await w.call('coordinator', 'POST', o(w, '/cohorts'), { name: 'Wrong dept', departmentId: w.d1.id })).status, 403)
    const own = await w.call('coordinator', 'POST', o(w, '/cohorts'), { name: 'Engineering 2028', departmentId: w.d2.id })
    assert.equal(own.status, 201)
    assert.equal((await w.call('mentor', 'POST', o(w, '/cohorts'), { name: 'Mentor cohort' })).status, 404)

    const officerList = await w.call('officer', 'GET', o(w, '/cohorts'))
    assert.deepEqual(officerList.body.data.items.map((c) => c.id), [w.cohortA.id])
    assert.equal((await w.call('officer', 'GET', o(w, `/cohorts/${w.cohortB.id}`))).status, 404)
    assert.equal((await w.call('owner', 'GET', o(w, `/cohorts/${w.foreignCohort.id}`))).status, 404, 'another org cohort is invisible')
    assert.equal((await w.call('outsider', 'GET', o(w, `/cohorts/${w.cohortA.id}`))).status, 404)

    const detail = await w.call('owner', 'GET', o(w, `/cohorts/${w.cohortA.id}`))
    assert.deepEqual(detail.body.data.members.map((x) => x.id), [USERS.s1.id])

    // Move: officer cannot move into a cohort outside their assignment.
    assert.equal((await w.call('officer', 'POST', o(w, '/students/move'), { userIds: [USERS.s1.id], fromCohortId: w.cohortA.id, toCohortId: w.cohortB.id })).status, 404)
    const moved = await w.call('owner', 'POST', o(w, '/students/move'), { userIds: [USERS.s1.id, 'not-a-member'], fromCohortId: w.cohortA.id, toCohortId: w.cohortB.id })
    assert.equal(moved.body.data.moved, 1)
    const b = await w.call('owner', 'GET', o(w, `/cohorts/${w.cohortB.id}`))
    assert.deepEqual(b.body.data.members.map((x) => x.id).sort(), [USERS.s1.id, USERS.s2.id].sort())

    assert.equal((await w.call('officer', 'PATCH', o(w, `/cohorts/${w.cohortA.id}`), { status: 'ARCHIVED' })).status, 403)
    assert.equal((await w.call('owner', 'PATCH', o(w, `/cohorts/${w.cohortA.id}`), { status: 'ARCHIVED' })).status, 200)
    const events = await w.repos.campusAdmin.listOrgAudit(w.org.id)
    for (const action of ['structure.created', 'cohort.created', 'cohort.members_moved', 'cohort.archived']) assert.ok(events.some((e) => e.action === action), action)
  } finally { w.close() }
})

test('CSV import: preview shows row errors, commit is idempotent, existing accounts are linked not duplicated', async () => {
  const w = await world()
  try {
    const csv = [
      'Email,Full Name,Roll Number,Cohort',
      'fresh@test.local,Fresh Student,R1,Commerce 2027',
      `${USERS.s2.email},Student Two,R2,Commerce 2027`,
      'not-an-email,Broken,R3,Commerce 2027',
      'ghost@test.local,Ghost,R4,Unknown Cohort',
      'FRESH@test.local,Dup,R5,Commerce 2027',
    ].join('\r\n')
    assert.equal((await w.call('mentor', 'POST', o(w, '/imports/students'), { csv })).status, 404)
    assert.equal((await w.call('owner', 'POST', o(w, '/imports/students'), { csv: 'name\nNo email' })).status, 422)
    const preview = await w.call('owner', 'POST', o(w, '/imports/students'), { fileName: 'students.csv', csv })
    assert.equal(preview.status, 201)
    const { job, rows } = preview.body.data
    assert.deepEqual(job.totals, { rows: 5, invite: 1, alreadyMember: 1, errors: 3 })
    assert.deepEqual(rows.find((r) => r.rowNumber === 4).errors, ['EMAIL_INVALID'])
    assert.deepEqual(rows.find((r) => r.rowNumber === 5).errors, ['UNKNOWN_COHORT'])
    assert.deepEqual(rows.find((r) => r.rowNumber === 6).errors, ['DUPLICATE_IN_FILE'])
    // Nothing is written by a preview.
    assert.equal((await w.repos.campusAdmin.listOrgInvites(w.org.id)).length, 0)

    const path = o(w, `/imports/${job.id}/commit`)
    assert.equal((await w.call('owner', 'POST', path)).status, 428)
    const committed = await w.call('owner', 'POST', path, undefined, { 'Idempotency-Key': 'import-key-1' })
    assert.equal(committed.status, 201)
    assert.equal(committed.body.data.job.status, 'COMMITTED')
    assert.equal(committed.body.data.job.totals.invited, 1)
    const replay = await w.call('owner', 'POST', path, undefined, { 'Idempotency-Key': 'import-key-1' })
    assert.equal(replay.status, 200)
    assert.equal(replay.body.data.replayed, true)
    assert.equal((await w.call('owner', 'POST', path, undefined, { 'Idempotency-Key': 'import-key-2' })).status, 409)
    const invites = await w.repos.campusAdmin.listOrgInvites(w.org.id)
    assert.deepEqual(invites.map((i) => [i.email, i.cohortId]), [['fresh@test.local', w.cohortA.id]])
    // Existing student linked to the cohort, no second account or invite.
    const a = await w.call('owner', 'GET', o(w, `/cohorts/${w.cohortA.id}`))
    assert.ok(a.body.data.members.some((x) => x.id === USERS.s2.id))
    const rowsAfter = (await w.call('owner', 'GET', o(w, `/imports/${job.id}`))).body.data.rows
    assert.deepEqual(rowsAfter.map((r) => r.outcome), ['INVITED', 'SKIPPED', 'SKIPPED', 'SKIPPED', 'SKIPPED'])
    const notes = await w.call('owner', 'GET', '/me/notifications')
    assert.ok(notes.body.data.items.some((n) => n.kind === 'IMPORT_COMPLETE' && n.payload.invited === 1))
    // Another organization cannot read the job.
    assert.equal((await w.call('outsider', 'GET', `/organizations/${w.other.id}/imports/${job.id}`)).status, 404)
  } finally { w.close() }
})

test('CSV import: an officer can only import into assigned cohorts', async () => {
  const w = await world()
  try {
    const csv = 'email,cohort\nx1@test.local,Commerce 2027\nx2@test.local,Engineering 2027\n'
    const preview = await w.call('officer', 'POST', o(w, '/imports/students'), { csv })
    assert.equal(preview.status, 201)
    assert.deepEqual(preview.body.data.rows.map((r) => r.action), ['INVITE', 'ERROR'])
    assert.deepEqual(preview.body.data.rows[1].errors, ['UNKNOWN_COHORT'])
  } finally { w.close() }
})

test('CSV import: 250 rows preview + commit within the time budget', async () => {
  const w = await world()
  try {
    const lines = ['email,name,cohort']
    for (let i = 0; i < 250; i += 1) lines.push(`bulk${i}@test.local,Bulk ${i},Commerce 2027`)
    const started = Date.now()
    const preview = await w.call('owner', 'POST', o(w, '/imports/students'), { csv: lines.join('\n') })
    assert.equal(preview.body.data.job.totals.invite, 250)
    const commit = await w.call('owner', 'POST', o(w, `/imports/${preview.body.data.job.id}/commit`), undefined, { 'Idempotency-Key': 'bulk-1' })
    assert.equal(commit.body.data.job.totals.invited, 250)
    assert.ok(Date.now() - started < 10000, `took ${Date.now() - started}ms`)
  } finally { w.close() }
})

test('assignments: approved definitions only, cohorts rostered, notified, completion scoped, roster sync on join', async () => {
  const w = await world()
  try {
    const cat = await w.call('owner', 'GET', o(w, '/assessment-catalog'))
    assert.equal(cat.status, 200)
    assert.ok(cat.body.data.items.length >= 1)
    assert.equal((await w.call('mentor', 'GET', o(w, '/assessment-catalog'))).status, 404)
    const consent = await w.call('owner', 'GET', o(w, '/consent-preview'))
    assert.match(consent.body.data.heading, /Synthetic University/)
    assert.ok(consent.body.data.cannotSee.some((l) => /personal/i.test(l)))

    const window = { windowStart: '2026-10-05T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z' }
    assert.equal((await w.call('owner', 'POST', o(w, '/assignments'), { definitionId: 'not-approved', cohortIds: [w.cohortA.id], ...window })).status, 422)
    assert.equal((await w.call('owner', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [w.foreignCohort.id], ...window })).status, 422)
    assert.equal((await w.call('coordinator', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohortA.id], ...window })).status, 403)
    const created = await w.call('owner', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohortA.id], ...window, reminders: true })
    assert.equal(created.status, 201)
    assert.equal(created.body.data.status, 'ACTIVE')
    assert.equal(created.body.data.rostered, 1)
    const id = created.body.data.id
    assert.equal(w.emails.length, 1)
    assert.equal(w.emails[0].to, USERS.s1.email)
    assert.ok(!JSON.stringify(w.emails[0]).includes('Student One'), 'no student name in the email payload')
    const s1Notes = await w.call('s1', 'GET', '/me/notifications')
    assert.ok(s1Notes.body.data.items.some((n) => n.kind === 'ASSIGNMENT_LAUNCHED' && n.payload.assignmentId === id))
    assert.equal((await w.call('s1', 'POST', `/me/notifications/${s1Notes.body.data.items[0].id}/read`)).status, 200)
    assert.equal((await w.call('s2', 'POST', `/me/notifications/${s1Notes.body.data.items[0].id}/read`)).status, 404)

    // Completion: officer (assigned cohort A) sees it; coordinator (dept 2) does not.
    const comp = await w.call('officer', 'GET', o(w, `/assignments/${id}`))
    assert.deepEqual(comp.body.data.students.map((s) => [s.userId, s.status]), [[USERS.s1.id, 'ASSIGNED']])
    assert.equal((await w.call('coordinator', 'GET', o(w, `/assignments/${id}`))).status, 404)
    assert.deepEqual((await w.call('coordinator', 'GET', o(w, '/assignments'))).body.data.items, [])

    // A student who joins cohort A later is added to the live roster.
    await w.call('owner', 'POST', o(w, '/invites'), { role: 'STUDENT', emails: [USERS.newcomer.email], cohortId: w.cohortA.id })
    const accepted = await w.call('newcomer', 'POST', '/org-invites/synthetic-invite-token-0001-abcdefghij/accept', { acknowledged: true })
    assert.equal(accepted.status, 200)
    const after = await w.call('owner', 'GET', o(w, `/assignments/${id}`))
    assert.deepEqual(after.body.data.students.map((s) => s.userId).sort(), [USERS.newcomer.id, USERS.s1.id].sort())

    // Completion notifications at 50% and 100%, each once.
    await w.repos.assessments.updateStudent({ assignmentId: id, userId: USERS.s1.id, patch: { status: 'COMPLETED', sessionId: 'sess-a1', completedAt: '2026-10-06T10:00:00Z' } })
    await w.campus.admin.checkCompletionThresholds(w.org.id, id)
    await w.campus.admin.checkCompletionThresholds(w.org.id, id)
    await w.repos.assessments.updateStudent({ assignmentId: id, userId: USERS.newcomer.id, patch: { status: 'COMPLETED', sessionId: 'sess-a2', completedAt: '2026-10-06T11:00:00Z' } })
    await w.campus.admin.checkCompletionThresholds(w.org.id, id)
    const ownerNotes = (await w.call('owner', 'GET', '/me/notifications')).body.data.items.filter((n) => n.kind === 'COMPLETION_THRESHOLD')
    assert.deepEqual(ownerNotes.map((n) => n.payload.threshold).sort((a, b) => a - b), [50, 100])

    assert.equal((await w.call('officer', 'POST', o(w, `/assignments/${id}/status`), { status: 'CLOSED' })).status, 200)
    assert.equal((await w.call('mentor', 'POST', o(w, `/assignments/${id}/status`), { status: 'CLOSED' })).status, 404)
    const events = await w.repos.campusAdmin.listOrgAudit(w.org.id)
    assert.ok(events.some((e) => e.action === 'assignment.launched' && e.targetId === id))
    assert.ok(events.some((e) => e.action === 'assignment.closed'))
  } finally { w.close() }
})

test('closing a window releases seats reserved by starts that never finished; finished seats stay consumed', async () => {
  const w = await world()
  try {
    const cat = await w.call('owner', 'GET', o(w, '/assessment-catalog'))
    const created = await w.call('owner', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohortA.id], windowStart: '2026-10-05T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z' })
    const id = created.body.data.id
    const ent = await w.repos.entitlements.createEntitlement({
      organizationId: w.org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5,
      validFrom: '2026-10-01T00:00:00.000Z', validUntil: '2026-12-01T00:00:00.000Z', status: 'ACTIVE',
    })
    const resolution = { allowed: true, consumptionRequired: true, entitlementId: ent.id, scope: { sponsorType: 'INSTITUTION', organizationId: w.org.id } }
    await w.campus.ledger.reserve({ resolution, user: USERS.s1, sessionId: 'sess-open-1', idempotencyKey: `start:${id}` })
    await w.repos.sessionIo.putClientEvent({ sessionId: 'sess-open-1', clientEventId: 'start', kind: 'START', response: { entitlementId: ent.id, assignmentId: id, sponsored: true } })
    await w.repos.assessments.updateStudent({ assignmentId: id, userId: USERS.s1.id, patch: { status: 'IN_PROGRESS', sessionId: 'sess-open-1', startedAt: '2026-10-06T09:00:00Z' } })
    const closed = await w.call('owner', 'POST', o(w, `/assignments/${id}/status`), { status: 'CLOSED' })
    assert.equal(closed.status, 200)
    const events = (await w.repos.entitlements.listConsumptions(ent.id)).map((c) => c.event)
    assert.deepEqual(events.sort(), ['RELEASED', 'RESERVED'])
    const audit = (await w.repos.campusAdmin.listOrgAudit(w.org.id)).find((e) => e.action === 'assignment.closed')
    assert.equal(audit.details.seatsReleased, 1)
    // Closing again releases nothing twice.
    await w.call('owner', 'POST', o(w, `/assignments/${id}/status`), { status: 'CLOSED' })
    assert.equal((await w.repos.entitlements.listConsumptions(ent.id)).filter((c) => c.event === 'RELEASED').length, 1)
  } finally { w.close() }
})

test('scoped roles cannot act outside their reach (programs, windows, moves, imports, cohort edits)', async () => {
  const w = await world()
  try {
    // Programs: coordinator (dept 2) cannot edit a program of cohort A or add cohort A.
    const pa = await w.call('owner', 'POST', o(w, '/programs'), { name: 'Commerce', cohortIds: [w.cohortA.id] })
    const pb = await w.call('owner', 'POST', o(w, '/programs'), { name: 'Engineering', cohortIds: [w.cohortB.id] })
    assert.equal((await w.call('coordinator', 'PATCH', o(w, `/programs/${pa.body.data.id}`), { status: 'ARCHIVED' })).status, 404)
    assert.equal((await w.call('coordinator', 'PATCH', o(w, `/programs/${pb.body.data.id}`), { cohortIds: [w.cohortA.id, w.cohortB.id] })).status, 403)
    assert.equal((await w.call('owner', 'GET', o(w, `/programs/${pb.body.data.id}`))).body.data.cohorts.length, 1, 'nothing written on refusal')
    assert.equal((await w.call('coordinator', 'PATCH', o(w, `/programs/${pb.body.data.id}`), { status: 'ACTIVE' })).status, 200)

    // Windows: coordinator cannot close a cohort-A assignment.
    const cat = await w.call('owner', 'GET', o(w, '/assessment-catalog'))
    const a = await w.call('owner', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohortA.id], windowStart: '2026-10-05T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z' })
    assert.equal((await w.call('coordinator', 'POST', o(w, `/assignments/${a.body.data.id}/status`), { status: 'CANCELLED' })).status, 404)
    assert.equal((await w.call('coordinator', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohortB.id], programId: pa.body.data.id, windowStart: '2026-10-05T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z' })).status, 403, 'not into another department\'s program')
    assert.equal((await w.call('owner', 'POST', o(w, '/assignments'), { definitionId: cat.body.data.items[0].id, cohortIds: [w.cohortA.id], windowStart: '2026-10-05T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z', launch: false })).status, 422, 'no drafts')

    // Moves: officer (cohort A) cannot pull student 2 (cohort B) into cohort A.
    const moved = await w.call('officer', 'POST', o(w, '/students/move'), { userIds: [USERS.s2.id], toCohortId: w.cohortA.id })
    assert.equal(moved.body.data.moved, 0)
    assert.equal((await w.call('officer', 'GET', o(w, `/students/${USERS.s2.id}`))).status, 404)

    // Imports: an out-of-scope student's email is not revealed or linked; it becomes an invitation.
    const preview = await w.call('officer', 'POST', o(w, '/imports/students'), { csv: `email,cohort\n${USERS.s2.email},Commerce 2027\n` })
    assert.deepEqual(preview.body.data.rows.map((r) => r.action), ['INVITE'])
    await w.call('officer', 'POST', o(w, `/imports/${preview.body.data.job.id}/commit`), undefined, { 'Idempotency-Key': 'officer-1' })
    assert.equal((await w.call('officer', 'GET', o(w, `/students/${USERS.s2.id}`))).status, 404, 'not linked without the student accepting')
    // Another officer-scope manager cannot read the director's import job.
    const own = await w.call('director', 'POST', o(w, '/imports/students'), { csv: 'email,cohort\nsecret@test.local,Engineering 2027\n' })
    assert.equal((await w.call('officer', 'GET', o(w, `/imports/${own.body.data.job.id}`))).status, 404)
    assert.equal((await w.call('officer', 'POST', o(w, `/imports/${own.body.data.job.id}/commit`), undefined, { 'Idempotency-Key': 'steal' })).status, 404)
    assert.equal((await w.call('owner', 'GET', o(w, `/imports/${own.body.data.job.id}`))).status, 200)

    // Cohort edits: validated references; coordinator cannot move a cohort to another department; officer only renames.
    assert.equal((await w.call('owner', 'PATCH', o(w, `/cohorts/${w.cohortA.id}`), { departmentId: '00000000-0000-4000-8000-000000000000' })).status, 422)
    assert.equal((await w.call('owner', 'PATCH', o(w, `/cohorts/${w.cohortA.id}`), { ownerUserId: USERS.s1.id })).status, 422, 'owner must be staff')
    assert.equal((await w.call('coordinator', 'PATCH', o(w, `/cohorts/${w.cohortB.id}`), { departmentId: w.d1.id })).status, 403)
    assert.equal((await w.call('officer', 'PATCH', o(w, `/cohorts/${w.cohortA.id}`), { departmentId: w.d2.id })).status, 403)
    assert.equal((await w.call('officer', 'PATCH', o(w, `/cohorts/${w.cohortA.id}`), { name: 'Commerce 2027 A' })).status, 200)
    assert.equal((await w.call('owner', 'POST', o(w, '/structure/constructor'), { name: 'x' })).status, 404)
  } finally { w.close() }
})

test('re-imports replace only reachable invites; scoped previews reveal nothing; a failed commit can be retried', async () => {
  const w = await world()
  try {
    // A pending cohort-A invite (owner) for someone not yet enrolled.
    await w.call('owner', 'POST', o(w, '/invites'), { role: 'STUDENT', emails: ['pending@test.local'], cohortId: w.cohortA.id })
    const firstInvite = (await w.repos.campusAdmin.listOrgInvites(w.org.id)).find((i) => i.email === 'pending@test.local')
    // Coordinator (dept 2) imports the same email into cohort B: no hint, and the cohort-A link survives.
    const p = await w.call('coordinator', 'POST', o(w, '/imports/students'), { csv: 'email,cohort\npending@test.local,Engineering 2027\n' })
    assert.equal(p.body.data.rows[0].pendingInvite, false)
    await w.call('coordinator', 'POST', o(w, `/imports/${p.body.data.job.id}/commit`), undefined, { 'Idempotency-Key': 'coord-1' })
    assert.equal((await w.repos.campusAdmin.listOrgInvites(w.org.id)).find((i) => i.id === firstInvite.id).status, 'PENDING')
    // The owner re-imports into cohort A: the old link is replaced (one working link), and audited.
    const q = await w.call('owner', 'POST', o(w, '/imports/students'), { csv: 'email,cohort\npending@test.local,Commerce 2027\n' })
    assert.equal(q.body.data.rows[0].pendingInvite, true)
    await w.call('owner', 'POST', o(w, `/imports/${q.body.data.job.id}/commit`), undefined, { 'Idempotency-Key': 'owner-1' })
    assert.equal((await w.repos.campusAdmin.listOrgInvites(w.org.id)).find((i) => i.id === firstInvite.id).status, 'REVOKED')
    const audit = (await w.repos.campusAdmin.listOrgAudit(w.org.id)).find((e) => e.action === 'import.committed' && e.targetId === q.body.data.job.id)
    assert.ok(audit.details.replacedInvites.includes(firstInvite.id))

    // A commit that fails mid-way frees its claim; the same key then succeeds.
    const r = await w.call('owner', 'POST', o(w, '/imports/students'), { csv: 'email,cohort\nretry@test.local,Commerce 2027\n' })
    const original = w.repos.campusAdmin.commitImportJob
    w.repos.campusAdmin.commitImportJob = async () => { throw new Error('synthetic failure') }
    assert.equal((await w.call('owner', 'POST', o(w, `/imports/${r.body.data.job.id}/commit`), undefined, { 'Idempotency-Key': 'retry-1' })).status, 500)
    w.repos.campusAdmin.commitImportJob = original
    const again = await w.call('owner', 'POST', o(w, `/imports/${r.body.data.job.id}/commit`), undefined, { 'Idempotency-Key': 'retry-1' })
    assert.equal(again.status, 201)
    assert.equal(again.body.data.job.status, 'COMMITTED')

    // Team viewer flags and own-row marker drive what the UI offers.
    const owner = (await w.call('owner', 'GET', o(w, '/members'))).body.data
    assert.deepEqual(owner.viewer, { canInvite: true, canManageRoles: true })
    assert.equal(owner.members.find((m) => m.id === USERS.owner.id).isSelf, true)
    assert.deepEqual((await w.call('officer', 'GET', o(w, '/members'))).body.data.viewer, { canInvite: true, canManageRoles: false })
    // A mentor cannot resend a student invite (students.manage), even with its id.
    const pendingNow = (await w.repos.campusAdmin.listOrgInvites(w.org.id)).find((i) => i.status === 'PENDING')
    assert.equal((await w.call('mentor', 'POST', o(w, `/invites/${pendingNow.id}/resend`))).status, 404)
  } finally { w.close() }
})

test('programs: create with cohorts, scoped listing, validation', async () => {
  const w = await world()
  try {
    assert.equal((await w.call('mentor', 'POST', o(w, '/programs'), { name: 'P' })).status, 404)
    assert.equal((await w.call('owner', 'POST', o(w, '/programs'), { name: 'P', cohortIds: [w.foreignCohort.id] })).status, 422)
    assert.equal((await w.call('owner', 'POST', o(w, '/programs'), { name: 'P', startsOn: '2026-12-01', endsOn: '2026-11-01' })).status, 422)
    const p = await w.call('owner', 'POST', o(w, '/programs'), { name: 'Commerce readiness', cohortIds: [w.cohortA.id], startsOn: '2026-10-01', endsOn: '2027-03-31' })
    assert.equal(p.status, 201)
    assert.equal(p.body.data.status, 'DRAFT')
    const q = await w.call('owner', 'POST', o(w, '/programs'), { name: 'Engineering readiness', cohortIds: [w.cohortB.id] })
    assert.deepEqual((await w.call('coordinator', 'GET', o(w, '/programs'))).body.data.items.map((x) => x.id), [q.body.data.id])
    assert.deepEqual((await w.call('mentor', 'GET', o(w, '/programs'))).body.data.items.map((x) => x.id), [p.body.data.id])
    assert.equal((await w.call('coordinator', 'GET', o(w, `/programs/${p.body.data.id}`))).status, 404)
    const upd = await w.call('owner', 'PATCH', o(w, `/programs/${p.body.data.id}`), { status: 'ACTIVE' })
    assert.equal(upd.body.data.status, 'ACTIVE')
    const detail = await w.call('owner', 'GET', o(w, `/programs/${p.body.data.id}`))
    assert.deepEqual(detail.body.data.cohorts.map((c) => c.id), [w.cohortA.id])
  } finally { w.close() }
})

test('team: role changes audited; officers cannot manage; owner access protected; last owner kept', async () => {
  const w = await world()
  try {
    const list = await w.call('officer', 'GET', o(w, '/members'))
    assert.equal(list.status, 200)
    assert.ok(list.body.data.members.every((x) => x.role !== 'STUDENT'))
    assert.equal((await w.call('mentor', 'GET', o(w, '/members'))).status, 404)

    const mentorId = w.memberships.mentor.id
    assert.equal((await w.call('officer', 'PATCH', o(w, `/members/${mentorId}`), { role: 'PLACEMENT_OFFICER' })).status, 403)
    assert.equal((await w.call('director', 'PATCH', o(w, `/members/${mentorId}`), { role: 'STUDENT' })).status, 422)
    assert.equal((await w.call('director', 'PATCH', o(w, `/members/${mentorId}`), { role: 'ORG_OWNER' })).status, 403)
    assert.equal((await w.call('director', 'PATCH', o(w, `/members/${w.memberships.owner.id}`), { role: 'PLACEMENT_OFFICER' })).status, 403)
    assert.equal((await w.call('director', 'PATCH', o(w, `/members/${w.memberships.director.id}`), { role: 'ORG_OWNER' })).status, 403, 'not self')
    const changed = await w.call('director', 'PATCH', o(w, `/members/${mentorId}`), { role: 'PLACEMENT_OFFICER' })
    assert.equal(changed.status, 200)
    assert.equal(changed.body.data.role, 'PLACEMENT_OFFICER')
    const events = await w.repos.campusAdmin.listOrgAudit(w.org.id)
    const roleEvent = events.find((e) => e.action === 'role.changed')
    assert.deepEqual(roleEvent.details, { from: 'FACULTY_MENTOR', to: 'PLACEMENT_OFFICER' })
    assert.ok(w.audits.some((a) => a.type === 'campus.role.changed'))
    const mentorNotes = await w.call('mentor', 'GET', '/me/notifications')
    assert.ok(mentorNotes.body.data.items.some((n) => n.kind === 'ROLE_CHANGED'))
    // The mentor's old role no longer grants anything; the new one does.
    assert.equal((await w.call('mentor', 'GET', o(w, '/members'))).status, 200)

    // Owners: only an owner can change another owner, and one owner always remains.
    const owner2 = await w.repos.memberships.upsertMembership({ organizationId: w.org.id, userId: USERS.owner2.id, role: 'ORG_OWNER', status: 'ACTIVE' })
    assert.equal((await w.call('owner', 'PATCH', o(w, `/members/${owner2.id}`), { role: 'PLACEMENT_DIRECTOR' })).status, 200)
    const ownerMembership = (await w.repos.campusAdmin.listOrgMemberships(w.org.id)).find((m) => m.userId === USERS.owner.id && m.role === 'ORG_OWNER')
    await assert.rejects(() => w.campus.admin.assertNotLastOwner(w.org.id, ownerMembership), (e) => e.code === 'CONFLICT')
    assert.equal((await w.call('owner', 'DELETE', o(w, `/members/${w.memberships.owner.id}`))).status, 403, 'cannot remove yourself')
    assert.equal((await w.call('director', 'DELETE', o(w, `/members/${w.memberships.officer.id}`))).status, 200)
    assert.equal((await w.call('officer', 'GET', o(w, '/overview'))).status, 404, 'removed member loses access')
    assert.equal((await w.call('outsider', 'PATCH', o(w, `/members/${mentorId}`), { role: 'PLACEMENT_OFFICER' })).status, 404)
  } finally { w.close() }
})

test('invite resend revokes the old link; audit log + onboarding are org-admin only and resumable', async () => {
  const w = await world()
  try {
    const sent = await w.call('owner', 'POST', o(w, '/invites'), { role: 'STUDENT', emails: ['later@test.local'], cohortId: w.cohortA.id })
    const inviteId = sent.body.data[0].id
    const resent = await w.call('owner', 'POST', o(w, `/invites/${inviteId}/resend`))
    assert.equal(resent.status, 200)
    const invites = await w.repos.campusAdmin.listOrgInvites(w.org.id)
    assert.equal(invites.find((i) => i.id === inviteId).status, 'REVOKED')
    assert.equal(invites.filter((i) => i.status === 'PENDING').length, 1)
    assert.equal((await w.call('mentor', 'POST', o(w, `/invites/${resent.body.data.id}/resend`))).status, 404)

    assert.equal((await w.call('officer', 'GET', o(w, '/audit'))).status, 404)
    const log = await w.call('director', 'GET', o(w, '/audit'))
    assert.equal(log.status, 200)
    assert.ok(log.body.data.items.some((e) => e.action === 'invite.resent'))

    assert.equal((await w.call('officer', 'GET', o(w, '/onboarding'))).status, 404)
    const initial = await w.call('owner', 'GET', o(w, '/onboarding'))
    assert.equal(initial.body.data.steps.length, 9)
    assert.deepEqual(initial.body.data.completedSteps, [])
    assert.equal((await w.call('owner', 'PUT', o(w, '/onboarding'), { completedSteps: ['hack'] })).status, 422)
    await w.call('owner', 'PUT', o(w, '/onboarding'), { completedSteps: ['profile', 'structure'], data: { lastStep: 'team' } })
    const resumed = await w.call('director', 'GET', o(w, '/onboarding'))
    assert.deepEqual(resumed.body.data.completedSteps, ['profile', 'structure'])
    assert.equal(resumed.body.data.data.lastStep, 'team')
  } finally { w.close() }
})

test('no route edits assessment definitions, rubrics or prompts; campus flag off is dark', async () => {
  const w = await world()
  try {
    for (const [method, path] of [
      ['PATCH', '/assessment-catalog/any'], ['PUT', '/assessment-catalog/any'], ['POST', '/assessment-definitions'],
      ['GET', '/rubrics'], ['PUT', '/rubrics/any'], ['POST', '/prompts'], ['GET', '/prompts/judge'],
    ]) assert.equal((await w.call('owner', method, o(w, path), method === 'GET' ? undefined : {})).status, 404, `${method} ${path}`)
    process.env.PRISM_CAMPUS_ENABLED = 'false'
    assert.equal((await w.call('owner', 'GET', o(w, '/overview'))).status, 404)
    assert.equal((await w.call('owner', 'GET', '/me/notifications')).status, 404)
  } finally {
    process.env.PRISM_CAMPUS_ENABLED = 'true'
    w.close()
  }
})
