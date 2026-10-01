// C3.08–C3.12, C3.15 — campus isolation through the real /api/v1 route
// handlers with memory repositories. Proves: an organization never sees a
// personal report; other organizations see nothing; expired sponsorship is
// named; campus starts never touch personal entitlements; every allowed
// student-level read is audited; flag off → 404; store absent → 503.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { hashToken } from '../domain/memberships/inviteService.js'

process.env.PRISM_CAMPUS_ENABLED = 'true' // inside this test process only (K2)

const NOW = new Date('2026-10-01T10:00:00Z')
const day = 86400000
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()

const USERS = {
  ownerA: { id: 'owner-a', email: 'owner-a@test.local', name: 'Owner A' },
  officer: { id: 'officer-a', email: 'officer-a@test.local', name: 'Officer A' },
  officerOther: { id: 'officer-a2', email: 'officer-a2@test.local', name: 'Officer A2' },
  coordinator: { id: 'coord-a', email: 'coord-a@test.local', name: 'Coordinator A' },
  mentor: { id: 'mentor-a', email: 'mentor-a@test.local', name: 'Mentor A' },
  ownerB: { id: 'owner-b', email: 'owner-b@test.local', name: 'Owner B' },
  student: { id: 'student-s', email: 'student@test.local', name: 'Synthetic Student' },
  newcomer: { id: 'newcomer', email: 'newcomer@test.local', name: 'Newcomer' },
  stranger: { id: 'stranger', email: 'stranger@test.local', name: 'Stranger' },
}

async function world({ storeUp = true } = {}) {
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const orgA = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const orgB = await repos.organizations.createOrganization({ name: 'Other College', slug: 'other-c', organizationType: 'COLLEGE', status: 'ACTIVE' })
  const dept = await repos.organizations.createDepartment({ organizationId: orgA.id, name: 'Synthetic Department' })
  const dept2 = await repos.organizations.createDepartment({ organizationId: orgA.id, name: 'Second Department' })
  const cohort = await repos.organizations.createCohort({ organizationId: orgA.id, departmentId: dept.id, name: 'Cohort One' })
  const m = (org, user, role, extra = {}) => repos.memberships.upsertMembership({ organizationId: org.id, userId: user.id, role, status: 'ACTIVE', ...extra })
  await m(orgA, USERS.ownerA, 'ORG_OWNER')
  await m(orgA, USERS.officer, 'PLACEMENT_OFFICER', { scope: { cohortIds: [cohort.id] } })
  await m(orgA, USERS.officerOther, 'PLACEMENT_OFFICER', { scope: { cohortIds: ['00000000-0000-0000-0000-000000000000'] } })
  await m(orgA, USERS.coordinator, 'DEPARTMENT_COORDINATOR', { departmentId: dept2.id })
  await m(orgA, USERS.mentor, 'FACULTY_MENTOR', { scope: { cohortIds: [] } })
  await m(orgB, USERS.ownerB, 'ORG_OWNER')
  await m(orgA, USERS.student, 'STUDENT')
  await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: USERS.student.id })

  // Sessions: one personal (no scope row), one sponsored by A, one by B.
  const personalSession = 'sess-personal-1'
  const sponsoredA = 'sess-sponsored-a'
  const sponsoredB = 'sess-sponsored-b'
  await repos.scopes.createSessionScope({ sessionId: sponsoredA, ownerUserId: USERS.student.id, sponsorType: 'INSTITUTION', sponsorOrganizationId: orgA.id, workspaceId: 'ws-a', cohortId: cohort.id, visibilityPolicy: 'OWNER_AND_SPONSOR', createdBy: USERS.student.id })
  await repos.scopes.createSessionScope({ sessionId: sponsoredB, ownerUserId: USERS.stranger.id, sponsorType: 'INSTITUTION', sponsorOrganizationId: orgB.id, workspaceId: 'ws-b', visibilityPolicy: 'OWNER_AND_SPONSOR', createdBy: USERS.stranger.id })
  const owners = { [personalSession]: USERS.student.id, [sponsoredA]: USERS.student.id, [sponsoredB]: USERS.stranger.id }

  let tokenSeq = 0
  const tokens = []
  const state = { storeUp }
  const campus = createCampusContext({
    repos,
    campusStoreAvailable: () => state.storeUp,
    clock: () => NOW,
    tokenFactory: () => { const t = `synthetic-token-${String(++tokenSeq).padStart(4, '0')}-abcdefghij`; tokens.push(t); return t },
    sessionOwner: async (sid) => owners[sid] || null,
    audit: () => {},
  })
  const requireUser = (req, _res, next) => {
    const user = USERS[req.get('x-test-user')]
    if (!user) return next(Object.assign(new Error('no user'), { status: 401 }))
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
    return { status: r.status, body: await r.json().catch(() => null), requestId: r.headers.get('x-request-id') }
  }
  return { repos, orgA, orgB, cohort, dept, personalSession, sponsoredA, sponsoredB, campus, call, tokens, state, close: () => server.close() }
}

