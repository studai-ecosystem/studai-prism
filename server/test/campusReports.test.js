// C6.01–C6.04, C6.08 — Student Report V3 over the real /api/v1 handlers with
// memory repositories and synthetic legacy sources. Proves: every shown
// conclusion cites real evidence of THIS session or says evidence is
// insufficient; no invented quote; no single score/ranking/numeric level in
// any payload; owner-only in the right workspace; sponsor reads authorized
// and audited; share links are hashed, expiring, revocable and selective;
// staff can never create a share of a student's report; versions immutable.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { buildStudentReportV3 } from '../domain/reports/v3/build.js'
import { assertReportSafe, forbiddenPaths } from '../domain/reports/v3/schema.js'
import { PRIMARY_CAPABILITY_IDS, capabilityInfo } from '../domain/assessments/catalog.js'
import { captureMethod, methodHash } from '../domain/assessments/frozenMethod.js'
import { hashToken } from '../domain/memberships/inviteService.js'
import { ApiError } from '../domain/http/errors.js'

// Enabled inside this test process only (K2).
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'

const [CAP_A, CAP_B] = PRIMARY_CAPABILITY_IDS
let now = new Date('2026-10-02T10:00:00Z')
const day = 86400000
const USERS = {
  student: { id: 'student-r', email: 'student-r@test.local', name: 'Synthetic Student' },
  other: { id: 'student-x', email: 'other@test.local', name: 'Other Student' },
  owner: { id: 'owner-r', email: 'owner@test.local', name: 'Synthetic Owner' },
}
const SCENARIOS = {
  generalScenarios: [{ id: 'syn-general-r', title: 'Synthetic Workplace Scenario' }],
  bankScenarios: {},
}
const history = (lines) => [{ role: 'user', content: 'opening instruction' }, ...lines.map((l) => ({ role: 'user', content: `[Candidate]: ${l}` }))]
const LINES = ['First I would check which customers raised the issue.', 'Then I would compare the numbers before deciding.', 'I would agree next steps with the team lead.']

function unit(sessionId, id, capabilityId, turn, { rubric = 2, excerpt = null, status = 'PROVISIONAL' } = {}) {
  const anchors = structuredClone(capabilityInfo(capabilityId).anchors)
  return {
    evidence_id: id, session_id: sessionId, capability_id: capabilityId, evidence_status: status, rubric_level: rubric,
    source_turn: turn, source_artifact_id: null, behavior_anchor_id: `anchor-${turn}`,
    candidate_action_json: { dialogue_excerpt: excerpt },
    provenance_json: {
      judge: 'synthetic', rubric_version: 'rubric.v1',
      resolvedRubric: { ref: 'rubric.v1', anchors, anchorsHash: methodHash(anchors) },
    },
    judge_agreement_json: { agreement: 0.9 }, observable_behavior: `Synthetic observed behaviour ${id}.`, legacy_row: false,
  }
}
function unitsFor(sessionId) {
  return [
    unit(sessionId, `${sessionId}-e1`, CAP_A, 1, { excerpt: 'check which customers raised the issue' }),
    unit(sessionId, `${sessionId}-e2`, CAP_A, 2, { excerpt: 'an invented sentence the candidate never said' }),
    unit(sessionId, `${sessionId}-e3`, CAP_A, 3),
    unit(sessionId, `${sessionId}-e4`, CAP_B, 1),
    // A unit claiming to be from another session must never support a claim.
    unit('sess-foreign-0001', 'foreign-e9', CAP_B, 2),
  ]
}

