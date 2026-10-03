// P5.8 / T47 / T48 — one report boundary for every audience. Owner, sponsor
// and share projections are checked at every read: a SUMMARY disclosure
// never leaks quotes, moments or recommendations through the main read or
// any nested endpoint; staff cannot act as the learner; exports carry stored
// snapshot dates, never the clock; the legacy reader paths are untouched.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { PRIMARY_CAPABILITY_IDS } from '../domain/assessments/catalog.js'
import { ApiError } from '../domain/http/errors.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'

const [CAP_A, CAP_B] = PRIMARY_CAPABILITY_IDS
const SID = 'sess-audience-0001'
const ISSUED = '2026-09-20T09:30:00.000Z'
let now = new Date('2026-10-03T10:00:00Z')
const QUOTES = ['check which customers raised the issue', 'compare the numbers before deciding', 'Two tasks still have no owner']
const LINES = ['First I would check which customers raised the issue.', 'Then I would compare the numbers before deciding.', 'I would agree next steps with the team lead.', 'Two tasks still have no owner, so I will assign them now.']
const history = (lines) => [{ role: 'user', content: 'opening instruction' }, ...lines.map((l) => ({ role: 'user', content: `[Candidate]: ${l}` }))]
const unit = (id, capabilityId, turn, excerpt, behaviour) => ({
  evidence_id: id, session_id: SID, capability_id: capabilityId, evidence_status: 'PROVISIONAL', rubric_level: 2,
  source_turn: turn, source_artifact_id: null, behavior_anchor_id: `anchor-${turn}`,
  candidate_action_json: { dialogue_excerpt: excerpt }, provenance_json: { judge: 'synthetic', rubric_version: 'rubric.v1', behaviourId: 'QUESTION_ASSUMPTION' },
  judge_agreement_json: { agreement: 0.9 }, observable_behavior: behaviour, legacy_row: false,
})
const UNITS = [
  unit('au-a1', CAP_A, 1, QUOTES[0], 'Checked where the complaints came from before acting.'),
  unit('au-a2', CAP_A, 2, QUOTES[1], 'Compared the figures before choosing an option.'),
  unit('au-a3', CAP_A, 3, null, 'Agreed next steps with the lead.'),
  unit('au-b1', CAP_B, 4, QUOTES[2], 'Named the two tasks without an owner.'),
]
const USERS = {
  student: { id: 'student-au', email: 'student-au@test.local', name: 'Synthetic Student' },
  staff: { id: 'staff-au', email: 'staff-au@test.local', name: 'Synthetic Staff' },
}