test('(1)(2)(5) sponsored reads: personal → 404, other org → 404, scoped readers only, every allowed read audited', async (t) => {
  const w = await world()
  t.after(w.close)
  const A = w.orgA.id
  assert.equal((await w.call('ownerA', 'GET', `/organizations/${A}/sessions/${w.personalSession}`)).status, 404, 'campus admin cannot see a personal session')
  assert.equal((await w.call('ownerB', 'GET', `/organizations/${w.orgB.id}/sessions/${w.sponsoredA}`)).status, 404, 'other org sees nothing')
  assert.equal((await w.call('ownerB', 'GET', `/organizations/${A}/sessions/${w.sponsoredA}`)).status, 404, 'non-member sees nothing')
  assert.equal((await w.call('ownerA', 'GET', `/organizations/${A}/sessions/${w.sponsoredB}`)).status, 404, 'another org\'s session is invisible')
  assert.equal((await w.call('officerOther', 'GET', `/organizations/${A}/sessions/${w.sponsoredA}`)).status, 404, 'unassigned officer denied')
  assert.equal((await w.call('coordinator', 'GET', `/organizations/${A}/sessions/${w.sponsoredA}`)).status, 404, 'other department denied')
  assert.equal((await w.call('mentor', 'GET', `/organizations/${A}/sessions/${w.sponsoredA}`)).status, 404, 'unassigned mentor denied')
  assert.equal((await w.call('student', 'GET', `/organizations/${A}/sessions/${w.sponsoredA}`)).status, 404, 'students use their own surfaces')
  assert.equal((await w.repos.audit.listDataAccess({ organizationId: A })).length, 0, 'denied reads write no access rows')

  const owner = await w.call('ownerA', 'GET', `/organizations/${A}/sessions/${w.sponsoredA}`)
  assert.equal(owner.status, 200)
  assert.equal(owner.body.data.access, 'SPONSORSHIP')
  const officer = await w.call('officer', 'GET', `/organizations/${A}/sessions/${w.sponsoredA}`)
  assert.equal(officer.status, 200)
  const events = await w.repos.audit.listDataAccess({ organizationId: A })
  assert.equal(events.length, 2)
  assert.deepEqual(events.map((e) => [e.actorUserId, e.subjectUserId, e.resourceType, e.resourceId, e.action]), [
    ['owner-a', 'student-s', 'ASSESSMENT_SESSION', w.sponsoredA, 'READ'],
    ['officer-a', 'student-s', 'ASSESSMENT_SESSION', w.sponsoredA, 'READ'],
  ])
  assert.ok(events.every((e) => e.requestId), 'request ids recorded')
})