async function world() {
  now = new Date('2026-10-02T10:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u-r', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const otherOrg = await repos.organizations.createOrganization({ name: 'Other University', slug: 'other-u-r', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.student.id, role: 'STUDENT', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.owner.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  const state = {
    sessions: {
      'sess-personal-r1': { userId: USERS.student.id, scenarioId: 'syn-general-r', history: history(LINES), startedAt: now.getTime() - day },
      'sess-sponsor-r1': { userId: USERS.student.id, scenarioId: 'syn-general-r', history: history(LINES), startedAt: now.getTime() - day },
      'sess-pending-r1': { userId: USERS.student.id, scenarioId: 'syn-general-r', history: history(LINES), startedAt: now.getTime() - day },
    },
    reports: {
      'sess-personal-r1': { userId: USERS.student.id, issuedAt: now.toISOString(), candidateName: 'Synthetic Student' },
      'sess-sponsor-r1': { userId: USERS.student.id, issuedAt: now.toISOString(), candidateName: 'Synthetic Student' },
    },
    admin: {},
  }
  await repos.scopes.createSessionScope({
    sessionId: 'sess-sponsor-r1', ownerUserId: USERS.student.id, sponsorType: 'INSTITUTION', sponsorOrganizationId: org.id,
    workspaceId: 'ws', programId: null, cohortId: null, visibilityPolicy: 'OWNER_AND_SPONSOR', createdBy: USERS.student.id,
  })
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listSessionIds: async (uid) => Object.entries(state.sessions).filter(([, s]) => s.userId === uid).map(([id]) => id),
    getSession: async (sid) => (state.sessions[sid] ? structuredClone({ sessionId: sid, ...state.sessions[sid] }) : null),
    getReport: async (sid) => (state.reports[sid] ? { sessionId: sid, ...state.reports[sid] } : null),
    adminState: async (sid) => state.admin[sid] || null,
  }
  const audits = []
  let tokens = 0
  const campus = createCampusContext({
    repos, clock: () => now, legacy, scenarioSource: async () => SCENARIOS,
    evidence: { units: async (sid) => unitsFor(sid) },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
    shareTokenFactory: () => `synthetic-share-token-${String(++tokens).padStart(4, '0')}-abcdefghij`,
    sessionOwner: async (sid) => state.sessions[sid]?.userId || null,
  })
  // These unit worlds declare their synthetic allocation explicitly; they
  // do not recover missing instructions from a historical assessment.
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
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }
  }
  const campusWs = (await campus.workspaceService.listWorkspaces(USERS.student)).find((w) => w.type === 'CAMPUS_STUDENT')
  return { repos, org, otherOrg, state, audits, campus, call, campusWs, close: () => server.close() }
}

function sessionUnitIds(report) {
  return new Set(unitsFor(report.sessionId).filter((u) => u.session_id === report.sessionId).map((u) => u.evidence_id))
}

test('C6.01/C6.08: every shown conclusion cites evidence of this session or states insufficiency; nothing invented', () => {
  const report = buildStudentReportV3({
    sessionId: 'sess-personal-r1',
    definition: { id: 'prism-workplace-core', title: 'Prism Workplace Simulation', measures: [CAP_A, CAP_B] },
    units: unitsFor('sess-personal-r1'),
    turns: LINES,
    header: { candidateName: 'Synthetic Student', scenarioTitle: 'Synthetic Workplace Scenario', completedAt: now.toISOString(), scope: 'PERSONAL' },
  })
  assertReportSafe(report)
  const ids = sessionUnitIds(report)
  for (const c of report.claims) {
    if (c.status === 'INSUFFICIENT') assert.deepEqual(c.evidence_ids, [])
    else {
      assert.ok(c.evidence_ids.length > 0, `${c.claim_id} cites evidence`)
      for (const id of c.evidence_ids) assert.ok(ids.has(id), `${id} belongs to this session`)
    }
  }
  for (const card of report.summary.capabilities) {
    if (card.level) assert.ok(card.summary.evidenceIds.every((id) => ids.has(id)))
    else assert.equal(card.summary.status, 'INSUFFICIENT')
  }
  const a = report.summary.capabilities.find((c) => c.id === CAP_A)
  const b = report.summary.capabilities.find((c) => c.id === CAP_B)
  assert.equal(a.status, 'PROVISIONAL')
  assert.equal(a.level.band, 'EARLY')
  assert.equal(b.level, null, 'one unit (plus a foreign one) is not enough')
  assert.equal(b.status, 'INSUFFICIENT_EVIDENCE')
  const raw = JSON.stringify(report)
  assert.equal(raw.includes('invented sentence'), false, 'an excerpt that is not verbatim never appears')
  assert.equal(raw.includes('foreign-e9'), false, 'another session\'s evidence never appears')
  assert.ok(report.evidence.some((e) => e.candidateAction.quote === 'check which customers raised the issue'))
  assert.ok(report.development.priorities.length <= 3)
  assert.equal(report.development.priorities[0].capabilityId, CAP_A)
  assert.equal(report.development.priorities[0].recommendedMission, null, 'no mission is invented before Development V2')
  assert.deepEqual(forbiddenPaths(report), [])
  assert.equal(/composite|overall|percentile|rubricMedian/i.test(raw), false)
})

