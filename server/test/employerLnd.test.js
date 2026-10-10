// PROD-READY Phase 9 — employer development-use (L&D) workspace over the real
// /api/v1 handlers with memory repositories and synthetic data only.
// Proves:
//   - flag OFF (PRISM_EMPLOYER_LND): every employer route and the Hire
//     hand-off interface are 404, an employer organization opens no workspace
//     and its invitations are not valid, and campus behaviour is unchanged;
//   - campus organization routes never serve an EMPLOYER organization;
//   - flag ON: cohorts, invites, people (participation only), sponsored
//     assessments within JOB_FAMILY_SCOPE_v1, suppressed group summaries,
//     development missions;
//   - prohibited by design: ranking / sort / filter by level or score /
//     cut-off parameters are refused (422 PROHIBITED_USE), exports are
//     aggregate-only, no individual report without the employee's share grant
//     (even when a session scope wrongly says OWNER_AND_SPONSOR), revocation
//     ends access at once;
//   - employee-side employer disclosure and consent records;
//   - the StudAI Hire evidence hand-off answers 501 and makes no network call.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { PRIMARY_CAPABILITY_IDS, capabilityInfo } from '../domain/assessments/catalog.js'
import { captureMethod, methodHash } from '../domain/assessments/frozenMethod.js'
import { hashToken } from '../domain/memberships/inviteService.js'
import { ApiError } from '../domain/http/errors.js'
import { EMPLOYER_DISCLOSURE_COPY_VERSION, EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION, employerJoinDisclosure, employerAssessmentDisclosure, employerProhibitedUses, EMPLOYER_STAFF_COPY, EMPLOYER_PURPOSE } from '../domain/employer/copy.js'
import { selectionWordingIn, prohibitedKeysIn, definitionInScope } from '../domain/employer/prohibitedUse.js'
import { HIRE_HANDOFF_CONTRACT, hireEvidenceHandoff } from '../domain/integrations/hire/index.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../domain/sharing/copyVersions.js'

// Enabled inside this test process only (K2). PRISM_EMPLOYER_LND is set per test.
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'
process.env.PRISM_CAMPUS_ANALYTICS = 'true'
process.env.PRISM_DEVELOPMENT_V2 = 'true'
const setEmployer = (on) => { if (on) process.env.PRISM_EMPLOYER_LND = 'true'; else delete process.env.PRISM_EMPLOYER_LND }

const [CAP_A, CAP_B] = PRIMARY_CAPABILITY_IDS
const day = 86400000
const u = (id, name) => ({ id, email: `${id}@test.local`, name })
const USERS = {
  owner: u('emp-owner', 'Synthetic L&D Lead'),
  mentor: u('emp-mentor', 'Synthetic Mentor'),
  employee: u('emp-employee-1', 'Synthetic Employee One'),
  employee2: u('emp-employee-2', 'Synthetic Employee Two'),
  newhire: u('emp-newhire', 'Synthetic New Hire'),
  campusOwner: u('campus-owner-e', 'Synthetic Campus Owner'),
  campusStudent: u('campus-student-e', 'Synthetic Campus Student'),
}
const SCENARIOS = {
  // The governed pool (in JOB_FAMILY_SCOPE_v1) and one bank scenario outside it.
  generalScenarios: [{ id: 'group-project', title: 'The Group Project' }, { id: 'brand-crisis', title: 'The Brand Crisis' }],
  bankScenarios: { 'syn-marketing-bank': { title: 'Synthetic marketing turnaround', blueprintId: 'STUDAI-JF-MKT-L1', version: '1.0.0', briefing: { objective: 'Synthetic.' } } },
}
const history = (lines) => [{ role: 'user', content: 'opening instruction' }, ...lines.map((l) => ({ role: 'user', content: `[Candidate]: ${l}` }))]
const LINES = ['First I would check which customers raised the issue.', 'Then I would compare the numbers before deciding.', 'I would agree next steps with the team lead.']

function unit(sessionId, id, capabilityId, turn, { rubric = 2, excerpt = null } = {}) {
  const anchors = structuredClone(capabilityInfo(capabilityId).anchors)
  return {
    evidence_id: id, session_id: sessionId, capability_id: capabilityId, evidence_status: 'PROVISIONAL', rubric_level: rubric,
    source_turn: turn, source_artifact_id: null, behavior_anchor_id: `anchor-${turn}`,
    candidate_action_json: { dialogue_excerpt: excerpt },
    provenance_json: { judge: 'synthetic', rubric_version: 'rubric.v1', resolvedRubric: { ref: 'rubric.v1', anchors, anchorsHash: methodHash(anchors) } },
    judge_agreement_json: { agreement: 0.9 }, observable_behavior: `Synthetic observed behaviour ${id}.`, legacy_row: false,
  }
}
const unitsFor = (sid) => [
  unit(sid, `${sid}-e1`, CAP_A, 1, { excerpt: 'check which customers raised the issue' }),
  unit(sid, `${sid}-e2`, CAP_A, 2), unit(sid, `${sid}-e3`, CAP_A, 3), unit(sid, `${sid}-e4`, CAP_B, 1),
]