test('a personal session becomes readable only through the owner\'s explicit, live share grant', async (t) => {
  const w = await world()
  t.after(w.close)
  const A = w.orgA.id
  const grant = await w.repos.sharing.createShareGrant({ ownerUserId: 'student-s', recipientType: 'ORGANIZATION', recipientOrganizationId: A, expiresAt: iso(7 * day), resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: w.personalSession, disclosureLevel: 'SUMMARY' }] })
  const shared = await w.call('ownerA', 'GET', `/organizations/${A}/sessions/${w.personalSession}`)
  assert.equal(shared.status, 200)
  assert.equal(shared.body.data.access, 'SHARE_GRANT')
  assert.equal((await w.call('ownerB', 'GET', `/organizations/${w.orgB.id}/sessions/${w.personalSession}`)).status, 404, 'a grant to A is not a grant to B')
  await w.repos.sharing.revokeShareGrant(grant.id, 'student-s', NOW.toISOString())
  assert.equal((await w.call('ownerA', 'GET', `/organizations/${A}/sessions/${w.personalSession}`)).status, 404, 'revoked grant closes access')
})

test('scoped readers only: a shared personal session is not readable by staff outside the student\'s scope', async (t) => {
  const w = await world()
  t.after(w.close)
  const A = w.orgA.id
  await w.repos.sharing.createShareGrant({ ownerUserId: 'student-s', recipientType: 'ORGANIZATION', recipientOrganizationId: A, expiresAt: iso(7 * day), resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: w.personalSession, disclosureLevel: 'SUMMARY' }] })
  assert.equal((await w.call('mentor', 'GET', `/organizations/${A}/sessions/${w.personalSession}`)).status, 404, 'unassigned mentor')
  assert.equal((await w.call('coordinator', 'GET', `/organizations/${A}/sessions/${w.personalSession}`)).status, 404, 'other department')
  assert.equal((await w.call('officerOther', 'GET', `/organizations/${A}/sessions/${w.personalSession}`)).status, 404, 'unassigned officer')
  assert.equal((await w.call('officer', 'GET', `/organizations/${A}/sessions/${w.personalSession}`)).status, 200, 'assigned officer')
})

test('suspended organizations authorize nothing; suspended members cannot re-join through an old invite', async (t) => {
  const w = await world()
  t.after(w.close)
  const A = w.orgA.id
  w.repos.db.organizations.get(A).status = 'SUSPENDED'
  assert.equal((await w.call('ownerA', 'GET', `/organizations/${A}/sessions/${w.sponsoredA}`)).status, 404)
  w.repos.db.organizations.get(A).status = 'ACTIVE'

  await w.call('ownerA', 'POST', `/organizations/${A}/invites`, { role: 'STUDENT', emails: ['student@test.local'] })
  const membership = [...w.repos.db.memberships.values()].find((m) => m.userId === 'student-s' && m.organizationId === A)
  membership.status = 'SUSPENDED'
  const r = await w.call('student', 'POST', `/org-invites/${w.tokens[0]}/accept`, { acknowledged: true })
  assert.equal(r.status, 403)
  assert.equal(membership.status, 'SUSPENDED', 'still suspended')
})

test('inviters can never hand out access they do not hold', async (t) => {
  const w = await world()
  t.after(w.close)
  const A = w.orgA.id
  const otherCohort = await w.repos.organizations.createCohort({ organizationId: A, departmentId: w.dept.id, name: 'Unassigned Cohort' })
  assert.equal((await w.call('officer', 'POST', `/organizations/${A}/invites`, { role: 'FACULTY_MENTOR', emails: ['m1@test.local'], cohortId: otherCohort.id })).status, 404, 'officer → mentor on an unassigned cohort')
  assert.equal((await w.call('officer', 'POST', `/organizations/${A}/invites`, { role: 'FACULTY_MENTOR', emails: ['m2@test.local'], cohortId: w.cohort.id })).status, 201, 'officer → mentor on own cohort')
  const foreignDept = await w.repos.organizations.createDepartment({ organizationId: w.orgB.id, name: 'Foreign Department' })
  assert.equal((await w.call('ownerA', 'POST', `/organizations/${A}/invites`, { role: 'FACULTY_MENTOR', emails: ['m3@test.local'], departmentId: foreignDept.id })).status, 422, 'another org\'s department')
  assert.equal((await w.call('coordinator', 'POST', `/organizations/${A}/invites`, { role: 'STUDENT', emails: ['s9@test.local'], cohortId: w.cohort.id })).status, 404, 'coordinator outside the cohort\'s department')
})