test('C6.01: summary disclosure drops evidence, development, quotes and credential ids', () => {
  const report = buildStudentReportV3({
    sessionId: 'sess-personal-r1', definition: { id: 'prism-workplace-core', title: 'X', measures: [CAP_A, CAP_B] },
    units: unitsFor('sess-personal-r1'), turns: LINES, header: { verification: { credentialId: 'cred-1' } }, disclosure: 'SUMMARY',
  })
  assertReportSafe(report)
  assert.deepEqual(report.evidence, [])
  assert.equal(report.development, null)
  assert.ok(report.claims.every((c) => c.quote === null))
  assert.equal(report.header.verification.credentialId, null)
})

test('C6.02: the owner reads the report in the session\'s workspace; versions are immutable and not duplicated', async () => {
  const w = await world()
  try {
    const r = await w.call('student', 'GET', '/assessment-sessions/sess-personal-r1/report')
    assert.equal(r.status, 200)
    assert.equal(r.body.data.audience, 'OWNER')
    assert.equal(r.body.data.version.number, 1)
    assert.equal(r.body.data.privacy.visibility, 'OWNER_ONLY')
    assert.equal(r.body.data.report.header.candidateName, 'Synthetic Student')
    const again = await w.call('student', 'GET', '/assessment-sessions/sess-personal-r1/report')
    assert.equal(again.body.data.version.number, 1, 'the same content is not stored twice')
    assert.equal(w.repos.db.reportVersions.filter((v) => v.sessionId === 'sess-personal-r1').length, 1)
    assert.ok(w.audits.some((a) => a.type === 'report.v3.viewed' && a.sid === 'sess-personal-r1' && a.payload.audience === 'OWNER'))
    assert.equal((await w.call('other', 'GET', '/assessment-sessions/sess-personal-r1/report')).status, 404)
    assert.equal((await w.call('student', 'GET', '/assessment-sessions/sess-personal-r1/report', null, { 'X-Prism-Workspace': w.campusWs.id })).status, 404, 'personal report not in the campus workspace')
    assert.equal((await w.call('student', 'GET', '/assessment-sessions/sess-sponsor-r1/report')).status, 404, 'sponsored report not in personal')
    const sponsored = await w.call('student', 'GET', '/assessment-sessions/sess-sponsor-r1/report', null, { 'X-Prism-Workspace': w.campusWs.id })
    assert.equal(sponsored.status, 200)
    assert.equal(sponsored.body.data.report.header.sponsor.name, 'Synthetic University')
    assert.equal(sponsored.body.data.privacy.visibility, 'OWNER_AND_SPONSOR')
    const pending = await w.call('student', 'GET', '/assessment-sessions/sess-pending-r1/report')
    assert.equal(pending.status, 409)
    assert.equal(pending.body.error.code, 'REPORT_NOT_READY')
    w.state.admin['sess-personal-r1'] = { reviewState: 'held' }
    const held = await w.call('student', 'GET', '/assessment-sessions/sess-personal-r1/report')
    assert.equal(held.body.error.code, 'REPORT_UNDER_REVIEW', 'held sessions are not formal evidence (K59)')
    process.env.PRISM_STUDENT_REPORT_V3 = 'false'
    assert.equal((await w.call('student', 'GET', '/assessment-sessions/sess-sponsor-r1/report', null, { 'X-Prism-Workspace': w.campusWs.id })).status, 404)
  } finally {
    process.env.PRISM_STUDENT_REPORT_V3 = 'true'
    w.close()
  }
})