async function world() {
  setEmployer(false)
  const now = new Date('2026-10-12T10:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const suffix = Math.random().toString(36).slice(2, 8)
  const org = await repos.organizations.createOrganization({ name: 'Synthetic Employer Ltd', slug: `syn-emp-${suffix}`, organizationType: 'EMPLOYER', status: 'ACTIVE' })
  const campusOrg = await repos.organizations.createOrganization({ name: 'Synthetic University E', slug: `syn-uni-e-${suffix}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const cohort = await repos.organizations.createCohort({ organizationId: org.id, name: 'Synthetic fresher group' })
  const m = (orgId, userId, role, extra = {}) => repos.memberships.upsertMembership({ organizationId: orgId, userId, role, status: 'ACTIVE', ...extra })
  await m(org.id, USERS.owner.id, 'ORG_OWNER')
  await m(org.id, USERS.mentor.id, 'FACULTY_MENTOR', { scope: { cohortIds: [cohort.id] } })
  for (const e of [USERS.employee, USERS.employee2]) {
    await m(org.id, e.id, 'STUDENT')
    await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: e.id })
  }
  await m(campusOrg.id, USERS.campusOwner.id, 'ORG_OWNER')
  await m(campusOrg.id, USERS.campusStudent.id, 'STUDENT')

  const state = {
    sessions: {
      'sess-emp-spons-0001': { userId: USERS.employee.id, scenarioId: 'group-project', history: history(LINES), startedAt: now.getTime() - day },
      'sess-emp-wrong-0001': { userId: USERS.employee.id, scenarioId: 'group-project', history: history(LINES), startedAt: now.getTime() - day },
      'sess-emp-pers-0001': { userId: USERS.employee.id, scenarioId: 'group-project', history: history(LINES), startedAt: now.getTime() - day },
    },
    reports: {}, admin: {},
  }
  for (const sid of Object.keys(state.sessions)) state.reports[sid] = { userId: USERS.employee.id, issuedAt: now.toISOString(), candidateName: USERS.employee.name }
  const scope = (sessionId, visibilityPolicy) => repos.scopes.createSessionScope({
    sessionId, ownerUserId: USERS.employee.id, sponsorType: 'INSTITUTION', sponsorOrganizationId: org.id,
    workspaceId: 'ws', programId: null, cohortId: cohort.id, visibilityPolicy, createdBy: USERS.employee.id,
  })
  await scope('sess-emp-spons-0001', 'OWNER_AND_SPONSOR_AGGREGATE_ONLY')
  // A wrongly written scope (PostgreSQL refuses it by trigger, 0063; the
  // memory store does not): the employer still cannot read it.
  await scope('sess-emp-wrong-0001', 'OWNER_AND_SPONSOR')
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listSessionIds: async (uid) => Object.entries(state.sessions).filter(([, s]) => s.userId === uid).map(([id]) => id),
    getSession: async (sid) => (state.sessions[sid] ? structuredClone({ sessionId: sid, ...state.sessions[sid] }) : null),
    getReport: async (sid) => (state.reports[sid] ? { sessionId: sid, ...state.reports[sid] } : null),
    adminState: async (sid) => state.admin[sid] || null,
  }
  const audits = []
  let tokens = 0
  const sent = []
  const campus = createCampusContext({
    repos, clock: () => now, legacy, scenarioSource: async () => SCENARIOS,
    evidence: { units: async (sid) => unitsFor(sid) },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
    shareTokenFactory: () => `synthetic-share-token-${String(++tokens).padStart(4, '0')}-abcdefghij`,
    sessionOwner: async (sid) => state.sessions[sid]?.userId || null,
    users: {
      findById: async (id) => Object.values(USERS).find((x) => x.id === id) || null,
      findByEmail: async (email) => Object.values(USERS).find((x) => x.email === email) || null,
    },
    sendInviteEmail: async (msg) => { sent.push(msg); return true },
    tokenFactory: () => `synthetic-invite-token-${String(++tokens).padStart(4, '0')}-abcdefghijkl`,
  })
  const cat = await campus.catalog.getCatalog()
  for (const sid of Object.keys(state.reports)) {
    const scenarioId = state.sessions[sid].scenarioId
    const form = cat.forms.find((f) => f.scenarioId === scenarioId)
    const definition = cat.definitions.find((d) => d.id === form.definitionId)
    const allocation = {
      id: scenarioId, version: form.version, rubricRef: 'rubric.v1',
      opportunities: definition.measures.map((capabilityId) => ({ id: `synthetic-${capabilityId}`, capabilityId, behaviourId: capabilityId })),
      rubric: { ref: 'rubric.v1', source: 'SYNTHETIC_UNIT_ALLOCATION', anchorsByBehaviour: Object.fromEntries(definition.measures.map((id) => [id, structuredClone(capabilityInfo(id).anchors)])) },
    }
    const methodSnapshot = captureMethod(allocation, { formId: form.id, engineVersion: 'synthetic-report-fixture' })
    const content = { ...allocation }
    delete content.rubric
    const runPin = {
      scenarioId, snapshotVersion: allocation.version, rubricRef: allocation.rubricRef, formId: form.id,
      snapshotHash: methodHash(content), engineVersion: methodSnapshot.engineVersion, methodVersion: methodSnapshot.methodVersion,
      methodSnapshot, methodHash: methodHash(methodSnapshot),
    }
    await repos.sessionIo.putClientEvent({ sessionId: sid, clientEventId: 'start', kind: 'START', response: { runPin } })
    await campus.reports.publish(sid, { reason: 'INITIAL' })
  }
  // Invitations written directly (as the campus fixtures do).
  const employerInviteToken = 'synthetic-employer-invite-token-000000001'
  await repos.memberships.createInvite({ organizationId: org.id, email: USERS.newhire.email, role: 'STUDENT', cohortId: cohort.id, tokenHash: hashToken(employerInviteToken), invitedBy: USERS.owner.id, expiresAt: new Date(now.getTime() + 7 * day).toISOString() })
  const campusInviteToken = 'synthetic-campus-invite-token-0000000001'
  await repos.memberships.createInvite({ organizationId: campusOrg.id, email: 'campus-invitee@test.local', role: 'STUDENT', tokenHash: hashToken(campusInviteToken), invitedBy: USERS.campusOwner.id, expiresAt: new Date(now.getTime() + 7 * day).toISOString() })

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
  return { repos, org, campusOrg, cohort, campus, call, audits, sent, now, employerInviteToken, campusInviteToken, close: () => { server.close(); setEmployer(false) } }
}

const E = (w, p = '') => `/employer/organizations/${w.org.id}${p}`
const employerRoutes = (w) => [
  ['GET', E(w)], ['GET', E(w, '/overview')], ['GET', E(w, '/cohorts')], ['POST', E(w, '/cohorts'), { name: 'X' }],
  ['POST', E(w, '/invites'), { role: 'STUDENT', emails: ['a@test.local'] }], ['GET', E(w, '/people')], ['GET', E(w, `/people/${USERS.employee.id}`)],
  ['GET', E(w, '/shared-reports')], ['GET', E(w, '/shared-reports/sess-emp-spons-0001')], ['GET', E(w, '/assessment-catalog')], ['GET', E(w, '/disclosure')],
  ['GET', E(w, '/assignments')], ['POST', E(w, '/assignments'), {}], ['GET', E(w, '/insights')], ['POST', E(w, '/insights/exports'), { view: 'capabilities' }],
  ['GET', E(w, '/development-missions')], ['GET', E(w, '/interventions')], ['POST', E(w, '/interventions'), {}],
  ['GET', '/integrations/hire/handoff'], ['POST', '/integrations/hire/handoff', {}],
]

test('flag off: every employer route and the Hire hand-off are 404; employer organizations open nothing; campus is unchanged', async () => {
  const w = await world()
  try {
    for (const [method, path, body] of employerRoutes(w)) {
      const r = await w.call('owner', method, path, body)
      assert.equal(r.status, 404, `${method} ${path}`)
      assert.equal(r.body.error.code, 'NOT_FOUND')
    }
    // Signed out too: dark before authentication.
    assert.equal((await w.call(null, 'GET', E(w))).status, 404)
    assert.equal((await w.call(null, 'GET', '/integrations/hire/handoff')).status, 404)

    const me = await w.call('owner', 'GET', '/me')
    assert.equal(me.body.data.flags.PRISM_EMPLOYER_LND, false)
    assert.deepEqual(me.body.data.workspaces.map((x) => x.type), ['PERSONAL'], 'no employer workspace while dark')
    const employeeMe = await w.call('employee', 'GET', '/me')
    assert.deepEqual(employeeMe.body.data.workspaces.map((x) => x.type), ['PERSONAL'])

    // Employer organization on the campus surface: 404.
    assert.equal((await w.call('owner', 'GET', `/organizations/${w.org.id}`)).status, 404)
    // Invitations of an employer are not valid while dark; campus invitations unchanged.
    assert.equal((await w.call('newhire', 'GET', `/org-invites/${w.employerInviteToken}`)).status, 404)
    const campusInvite = await w.call(null, 'GET', `/org-invites/${w.campusInviteToken}`)
    assert.equal(campusInvite.status, 200)
    assert.equal('organizationType' in campusInvite.body.data, false, 'campus invite payload unchanged')
    assert.equal(campusInvite.body.data.disclosureVersion, 'campus-disclosure.v1-draft')
    // An employee cannot share with an employer organization while dark.
    const share = await w.call('employee', 'POST', '/me/share-grants', { recipientType: 'ORGANIZATION', recipientOrganizationId: w.org.id, sessionId: 'sess-emp-pers-0001', disclosureLevel: 'SUMMARY', expiresInDays: 7 })
    assert.equal(share.status, 422)

    // Campus organizations: unchanged.
    const campusOrg = await w.call('campusOwner', 'GET', `/organizations/${w.campusOrg.id}`)
    assert.equal(campusOrg.status, 200)
    assert.equal(campusOrg.body.data.organizationType, 'UNIVERSITY')
    const ws = (await w.call('campusStudent', 'GET', '/me')).body.data.workspaces.find((x) => x.type === 'CAMPUS_STUDENT')
    assert.equal(ws.visibilityPolicy, 'OWNER_AND_SPONSOR')
    assert.equal('organizationType' in ws, false, 'campus workspace payload unchanged')
    const adminWs = (await w.call('campusOwner', 'GET', '/me')).body.data.workspaces.find((x) => x.organizationId === w.campusOrg.id)
    assert.equal(adminWs.type, 'CAMPUS_ADMIN')
  } finally { w.close() }
})

test('campus organization routes never serve an EMPLOYER organization, flag on or off', async () => {
  const w = await world()
  try {
    for (const on of [false, true]) {
      setEmployer(on)
      for (const p of ['', '/overview', '/students', '/students/export', '/cohorts', '/assignments', '/analytics/capabilities', '/interventions', '/sessions/sess-emp-wrong-0001/report', '/billing', '/members']) {
        const r = await w.call('owner', 'GET', `/organizations/${w.org.id}${p}`)
        assert.equal(r.status, 404, `flag ${on}: /organizations/:employer${p}`)
      }
      assert.equal((await w.call('campusOwner', 'GET', `/organizations/${w.campusOrg.id}/students`)).status, 200)
    }
  } finally { w.close() }
})

test('flag on: workspaces — staff open the employer workspace, employees an aggregate-only sponsored one; campus unchanged', async () => {
  const w = await world()
  try {
    setEmployer(true)
    const owner = (await w.call('owner', 'GET', '/me')).body.data
    assert.equal(owner.flags.PRISM_EMPLOYER_LND, true)
    const ews = owner.workspaces.find((x) => x.organizationId === w.org.id)
    assert.equal(ews.type, 'EMPLOYER')
    assert.equal(ews.organizationType, 'EMPLOYER')
    assert.equal(ews.visibilityPolicy, null)
    const activated = await w.call('owner', 'POST', `/workspaces/${ews.id}/activate`)
    assert.equal(activated.status, 200)
    assert.equal(activated.body.data.entitlements, null, 'staff workspace has no assessment entitlement')

    const employee = (await w.call('employee', 'GET', '/me')).body.data.workspaces.find((x) => x.organizationId === w.org.id)
    assert.equal(employee.type, 'CAMPUS_STUDENT')
    assert.equal(employee.organizationType, 'EMPLOYER')
    assert.equal(employee.visibilityPolicy, 'OWNER_AND_SPONSOR_AGGREGATE_ONLY')

    // A sponsored start in the employee workspace records the aggregate-only policy.
    const rec = await w.campus.sessionScopes.recordSponsoredStart({ sessionId: 'sess-emp-new-0001', user: USERS.employee, workspace: employee })
    assert.equal(rec.visibilityPolicy, 'OWNER_AND_SPONSOR_AGGREGATE_ONLY')
    const campusWs = (await w.call('campusStudent', 'GET', '/me')).body.data.workspaces.find((x) => x.type === 'CAMPUS_STUDENT')
    const recCampus = await w.campus.sessionScopes.recordSponsoredStart({ sessionId: 'sess-campus-new-0001', user: USERS.campusStudent, workspace: campusWs })
    assert.equal(recCampus.visibilityPolicy, 'OWNER_AND_SPONSOR', 'campus default unchanged')

    // Employees are not staff: every employer route is 404 for them.
    for (const p of ['', '/overview', '/people', '/shared-reports', '/insights']) assert.equal((await w.call('employee', 'GET', E(w, p))).status, 404, p)
    // The employer router never serves a campus organization.
    assert.equal((await w.call('campusOwner', 'GET', `/employer/organizations/${w.campusOrg.id}`)).status, 404)
  } finally { w.close() }
})

test('flag on: summary, cohorts within the job-family scope, invitations and people (participation only)', async () => {
  const w = await world()
  try {
    setEmployer(true)
    const summary = await w.call('owner', 'GET', E(w))
    assert.equal(summary.status, 200)
    assert.equal(summary.body.data.organizationType, 'EMPLOYER')
    assert.deepEqual(summary.body.data.roles, [{ role: 'ORG_OWNER', label: 'Workspace owner' }])
    assert.deepEqual(summary.body.data.jobFamilyScope.families.map((f) => f.id), ['graduate-business-operations', 'customer-facing-growth'])
    assert.equal(summary.body.data.copy.purpose, EMPLOYER_PURPOSE)

    const created = await w.call('owner', 'POST', E(w, '/cohorts'), { name: 'Synthetic operations freshers', jobFamily: 'graduate-business-operations' })
    assert.equal(created.status, 201)
    assert.deepEqual(created.body.data.jobFamily, { id: 'graduate-business-operations', name: 'Graduate Business Operations' })
    const outside = await w.call('owner', 'POST', E(w, '/cohorts'), { name: 'Synthetic engineers', jobFamily: 'software-engineering' })
    assert.equal(outside.status, 422, 'a job family outside JOB_FAMILY_SCOPE_v1 is refused')
    const tagged = await w.call('owner', 'POST', E(w, '/cohorts'), { name: 'Synthetic tags', tags: ['Software Engineer'] })
    assert.equal(tagged.status, 422, 'no free-text tags (only governed job families)')

    const invite = await w.call('owner', 'POST', E(w, '/invites'), { role: 'STUDENT', emails: ['Fresher.One@Test.Local'], cohortId: created.body.data.id })
    assert.equal(invite.status, 201)
    assert.equal(invite.body.data[0].roleLabel, 'Employee')
    assert.equal(w.sent.length, 1)
    assert.equal((await w.call('owner', 'POST', E(w, '/invites'), { role: 'DEPARTMENT_COORDINATOR', emails: ['x@test.local'] })).status, 422)

    const people = await w.call('owner', 'GET', E(w, '/people'))
    assert.equal(people.status, 200)
    assert.equal(people.body.data.order, 'NAME')
    const allowed = new Set(['kind', 'userId', 'name', 'email', 'status', 'cohorts', 'assessmentStatus'])
    for (const p of people.body.data.items) for (const k of Object.keys(p)) assert.ok(allowed.has(k), `people row field ${k}`)
    const names = people.body.data.items.filter((p) => p.kind === 'MEMBER').map((p) => p.name)
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'fixed name order')
    assert.doesNotMatch(JSON.stringify(people.body), /"(level|band|score|rank|percentile|capabilities|evidence)"/i)

    const person = await w.call('owner', 'GET', E(w, `/people/${USERS.employee.id}`))
    assert.equal(person.status, 200)
    assert.deepEqual(person.body.data.sharedReports, [], 'nothing shared yet')
    assert.equal('completedSponsoredSessions' in person.body.data, false, 'no report links without a share')
  } finally { w.close() }
})

test('prohibited by design: ranking, sort/filter by level or score and cut-offs are refused, never ignored', async () => {
  const w = await world()
  try {
    setEmployer(true)
    for (const q of ['sort=level', 'orderBy=score', 'order=desc', 'minLevel=DEMONSTRATED', 'level=STRONG', 'rank=1', 'top=10', 'threshold=3', 'cutoff=2', 'percentile=90', 'band=STRONG', 'sort_by=capability', 'passMark=3']) {
      const r = await w.call('owner', 'GET', E(w, `/people?${q}`))
      assert.equal(r.status, 422, q)
      assert.equal(r.body.error.code, 'PROHIBITED_USE', q)
      assert.ok(r.body.error.details.refusedParameters.length >= 1, q)
      assert.match(r.body.error.message, /does not rank, sort or filter people by level or score/)
    }
    for (const path of ['/shared-reports?sort=level', '/assignments?orderBy=completedAt', '/insights?rank=1', '/cohorts?level=EARLY']) {
      assert.equal((await w.call('owner', 'GET', E(w, path))).body.error.code, 'PROHIBITED_USE', path)
    }
    const body = await w.call('owner', 'POST', E(w, '/cohorts'), { name: 'Synthetic', minScore: 3 })
    assert.equal(body.body.error.code, 'PROHIBITED_USE')
    const exportRank = await w.call('owner', 'POST', E(w, '/insights/exports'), { view: 'capabilities', sort: 'level' })
    assert.equal(exportRank.body.error.code, 'PROHIBITED_USE')
    // Group summaries take no filters at all here.
    assert.equal((await w.call('owner', 'GET', E(w, `/insights?cohortId=${w.cohort.id}`))).status, 422)
    // Unit: the key matcher.
    assert.deepEqual(prohibitedKeysIn({ q: 'a', cohortId: 'b', page: 1 }), [])
    assert.deepEqual(prohibitedKeysIn({ 'Sort-By': 'x', Min_Level: 1 }).length, 2)
  } finally { w.close() }
})

test('individual reports only with the employee\'s share grant; revocation ends access at once', async () => {
  const w = await world()
  try {
    setEmployer(true)
    // No grant: the sponsored (aggregate-only) and the wrongly scoped session are both 404.
    for (const sid of ['sess-emp-spons-0001', 'sess-emp-wrong-0001', 'sess-emp-pers-0001']) {
      assert.equal((await w.call('owner', 'GET', E(w, `/shared-reports/${sid}`))).status, 404, sid)
    }
    assert.equal(await w.campus.sessionScopes.authorizeSponsorRead({ actor: await w.campus.workspaceService.actorFor(USERS.owner), organizationId: w.org.id, sessionId: 'sess-emp-wrong-0001' }), null, 'sponsorship never opens an employer read')
    assert.deepEqual((await w.call('owner', 'GET', E(w, '/shared-reports'))).body.data.items, [])

    // The employee's own report view says the employer sees summaries only.
    const ews = (await w.call('employee', 'GET', '/me')).body.data.workspaces.find((x) => x.organizationId === w.org.id)
    const own = await w.call('employee', 'GET', '/assessment-sessions/sess-emp-spons-0001/report', null, { 'X-Prism-Workspace': ews.id })
    assert.equal(own.status, 200)
    assert.equal(own.body.data.privacy.visibility, 'OWNER_AND_SPONSOR_AGGREGATE_ONLY')

    const share = await w.call('employee', 'POST', '/me/share-grants', { recipientType: 'ORGANIZATION', recipientOrganizationId: w.org.id, sessionId: 'sess-emp-spons-0001', disclosureLevel: 'SUMMARY', expiresInDays: 30 }, { 'X-Prism-Workspace': ews.id })
    assert.equal(share.status, 201)
    const listed = await w.call('owner', 'GET', E(w, '/shared-reports'))
    assert.deepEqual(listed.body.data.items.map((i) => [i.sessionId, i.person.name, i.disclosureLevel]), [['sess-emp-spons-0001', USERS.employee.name, 'SUMMARY']])
    const report = await w.call('owner', 'GET', E(w, '/shared-reports/sess-emp-spons-0001'))
    assert.equal(report.status, 200)
    assert.equal(report.body.data.privacy.visibility, 'SHARED_BY_STUDENT')
    assert.equal(report.body.data.notice, EMPLOYER_STAFF_COPY.reportNotice)
    assert.deepEqual(report.body.data.report.evidence, [], 'SUMMARY disclosure: no evidence quotes')
    assert.doesNotMatch(JSON.stringify(report.body.data.report), /composite|percentile|"rank/i)
    assert.ok(w.audits.some((a) => a.type === 'report.v3.viewed' && a.payload.via === 'SHARE_GRANT' && a.payload.organizationId === w.org.id))
    const person = await w.call('owner', 'GET', E(w, `/people/${USERS.employee.id}`))
    assert.deepEqual(person.body.data.sharedReports.map((s) => s.sessionId), ['sess-emp-spons-0001'])
    // Another employee's unshared session stays closed; the mentor (cohort in scope) can read the shared one.
    assert.equal((await w.call('mentor', 'GET', E(w, '/shared-reports/sess-emp-spons-0001'))).status, 200)

    assert.equal((await w.call('employee', 'POST', `/me/share-grants/${share.body.data.id}/revoke`)).status, 200)
    assert.equal((await w.call('owner', 'GET', E(w, '/shared-reports/sess-emp-spons-0001'))).status, 404, 'revoked: gone at once')
    assert.deepEqual((await w.call('owner', 'GET', E(w, '/shared-reports'))).body.data.items, [])
  } finally { w.close() }
})

test('exports are aggregate-only; there is no route that exports, ranks or lists results per person', async () => {
  const w = await world()
  try {
    setEmployer(true)
    const ok = await w.call('owner', 'POST', E(w, '/insights/exports'), { view: 'capabilities' })
    assert.equal(ok.status, 200)
    assert.match(ok.body.data.fileName, /^prism-group-summary-capabilities\.csv$/)
    for (const name of Object.values(USERS).map((x) => x.name)) assert.equal(ok.body.data.csv.includes(name), false, `csv names ${name}`)
    for (const id of Object.values(USERS).map((x) => x.id)) assert.equal(ok.body.data.csv.includes(id), false, `csv carries ${id}`)
    for (const view of ['students', 'people', 'comparison', 'sufficiency', 'individual']) {
      assert.equal((await w.call('owner', 'POST', E(w, '/insights/exports'), { view })).status, 422, view)
    }
    assert.ok(w.audits.length >= 0)
    // Every employer route, read from the router itself: none exports people.
    const router = createV1Router({ requireUser: (_q, _s, n) => n(), campus: w.campus })
    const paths = []
    const walk = (stack) => {
      for (const layer of stack) {
        if (layer.route?.path) paths.push(String(layer.route.path))
        if (layer.handle?.stack) walk(layer.handle.stack)
      }
    }
    walk(router.stack)
    const employer = paths.filter((p) => p.startsWith('/employer/'))
    assert.ok(employer.length >= 15, `employer routes found: ${employer.length}`)
    for (const p of employer) {
      assert.doesNotMatch(p, /rank|leaderboard|sort|score|level|shortlist|individual|students\/export|people\/export/i, p)
      if (/export/.test(p)) assert.equal(p, '/employer/organizations/:orgId/insights/exports')
    }
  } finally { w.close() }
})

test('group summaries are suppressed below the minimum group size and never name a person', async () => {
  const w = await world()
  try {
    setEmployer(true)
    const r = await w.call('owner', 'GET', E(w, '/insights'))
    assert.equal(r.status, 200)
    assert.equal(r.body.data.capabilities.suppressed, true, '2 employees < minimum group size 10')
    assert.equal(r.body.data.capabilities.assessed, null)
    const text = JSON.stringify(r.body.data)
    for (const x of Object.values(USERS)) { assert.equal(text.includes(x.id), false); assert.equal(text.includes(x.name), false) }
    assert.equal(r.body.data.note, EMPLOYER_STAFF_COPY.insightsNote)
    process.env.PRISM_CAMPUS_ANALYTICS = 'false'
    assert.equal((await w.call('owner', 'GET', E(w, '/insights'))).status, 404, 'needs the campus analytics flag too')
  } finally { process.env.PRISM_CAMPUS_ANALYTICS = 'true'; w.close() }
})

test('sponsored assessments stay within JOB_FAMILY_SCOPE_v1; development missions can be assigned', async () => {
  const w = await world()
  try {
    setEmployer(true)
    const cat = await w.call('owner', 'GET', E(w, '/assessment-catalog'))
    assert.equal(cat.status, 200)
    const ids = cat.body.data.items.map((d) => d.id)
    assert.ok(ids.length >= 1)
    assert.equal(ids.includes('syn-marketing-bank'), false, 'a scenario outside the governed scope is not offered')
    const full = await w.campus.catalog.getCatalog()
    for (const id of ids) assert.ok(definitionInScope(full, id), id)
    for (const d of cat.body.data.items) for (const f of d.families) assert.ok(['graduate-business-operations', 'customer-facing-growth'].includes(f.id))

    const window = { cohortIds: [w.cohort.id], windowStart: '2026-10-12T08:00:00.000Z', windowEnd: '2026-10-30T18:00:00.000Z' }
    const refused = await w.call('owner', 'POST', E(w, '/assignments'), { definitionId: 'syn-marketing-bank', ...window })
    assert.equal(refused.status, 422)
    assert.match(refused.body.error.message, /job-family scope/)
    assert.equal((await w.call('owner', 'POST', E(w, '/assignments'), { definitionId: ids[0], ...window, integrityPolicy: 'PROCTORED' })).status, 422, 'no proctoring options on the employer surface')
    const created = await w.call('owner', 'POST', E(w, '/assignments'), { definitionId: ids[0], ...window, participation: 'VOLUNTARY' })
    assert.equal(created.status, 201)
    assert.equal(created.body.data.rostered, 2)
    assert.equal((await w.call('owner', 'GET', E(w, '/assignments'))).body.data.items.length, 1)

    // The employee's briefing shows and records the EMPLOYER disclosure.
    const ews = (await w.call('employee', 'GET', '/me')).body.data.workspaces.find((x) => x.organizationId === w.org.id)
    const h = { 'X-Prism-Workspace': ews.id }
    const brief = await w.call('employee', 'GET', `/assessment-assignments/${created.body.data.id}`, null, h)
    assert.equal(brief.status, 200)
    assert.equal(brief.body.data.sponsorship.disclosureCopyVersion, EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION)
    assert.equal(brief.body.data.sponsorship.sponsorType, 'EMPLOYER')
    assert.deepEqual(brief.body.data.sponsorship.disclosure.prohibitedUses, employerProhibitedUses('Synthetic Employer Ltd'))
    const wrong = await w.call('employee', 'POST', `/assessment-assignments/${created.body.data.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, h)
    assert.equal(wrong.status, 409, 'the campus disclosure is not the employer one')
    const ack = await w.call('employee', 'POST', `/assessment-assignments/${created.body.data.id}/acknowledge`, { copyVersion: EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, h)
    assert.equal(ack.status, 200)
    const consents = await w.repos.sharing.listConsents(USERS.employee.id)
    assert.ok(consents.some((c) => c.consentType === 'EMPLOYER_ASSESSMENT_DISCLOSURE' && c.copyVersion === EMPLOYER_ASSESSMENT_DISCLOSURE_COPY_VERSION && c.organizationId === w.org.id))
    assert.equal(consents.some((c) => c.consentType === 'CAMPUS_ASSESSMENT_DISCLOSURE'), false)

    // Development missions (interventions reuse Development V2).
    const missions = await w.call('owner', 'GET', E(w, '/development-missions'))
    assert.equal(missions.status, 200)
    const mission = missions.body.data.missions[0]
    assert.ok(mission, 'a published mission exists')
    const plan = await w.call('owner', 'POST', E(w, '/interventions'), { name: 'Synthetic onboarding practice', targetCapabilityId: mission.targetCapabilityId, cohortId: w.cohort.id, startsOn: '2026-10-13', endsOn: '2026-11-13', missionIds: [mission.id] })
    assert.equal(plan.status, 201, JSON.stringify(plan.body))
    assert.equal((await w.call('owner', 'GET', E(w, '/interventions'))).body.data.items.length, 1)
    process.env.PRISM_DEVELOPMENT_V2 = 'false'
    assert.equal((await w.call('owner', 'GET', E(w, '/interventions'))).status, 404, 'needs Development V2 too')
  } finally { process.env.PRISM_DEVELOPMENT_V2 = 'true'; w.close() }
})

test('joining an employer: the invitation shows the employer disclosure and records an employer consent', async () => {
  const w = await world()
  try {
    setEmployer(true)
    const preview = await w.call(null, 'GET', `/org-invites/${w.employerInviteToken}`)
    assert.equal(preview.status, 200)
    assert.equal(preview.body.data.organizationType, 'EMPLOYER')
    assert.equal(preview.body.data.disclosureVersion, EMPLOYER_DISCLOSURE_COPY_VERSION)
    assert.deepEqual(preview.body.data.disclosure, JSON.parse(JSON.stringify(employerJoinDisclosure('Synthetic Employer Ltd'))))
    const accepted = await w.call('newhire', 'POST', `/org-invites/${w.employerInviteToken}/accept`, { acknowledged: true })
    assert.equal(accepted.status, 200)
    assert.equal(accepted.body.data.workspaceType, 'CAMPUS_STUDENT')
    const consents = await w.repos.sharing.listConsents(USERS.newhire.id)
    assert.deepEqual(consents.map((c) => [c.consentType, c.copyVersion]), [['EMPLOYER_DEVELOPMENT_DISCLOSURE', EMPLOYER_DISCLOSURE_COPY_VERSION]])
    // A staff invitation opens the employer workspace.
    const staffInvite = await w.call('owner', 'POST', E(w, '/invites'), { role: 'PLACEMENT_OFFICER', emails: ['synthetic-coordinator@test.local'] })
    assert.equal(staffInvite.status, 201)
    const token = w.sent.at(-1).inviteUrl.split('/').pop()
    USERS.coordinator = u('emp-coordinator', 'Synthetic Coordinator')
    USERS.coordinator.email = 'synthetic-coordinator@test.local'
    const staffAccepted = await w.call('coordinator', 'POST', `/org-invites/${token}/accept`, { acknowledged: true })
    assert.equal(staffAccepted.status, 200)
    assert.equal(staffAccepted.body.data.workspaceType, 'EMPLOYER')
  } finally { delete USERS.coordinator; w.close() }
})

test('StudAI Hire evidence hand-off: interface only — 501, a written contract, no network code', async () => {
  const w = await world()
  try {
    setEmployer(true)
    assert.equal((await w.call(null, 'GET', '/integrations/hire/handoff')).status, 401)
    const d = await w.call('employee', 'GET', '/integrations/hire/handoff')
    assert.equal(d.status, 200)
    assert.equal(d.body.data.status, 'NOT_CONFIGURED')
    assert.equal(d.body.data.contract.initiatedBy, 'CANDIDATE_ONLY')
    assert.ok(d.body.data.contract.neverShared.some((x) => /raw transcripts/.test(x)))
    assert.deepEqual(d.body.data.contract.pendingOn, ['HA-025', 'HA-005', 'HA-004'])
    const post = await w.call('employee', 'POST', '/integrations/hire/handoff', { sessionId: 'sess-emp-pers-0001' })
    assert.equal(post.status, 501)
    assert.equal(post.body.error.code, 'NOT_IMPLEMENTED')
    assert.equal(hireEvidenceHandoff.status(), 'NOT_CONFIGURED')
    assert.throws(() => hireEvidenceHandoff.revoke(), (e) => e.status === 501)
    assert.equal(HIRE_HANDOFF_CONTRACT.consent.required, true)
    // No network path exists in the interface module.
    const src = readFileSync(new URL('../domain/integrations/hire/index.js', import.meta.url), 'utf8')
    assert.doesNotMatch(src, /\bfetch\(|from 'node:https?'|from 'axios'|http\.request|process\.env/)
    // The live identity hand-over (Phase 1S) carries identity only, never evidence.
    const eco = readFileSync(new URL('../routes/ecosystem.js', import.meta.url), 'utf8')
    const body = eco.slice(eco.indexOf('body: JSON.stringify({'), eco.indexOf('}),', eco.indexOf('body: JSON.stringify({')))
    assert.deepEqual([...body.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]), ['ecosystem_person_id', 'email', 'name', 'destination', 'target_job_ref', 'source_credential_id'])
  } finally { w.close() }
})

test('employer copy: development use only, aligned to PROHIBITED_USES_POLICY_v1, no selection wording', () => {
  const policy = readFileSync(new URL('../../docs/PROHIBITED_USES_POLICY_v1.md', import.meta.url), 'utf8')
  assert.match(policy, /sole or primary basis/)
  const lines = employerProhibitedUses('Synthetic Employer Ltd')
  assert.match(lines[0], /sole or primary basis for any selection, employment, promotion or termination decision/)
  for (const line of lines) assert.match(line, /\bmay not\b|\bno ranking\b/, line)
  const strings = []
  const collect = (v) => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'prohibitedUses') collect(x) }
  collect(employerJoinDisclosure('Synthetic Employer Ltd'))
  collect(employerAssessmentDisclosure('Synthetic Employer Ltd'))
  collect(EMPLOYER_STAFF_COPY)
  assert.ok(strings.length > 15)
  for (const s of strings) assert.deepEqual(selectionWordingIn(s), [], s)
  for (const s of strings) assert.doesNotMatch(s, /\bcertif|validated|guarantee/i, s)
  assert.equal(employerJoinDisclosure('X').status, 'DRAFT')
  assert.deepEqual([...employerJoinDisclosure('X').pendingOn], ['HA-005', 'HA-004'])
})