test('invite tokens never reach request logs', async () => {
  const { redactUrl } = await import('../lib/logger.js')
  assert.equal(redactUrl('/api/v1/org-invites/abc.DEF_123-xyz/accept?x=1'), '/api/v1/org-invites/[redacted]/accept?x=1')
  assert.equal(redactUrl('/api/v1/org-invites/abc'), '/api/v1/org-invites/[redacted]')
  assert.equal(redactUrl('/API/V1/ORG-INVITES/SecretToken/accept'), '/API/V1/ORG-INVITES/[redacted]/accept')
  assert.equal(redactUrl('/api/v1/me'), '/api/v1/me')
})

test('(3) an expired sponsorship is reported as ENTITLEMENT_EXPIRED in the campus workspace', async (t) => {
  const w = await world()
  t.after(w.close)
  await w.repos.entitlements.createEntitlement({ organizationId: w.orgA.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 10, validFrom: iso(-60 * day), validUntil: iso(-day), status: 'ACTIVE' })
  const list = await w.call('student', 'GET', '/workspaces')
  const campusWs = list.body.data.find((ws) => ws.type === 'CAMPUS_STUDENT')
  assert.ok(campusWs)
  const r = await w.call('student', 'POST', '/entitlements/check', { action: 'assessment.start' }, { 'X-Prism-Workspace': campusWs.id })
  assert.equal(r.status, 200)
  assert.equal(r.body.data.allowed, false)
  assert.equal(r.body.data.reason, 'ENTITLEMENT_EXPIRED')
})

test('(4) a campus start reserves only sponsorship; personal entitlements are never touched', async (t) => {
  const w = await world()
  t.after(w.close)
  const personal = await w.repos.entitlements.createEntitlement({ userId: 'student-s', sourceType: 'PERSONAL_PURCHASE', productCode: 'PRISM_PERSONAL_ASSESSMENT', quantity: 1, validFrom: iso(-day), status: 'ACTIVE' })
  const sponsor = await w.repos.entitlements.createEntitlement({ organizationId: w.orgA.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5, validFrom: iso(-day), validUntil: iso(30 * day), status: 'ACTIVE' })
  const workspaces = await w.campus.workspaceService.listWorkspaces(USERS.student)
  const campusWs = workspaces.find((ws) => ws.type === 'CAMPUS_STUDENT')
  const resolution = await w.campus.resolver.resolveEntitlement({ user: USERS.student, workspace: campusWs })
  assert.equal(resolution.entitlementId, sponsor.id)
  await w.campus.ledger.reserve({ resolution, user: USERS.student, sessionId: 'sess-new', idempotencyKey: 'start-new' })
  await w.campus.sessionScopes.recordSponsoredStart({ sessionId: 'sess-new', user: USERS.student, workspace: campusWs, cohortId: w.cohort.id })
  assert.equal((await w.repos.entitlements.getEntitlement(personal.id)).consumedQuantity, 0)
  assert.deepEqual(await w.repos.entitlements.listConsumptions(personal.id), [])
  assert.equal((await w.repos.entitlements.getEntitlement(sponsor.id)).consumedQuantity, 1)
  const scope = await w.campus.sessionScopes.resolveSessionScope('sess-new')
  assert.equal(scope.sponsorOrganizationId, w.orgA.id)
  const legacy = await w.campus.sessionScopes.resolveSessionScope('legacy-session', { ownerUserId: 'student-s' })
  assert.equal(legacy.sponsorType, 'PERSONAL')
  assert.equal(legacy.visibilityPolicy, 'OWNER_ONLY')
})