test('C6.02/C6.04: sponsors read sponsored reports (audited); personal reports only through a student share that ends when the student leaves', async () => {
  const w = await world()
  try {
    const path = (sid) => `/organizations/${w.org.id}/sessions/${sid}/report`
    const r = await w.call('owner', 'GET', path('sess-sponsor-r1'))
    assert.equal(r.status, 200)
    assert.equal(r.body.data.audience, 'SPONSOR')
    assert.equal(r.body.data.privacy.canShare, false)
    const rows = await w.repos.audit.listDataAccess({ organizationId: w.org.id })
    assert.ok(rows.some((x) => x.resourceType === 'ASSESSMENT_REPORT' && x.resourceId === 'sess-sponsor-r1' && x.actorUserId === USERS.owner.id && x.purpose === 'SPONSORSHIP'))
    assert.equal((await w.call('owner', 'GET', path('sess-personal-r1'))).status, 404, 'a personal report is never sponsor-readable by default')
    assert.equal((await w.call('student', 'GET', path('sess-sponsor-r1'))).status, 404, 'students are not organization readers')

    // The student shares the personal report with their institution.
    const share = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'ORGANIZATION', recipientOrganizationId: w.org.id, sessionId: 'sess-personal-r1', disclosureLevel: 'FULL', expiresInDays: 30 })
    assert.equal(share.status, 201)
    assert.equal(share.body.data.token, null, 'organization shares have no link')
    const shared = await w.call('owner', 'GET', path('sess-personal-r1'))
    assert.equal(shared.status, 200)
    assert.equal(shared.body.data.privacy.visibility, 'SHARED_BY_STUDENT')
    // Leaving the institution ends what it can see.
    await w.repos.memberships.upsertMembership({ organizationId: w.org.id, userId: USERS.student.id, role: 'STUDENT', status: 'REMOVED' })
    assert.equal((await w.call('owner', 'GET', path('sess-personal-r1'))).status, 404)
    await w.repos.memberships.upsertMembership({ organizationId: w.org.id, userId: USERS.student.id, role: 'STUDENT', status: 'ACTIVE' })
    assert.equal((await w.call('owner', 'GET', path('sess-personal-r1'))).status, 200)
    assert.equal((await w.call('student', 'DELETE', `/me/share-grants/${share.body.data.id}`)).status, 200)
    assert.equal((await w.call('owner', 'GET', path('sess-personal-r1'))).status, 404, 'a revoked share ends access')
    // Only institutions the student belongs to.
    const foreign = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'ORGANIZATION', recipientOrganizationId: w.otherOrg.id, sessionId: 'sess-personal-r1', disclosureLevel: 'SUMMARY', expiresInDays: 7 })
    assert.equal(foreign.status, 422)
  } finally { w.close() }
})