async function world() {
  now = new Date('2026-10-03T10:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u-au', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.student.id, role: 'STUDENT', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.staff.id, role: 'ORG_OWNER', status: 'ACTIVE' })
  const state = {
    sessions: { [SID]: { userId: USERS.student.id, scenarioId: 'syn-general-au', history: history(LINES), startedAt: Date.parse(ISSUED) - 3600000 } },
    reports: { [SID]: { userId: USERS.student.id, issuedAt: ISSUED, candidateName: 'Synthetic Student' } },
  }
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listSessionIds: async (uid) => Object.entries(state.sessions).filter(([, s]) => s.userId === uid).map(([id]) => id),
    getSession: async (sid) => (state.sessions[sid] ? structuredClone({ sessionId: sid, ...state.sessions[sid] }) : null),
    getReport: async (sid) => (state.reports[sid] ? { sessionId: sid, ...state.reports[sid] } : null),
    adminState: async () => null,
  }
  let tokens = 0
  const campus = createCampusContext({
    repos, clock: () => now, legacy, scenarioSource: async () => ({ generalScenarios: [{ id: 'syn-general-au', title: 'Synthetic Scenario' }], bankScenarios: {} }),
    evidence: { units: async (sid) => (sid === SID ? UNITS : []) },
    shareTokenFactory: () => `synthetic-audience-token-${String(++tokens).padStart(4, '0')}-abcdefghij`,
    sessionOwner: async (sid) => state.sessions[sid]?.userId || null,
  })
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
    const r = await fetch(`${base}${path}`, { method, headers: { ...(who ? { 'x-test-user': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  return { repos, org, call, close: () => server.close() }
}

const leaks = (body) => QUOTES.filter((q) => JSON.stringify(body).includes(q))

test('T47: a sponsor holding a SUMMARY share gets no quotes, moments, recommendations or review state through the report or any nested endpoint', async () => {
  const w = await world()
  try {
    const owner = await w.call('student', 'GET', `/assessment-sessions/${SID}/report`)
    assert.equal(owner.status, 200)
    assert.ok(owner.body.data.report.moments.length >= 1, 'the owner sees moments')
    assert.ok('recommendations' in owner.body.data && 'review' in owner.body.data)

    const share = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'ORGANIZATION', recipientOrganizationId: w.org.id, sessionId: SID, disclosureLevel: 'SUMMARY', expiresInDays: 30 })
    assert.equal(share.status, 201)
    const sponsor = await w.call('staff', 'GET', `/organizations/${w.org.id}/sessions/${SID}/report`)
    assert.equal(sponsor.status, 200)
    assert.equal(sponsor.body.data.report.disclosure, 'SUMMARY')
    assert.deepEqual(sponsor.body.data.report.moments, [])
    assert.deepEqual(sponsor.body.data.report.boundedObservations, [])
    assert.deepEqual(sponsor.body.data.report.evidence, [])
    assert.equal(sponsor.body.data.report.development, null)
    assert.deepEqual(leaks(sponsor.body), [], 'no learner quote through a summary share')
    assert.equal('recommendations' in sponsor.body.data, false, 'recommendations are the owner\'s')
    assert.equal('review' in sponsor.body.data, false, 'review state is the owner\'s')
    assert.equal(sponsor.body.data.version.number, owner.body.data.version.number, 'the same stored version, projected')

    // Nested owner endpoints are owner-only: staff is not the owner in any workspace.
    assert.equal((await w.call('staff', 'GET', `/assessment-sessions/${SID}/report/versions`)).status, 404)
    assert.equal((await w.call('staff', 'GET', `/assessment-sessions/${SID}/report`)).status, 404)
    assert.equal((await w.call('staff', 'POST', `/assessment-sessions/${SID}/report/review-request`, { reason: 'Staff trying to open a review on a learner\'s report.' })).status, 404)
    // No organization-scoped versions or evidence endpoint exists to widen the read.
    assert.equal((await w.call('staff', 'GET', `/organizations/${w.org.id}/sessions/${SID}/report/versions`)).status, 404)
    assert.equal((await w.call('staff', 'GET', `/organizations/${w.org.id}/sessions/${SID}/evidence`)).status, 404)
    // The evidence drawer and capability detail are the caller's own data only.
    const staffEvidence = await w.call('staff', 'GET', `/me/evidence?assessment=${SID}`)
    assert.equal(staffEvidence.status, 200)
    assert.deepEqual(staffEvidence.body.data.items, [])
    assert.deepEqual(leaks(staffEvidence.body), [])
    const staffCap = await w.call('staff', 'GET', `/me/capabilities/${CAP_A}`)
    assert.equal(staffCap.body.data.state, 'NOT_MEASURED')
    assert.deepEqual(staffCap.body.data.moments, [])
    assert.deepEqual(leaks(staffCap.body), [])
  } finally { w.close() }
})

test('T47/T48: a SUMMARY link never reaches excerpts through nested paths; FULL shows them; expiry and revocation stop hosted access; staff cannot create a learner share', async () => {
  const w = await world()
  try {
    const summary = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: SID, disclosureLevel: 'SUMMARY', expiresInDays: 7 })
    assert.equal(summary.status, 201)
    const token = summary.body.data.token
    const view = await w.call(null, 'GET', `/shared/${token}`)
    assert.equal(view.status, 200)
    assert.equal(view.body.data.report.disclosure, 'SUMMARY')
    assert.deepEqual(view.body.data.report.moments, [])
    assert.deepEqual(leaks(view.body), [])
    assert.equal('recommendations' in view.body.data, false)
    assert.equal('review' in view.body.data, false)
    assert.equal(view.body.data.share.disclosureLevel, 'SUMMARY')
    for (const nested of ['versions', 'evidence', 'moments', 'review-request', 'pdf']) {
      const r = await w.call(null, 'GET', `/shared/${token}/${nested}`)
      assert.equal(r.status, 404, `/shared/:token/${nested} is not a path`)
      assert.deepEqual(leaks(r.body), [])
    }
    // A link holder cannot use the token as a session id on owner routes.
    assert.equal((await w.call(null, 'GET', `/assessment-sessions/${SID}/report`)).status, 401)
    assert.equal((await w.call(null, 'GET', `/assessment-sessions/${SID}/report/versions`)).status, 401)

    const full = await w.call('student', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: SID, disclosureLevel: 'FULL', expiresInDays: 1 })
    const fullView = await w.call(null, 'GET', `/shared/${full.body.data.token}`)
    assert.equal(fullView.body.data.report.disclosure, 'FULL')
    assert.ok(fullView.body.data.report.moments.length >= 1, 'a FULL share carries moments')
    assert.ok(leaks(fullView.body).length >= 1, 'the owner chose to share quotes')
    assert.equal(fullView.body.data.version.number, view.body.data.version.number, 'the same stored version in both projections')

    // Staff cannot mint a learner's share, in any workspace.
    assert.equal((await w.call('staff', 'POST', '/me/share-grants', { recipientType: 'LINK', sessionId: SID, disclosureLevel: 'FULL', expiresInDays: 7 })).status, 404)
    const staffShare = await w.call('staff', 'POST', '/me/share-grants', { recipientType: 'ORGANIZATION', recipientOrganizationId: w.org.id, sessionId: SID, disclosureLevel: 'FULL', expiresInDays: 7 }, { 'X-Prism-Workspace': `org:${w.org.id}` })
    assert.ok([404, 422].includes(staffShare.status), `staff cannot share from a campus workspace header either (${staffShare.status})`)
    assert.equal(w.repos.db.shareGrants.size, 2, 'only the learner\'s two grants exist')

    now = new Date(now.getTime() + 2 * 86400000)
    assert.equal((await w.call(null, 'GET', `/shared/${full.body.data.token}`)).status, 404, 'expired FULL link')
    assert.equal((await w.call(null, 'GET', `/shared/${token}`)).status, 200, 'the 7-day link still works')
    assert.equal((await w.call('student', 'DELETE', `/me/share-grants/${summary.body.data.id}`)).status, 200)
    assert.equal((await w.call(null, 'GET', `/shared/${token}`)).status, 404, 'revoked')
  } finally { w.close() }
})