test('C3.12: campus routes are 404 with the flag off and 503 without the campus store', async (t) => {
  const w = await world()
  t.after(w.close)
  const A = w.orgA.id
  process.env.PRISM_CAMPUS_ENABLED = 'false'
  try {
    for (const [method, path] of [['GET', `/organizations/${A}`], ['POST', `/organizations/${A}/invites`], ['GET', `/organizations/${A}/sessions/x`], ['GET', '/org-invites/whatever-token-value-000000'], ['POST', '/org-invites/whatever-token-value-000000/accept']]) {
      const r = await w.call('ownerA', method, path, method === 'POST' ? {} : undefined)
      assert.equal(r.status, 404, `${method} ${path}`)
      assert.equal(r.body.error.code, 'NOT_FOUND')
    }
    const list = await w.call('student', 'GET', '/workspaces')
    assert.deepEqual(list.body.data.map((ws) => ws.type), ['PERSONAL'], 'campus workspaces vanish with the flag off')
  } finally {
    process.env.PRISM_CAMPUS_ENABLED = 'true'
  }
  w.state.storeUp = false
  const down = await w.call('ownerA', 'GET', `/organizations/${A}`)
  assert.equal(down.status, 503)
  assert.equal(down.body.error.code, 'CAMPUS_STORE_UNAVAILABLE')
  const me = await w.call('student', 'GET', '/me')
  assert.deepEqual(me.body.data.workspaces.map((ws) => ws.type), ['PERSONAL'], 'personal still works without the campus store')
})

test('C3.09/C3.08: workspaces list, activate and the workspace header are validated server-side', async (t) => {
  const w = await world()
  t.after(w.close)
  const me = await w.call('student', 'GET', '/me')
  assert.deepEqual(me.body.data.workspaces.map((ws) => ws.type), ['PERSONAL', 'CAMPUS_STUDENT'])
  const campusWs = me.body.data.workspaces[1]
  assert.equal(campusWs.organizationName, 'Synthetic University')
  assert.ok(campusWs.permissions.includes('students.sponsored_result.read'))
  assert.ok(!campusWs.permissions.includes('personal_result.read'))
  const admin = (await w.call('ownerA', 'GET', '/workspaces')).body.data.find((ws) => ws.type === 'CAMPUS_ADMIN')
  assert.ok(admin.permissions.includes('org.manage'))

  const act = await w.call('student', 'POST', `/workspaces/${campusWs.id}/activate`)
  assert.equal(act.status, 200)
  assert.equal(act.body.data.entitlements.canStartAssessment, false)
  assert.equal(act.body.data.entitlements.reason, 'ENTITLEMENT_REQUIRED')
  assert.equal((await w.call('stranger', 'POST', `/workspaces/${campusWs.id}/activate`)).status, 404, 'someone else\'s workspace')
  const forged = await w.call('stranger', 'POST', '/entitlements/check', { action: 'assessment.start' }, { 'X-Prism-Workspace': campusWs.id })
  assert.equal(forged.status, 403)
  const bad = await w.call('student', 'POST', '/entitlements/check', { action: 'assessment.start' }, { 'X-Prism-Workspace': 'not a workspace' })
  assert.equal(bad.status, 422)
  const personal = await w.call('student', 'POST', '/entitlements/check', { action: 'assessment.start' })
  assert.deepEqual(personal.body.data.scope, { workspaceId: 'personal', organizationId: null, sponsorType: 'PERSONAL' })
})