test('C6.03/C6.04: link shares are hashed, selective, expiring and revocable; staff can never share a student report', async () => {
  const w = await world()
  try {
    assert.equal((await w.call('student', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: 'sess-personal-r1', disclosureLevel: 'FULL', expiresInDays: 181 })).status, 422)
    assert.equal((await w.call('other', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: 'sess-personal-r1', disclosureLevel: 'FULL', expiresInDays: 7 })).status, 404)
    assert.equal((await w.call('owner', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: 'sess-sponsor-r1', disclosureLevel: 'FULL', expiresInDays: 7 })).status, 404, 'staff cannot create a public share of a sponsored report')
    assert.equal((await w.call('student', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: 'sess-pending-r1', disclosureLevel: 'FULL', expiresInDays: 7 })).body.error.code, 'REPORT_NOT_READY')

    const summary = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: 'sess-personal-r1', disclosureLevel: 'SUMMARY', expiresInDays: 7 })
    assert.equal(summary.status, 201)
    const token = summary.body.data.token
    assert.match(token, /^synthetic-share-token-/)
    const stored = [...w.repos.db.shareGrants.values()].find((g) => g.id === summary.body.data.id)
    assert.equal(stored.tokenHash, hashToken(token), 'only the hash is stored')
    const listed = await w.call('student', 'GET', '/me/share-grants')
    assert.equal(JSON.stringify(listed.body).includes(token), false, 'the token is shown once')

    const view = await w.call(null, 'GET', `/shared/${token}`)
    assert.equal(view.status, 200)
    assert.equal(view.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(view.body.data.audience, 'SHARE_LINK')
    assert.equal(view.body.data.report.disclosure, 'SUMMARY')
    assert.deepEqual(view.body.data.report.evidence, [])
    assert.equal(view.body.data.report.development, null)
    assert.equal(JSON.stringify(view.body).includes('check which customers'), false, 'no quotes in a summary share')
    const rows = await w.repos.audit.listDataAccess({})
    assert.ok(rows.some((x) => x.purpose === 'SHARE_LINK' && x.actorUserId === `share-link:${summary.body.data.id}` && x.subjectUserId === USERS.student.id))

    const full = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: 'sess-sponsor-r1', disclosureLevel: 'FULL', expiresInDays: 1 }, { 'X-Prism-Workspace': w.campusWs.id })
    assert.equal(full.status, 201, 'the student may choose to share a sponsored report')
    const fullView = await w.call(null, 'GET', `/shared/${full.body.data.token}`)
    assert.equal(fullView.body.data.report.disclosure, 'FULL')
    assert.ok(fullView.body.data.report.evidence.length > 0)
    now = new Date(now.getTime() + 2 * day)
    assert.equal((await w.call(null, 'GET', `/shared/${full.body.data.token}`)).status, 404, 'expired')

    assert.equal((await w.call('student', 'DELETE', `/me/share-grants/${summary.body.data.id}`)).status, 200)
    assert.equal((await w.call(null, 'GET', `/shared/${token}`)).status, 404, 'revoked')
    assert.equal((await w.call(null, 'GET', '/shared/not-a-real-token-at-all-000000')).status, 404)
    assert.ok(w.audits.some((a) => a.type === 'share_grant.created' && a.payload.recipientType === 'LINK'))
    assert.ok(w.audits.some((a) => a.type === 'share_grant.revoked'))
  } finally { w.close() }
})

test('C6.04: an institution share honours the disclosure the student chose; the sponsor shown is always the session\'s sponsor', async () => {
  const w = await world()
  try {
    // The student also belongs to a second institution.
    await w.repos.memberships.upsertMembership({ organizationId: w.otherOrg.id, userId: USERS.student.id, role: 'STUDENT', status: 'ACTIVE' })
    await w.repos.memberships.upsertMembership({ organizationId: w.otherOrg.id, userId: USERS.other.id, role: 'ORG_OWNER', status: 'ACTIVE' })
    const summary = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'ORGANIZATION', recipientOrganizationId: w.otherOrg.id, sessionId: 'sess-personal-r1', disclosureLevel: 'SUMMARY', expiresInDays: 30 })
    assert.equal(summary.status, 201)
    const view = await w.call('other', 'GET', `/organizations/${w.otherOrg.id}/sessions/sess-personal-r1/report`)
    assert.equal(view.status, 200)
    const r = view.body.data.report
    assert.equal(r.disclosure, 'SUMMARY')
    assert.deepEqual(r.evidence, [])
    assert.equal(r.development, null)
    assert.equal(r.header.verification.credentialId, null)
    assert.equal(JSON.stringify(view.body).includes('check which customers'), false, 'no quotes through a summary share')

    // An A-sponsored report shared (FULL) with B still names A as its sponsor.
    const full = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'ORGANIZATION', recipientOrganizationId: w.otherOrg.id, sessionId: 'sess-sponsor-r1', disclosureLevel: 'FULL', expiresInDays: 30 }, { 'X-Prism-Workspace': w.campusWs.id })
    assert.equal(full.status, 201)
    const b = await w.call('other', 'GET', `/organizations/${w.otherOrg.id}/sessions/sess-sponsor-r1/report`)
    assert.equal(b.status, 200)
    assert.equal(b.body.data.report.header.sponsor.name, 'Synthetic University')
    assert.equal(b.body.data.report.disclosure, 'FULL')
    const a = await w.call('owner', 'GET', `/organizations/${w.org.id}/sessions/sess-sponsor-r1/report`)
    assert.equal(a.body.data.version.number, b.body.data.version.number, 'readers never fork report versions')
  } finally { w.close() }
})