test('CH-28: the served snapshot carries the stored completion date and version date, not the reading clock; legacy reader paths are unchanged', async () => {
  const w = await world()
  try {
    const first = await w.call('student', 'GET', `/assessment-sessions/${SID}/report`)
    assert.equal(first.body.data.report.header.completedAt, ISSUED, 'the stored issue date')
    const created = first.body.data.version.createdAt
    assert.equal(created, now.toISOString(), 'publication time is when the version was published')
    now = new Date(now.getTime() + 40 * 86400000)
    const later = await w.call('student', 'GET', `/assessment-sessions/${SID}/report`)
    assert.equal(later.body.data.version.number, 1)
    assert.equal(later.body.data.version.createdAt, created, 'a later read does not re-date the version')
    assert.equal(later.body.data.report.header.completedAt, ISSUED, 'a later read does not re-date the assessment')
    const versions = await w.call('student', 'GET', `/assessment-sessions/${SID}/report/versions`)
    assert.equal(versions.body.data.versions[0].createdAt, created)
    assert.equal(JSON.stringify(later.body).includes(now.toISOString()), false, 'the reading clock appears nowhere in the payload')
    // Legacy readers: the v2 bank report and the /score page keep their routes.
    assert.equal(EMPTY_LEGACY_SOURCES.paths.report('abc', true), '/report/abc/v2')
    assert.equal(EMPTY_LEGACY_SOURCES.paths.report('abc', false), '/score?session=abc')
    assert.equal((await w.call('student', 'GET', `/assessment-sessions/${SID}/report/v2`)).status, 404, 'no v2 projection on the V3 boundary')
  } finally { w.close() }
})