test('C3.10: invite → preview → accept links the existing account; guards on role, email, acknowledgement, expiry', async (t) => {
  const w = await world()
  t.after(w.close)
  const A = w.orgA.id
  const created = await w.call('ownerA', 'POST', `/organizations/${A}/invites`, { role: 'STUDENT', emails: ['Newcomer@test.local', 'newcomer@test.local'], cohortId: w.cohort.id })
  assert.equal(created.status, 201)
  assert.equal(created.body.data.length, 1, 'duplicate emails collapse')
  assert.equal(created.body.data[0].delivery, 'NOT_SENT')
  assert.ok(!JSON.stringify(created.body).includes('synthetic-token'), 'tokens never leave in responses')
  const token = w.tokens[0]
  const stored = [...w.repos.db.invites.values()][0]
  assert.equal(stored.tokenHash, hashToken(token), 'only the hash is stored')
  assert.ok(!Object.values(stored).includes(token))

  const preview = await w.call(null, 'GET', `/org-invites/${token}`)
  assert.equal(preview.status, 200)
  assert.equal(preview.body.data.organizationName, 'Synthetic University')
  assert.equal(preview.body.data.role, 'STUDENT')
  assert.match(preview.body.data.emailHint, /^n\*+@test\.local$/)
  assert.equal((await w.call(null, 'GET', '/org-invites/unknown-token-value-000000000')).status, 404)

  assert.equal((await w.call('stranger', 'POST', `/org-invites/${token}/accept`, { acknowledged: true })).body.error.code, 'INVITE_EMAIL_MISMATCH')
  assert.equal((await w.call('newcomer', 'POST', `/org-invites/${token}/accept`, {})).status, 422, 'acknowledgement required')
  const accepted = await w.call('newcomer', 'POST', `/org-invites/${token}/accept`, { acknowledged: true })
  assert.equal(accepted.status, 200)
  assert.equal(accepted.body.data.workspaceType, 'CAMPUS_STUDENT')
  const again = await w.call('newcomer', 'POST', `/org-invites/${token}/accept`, { acknowledged: true })
  assert.equal(again.body.data.alreadyAccepted, true)
  assert.equal(again.body.data.workspaceId, accepted.body.data.workspaceId)
  assert.equal((await w.call('stranger', 'POST', `/org-invites/${token}/accept`, { acknowledged: true })).status, 409)

  const workspaces = (await w.call('newcomer', 'GET', '/workspaces')).body.data
  assert.deepEqual(workspaces.map((ws) => ws.type), ['PERSONAL', 'CAMPUS_STUDENT'])
  const consents = await w.repos.sharing.listConsents('newcomer')
  assert.equal(consents.length, 1)
  assert.equal(consents[0].consentType, 'CAMPUS_SPONSORSHIP_DISCLOSURE')
  assert.deepEqual((await w.repos.organizations.listCohortsForUser(A, 'newcomer')).map((c) => c.id), [w.cohort.id])
  assert.equal([...w.repos.db.memberships.values()].filter((m) => m.userId === 'newcomer').length, 1, 'no duplicate identity or membership')

  assert.equal((await w.call('officer', 'POST', `/organizations/${A}/invites`, { role: 'ORG_OWNER', emails: ['x@test.local'] })).status, 403, 'officer cannot mint owners')
  assert.equal((await w.call('mentor', 'POST', `/organizations/${A}/invites`, { role: 'STUDENT', emails: ['x@test.local'] })).status, 404, 'mentor cannot invite')
  assert.equal((await w.call('ownerB', 'POST', `/organizations/${A}/invites`, { role: 'STUDENT', emails: ['x@test.local'] })).status, 404, 'other org cannot invite')
  assert.equal((await w.call('ownerA', 'POST', `/organizations/${A}/invites`, { role: 'STUDAI_ADMIN', emails: ['x@test.local'] })).status, 422, 'platform roles are not invitable')
  assert.equal((await w.call('ownerA', 'POST', `/organizations/${A}/invites`, { role: 'STUDENT', emails: ['not-an-email'] })).status, 422)

  const expiring = await w.call('ownerA', 'POST', `/organizations/${A}/invites`, { role: 'STUDENT', emails: ['student@test.local'] })
  assert.equal(expiring.status, 201)
  const late = [...w.repos.db.invites.values()].find((i) => i.email === 'student@test.local')
  late.expiresAt = iso(-1)
  assert.equal((await w.call('student', 'POST', `/org-invites/${w.tokens[1]}/accept`, { acknowledged: true })).status, 410)
})