test('C6.01: the level description matches the decided level, not whichever unit sorts first', () => {
  const sid = 'sess-mixed-0001'
  const units = [
    unit(sid, `${sid}-a`, CAP_A, 1, { rubric: 4 }),
    unit(sid, `${sid}-b`, CAP_A, 2, { rubric: 1 }),
    unit(sid, `${sid}-c`, CAP_A, 3, { rubric: 2 }),
  ]
  const report = buildStudentReportV3({ sessionId: sid, definition: { id: 'd', title: 'T', measures: [CAP_A] }, units, turns: LINES })
  const card = report.summary.capabilities[0]
  assert.equal(card.level.band, 'EARLY')
  // Median rubric level 2 → exactly the level-2 anchor, never the level-4 one.
  const anchors = capabilityInfo(CAP_A).anchors
  assert.equal(card.levelDescriptor, anchors[2].criteria)
  assert.notEqual(card.levelDescriptor, anchors[4].criteria)
  // An even count: rubric 2 and 3 → median 2.5 → DEVELOPING and the level-3 anchor.
  const even = buildStudentReportV3({
    sessionId: sid,
    definition: { id: 'd', title: 'T', measures: [CAP_A] },
    units: [unit(sid, `${sid}-p`, CAP_A, 1, { rubric: 2 }), unit(sid, `${sid}-q`, CAP_A, 2, { rubric: 3 }), unit(sid, `${sid}-r`, CAP_A, 3, { rubric: 2 }), unit(sid, `${sid}-s`, CAP_A, 4, { rubric: 3 })],
    turns: LINES,
  }).summary.capabilities[0]
  assert.equal(even.level.band, 'DEVELOPING')
  assert.equal(even.levelDescriptor, anchors[3].criteria)
  const withoutSource = units.map((u) => {
    const copy = structuredClone(u)
    delete copy.provenance_json.resolvedRubric
    return copy
  })
  const unrecorded = buildStudentReportV3({ sessionId: sid, definition: { id: 'd', title: 'T', measures: [CAP_A] }, units: withoutSource, turns: LINES })
  assert.equal(unrecorded.summary.capabilities[0].levelDescriptor, null, 'current catalogue anchors never replace an unrecorded source rubric')
})

test('C6.03: a held report cannot be shared, and an existing link reveals nothing about the hold', async () => {
  const w = await world()
  try {
    const link = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: 'sess-personal-r1', disclosureLevel: 'FULL', expiresInDays: 7 })
    w.state.admin['sess-personal-r1'] = { reviewState: 'held' }
    const blocked = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: 'sess-personal-r1', disclosureLevel: 'FULL', expiresInDays: 7 })
    assert.equal(blocked.body.error.code, 'REPORT_UNDER_REVIEW')
    const view = await w.call(null, 'GET', `/shared/${link.body.data.token}`)
    assert.equal(view.status, 404)
    assert.equal(view.body.error.code, 'NOT_FOUND')
  } finally { w.close() }
})

test('C6.07: completed assignment cards and the finished player link to Report V3 when its flags are on', async () => {
  const { reportPath } = await import('../domain/assessments/assignmentService.js')
  const legacyPaths = EMPTY_LEGACY_SOURCES.paths
  assert.equal(reportPath(legacyPaths, 'sess-1', false), '/app/reports/sess-1')
  assert.equal(reportPath(legacyPaths, 'sess-1', true, 'org-1'), '/app/campus/org-1/reports/sess-1')
  process.env.PRISM_STUDENT_REPORT_V3 = 'false'
  try {
    assert.equal(reportPath(legacyPaths, 'sess-1', true), '/report/sess-1/v2')
  } finally { process.env.PRISM_STUDENT_REPORT_V3 = 'true' }
})
