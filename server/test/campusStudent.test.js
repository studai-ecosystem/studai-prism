// C4.01–C4.03, C4.06, C4.10, C4.11, C4.13 — the student application API over
// the real /api/v1 handlers with memory repositories and synthetic legacy
// sources. Proves: catalog derives only from the injected frozen bank;
// personal assignments are idempotent and never touch legacy records; every
// read is workspace-scoped; capability/evidence read models fail closed;
// sponsored briefings require an acknowledgement stored as a consent record;
// preferences, share grants and telemetry behave; dark flags → 404.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { buildCatalog, definitionForScenario, CORE_DEFINITION_ID } from '../domain/assessments/catalog.js'
import { personalAssignmentId } from '../domain/assessments/assignmentService.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../domain/sharing/copyVersions.js'
import { sanitizeProps } from '../domain/telemetry/events.js'
import { ApiError } from '../domain/http/errors.js'

// Enabled inside this test process only (K2).
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_ROLE_EXPLORATION_V2 = 'true'

const NOW = new Date('2026-10-01T10:00:00Z')
const day = 86400000
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()

const USERS = {
  student: { id: 'student-s', email: 'student@test.local', name: 'Synthetic Student' },
  other: { id: 'student-o', email: 'other@test.local', name: 'Other Student' },
  admin: { id: 'owner-a', email: 'owner@test.local', name: 'Owner A' },
}

// Synthetic frozen bank: two general scenarios (one retired) and one governed bank entry.
const SCENARIOS = {
  generalScenarios: [{ id: 'syn-general-a' }, { id: 'syn-general-b', retired: true }],
  bankScenarios: {
    'syn-bank-l1': {
      title: 'Synthetic Bank Simulation', version: '1.0.0', blueprintId: 'SYN-JF-L1',
      briefing: { objective: 'Synthetic objective.' },
      interactiveArtifacts: [{ artifactId: 'SYN-ART' }],
      probingTree: { turns: [{ targetCapability: 'CAP-MKT-EXPERIMENTATION' }, { targetCapability: 'CAP-L1-COMMUNICATION' }] },
    },
  },
}

const QUOTE = 'I would first separate the complaint data from the channel numbers'
function unit(id, cap, turn, level, status = 'PROVISIONAL', excerpt = null) {
  return {
    evidence_id: id, session_id: 'x', capability_id: cap, evidence_status: status, rubric_level: level,
    source_turn: turn, source_artifact_id: null, behavior_anchor_id: `${cap}-A${turn}`,
    candidate_action_json: { dialogue_excerpt: excerpt }, provenance_json: { judge: 'synthetic' },
    judge_agreement_json: { agreement: 0.9 }, observable_behavior: `Synthetic behaviour ${id}`, legacy_row: false,
  }
}

async function world({ storeUp = true } = {}) {
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.student.id, role: 'STUDENT', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.admin.id, role: 'ORG_OWNER', status: 'ACTIVE' })

  // Legacy store (synthetic): a paid entitlement not yet started, a completed
  // personal core session with evidence, an in-progress bank session, and a
  // completed sponsored session.
  const legacyState = {
    payments: [
      { sessionId: 'sess-unstarted', mode: 'paid', userId: USERS.student.id, consumed: false, createdAt: iso(-3 * day) },
      { sessionId: 'sess-done', mode: 'paid', userId: USERS.student.id, consumed: true, createdAt: iso(-10 * day) },
      { sessionId: 'sess-other', mode: 'paid', userId: USERS.other.id, consumed: false, createdAt: iso(-1 * day) },
    ],
    sessions: {
      'sess-done': { sessionId: 'sess-done', userId: USERS.student.id, scenarioId: 'syn-general-a', startedAt: NOW.getTime() - 9 * day, history: [{ role: 'user', content: 'opening prompt text' }, { role: 'user', content: `[Candidate]: ${QUOTE} before deciding.` }] },
      'sess-live': { sessionId: 'sess-live', userId: USERS.student.id, scenarioId: 'syn-bank-l1', startedAt: NOW.getTime() - day, history: [] },
      'sess-sponsored': { sessionId: 'sess-sponsored', userId: USERS.student.id, scenarioId: 'syn-general-a', startedAt: NOW.getTime() - 2 * day, history: [] },
    },
    reports: {
      'sess-done': { sessionId: 'sess-done', userId: USERS.student.id, issuedAt: iso(-9 * day) },
      'sess-sponsored': { sessionId: 'sess-sponsored', userId: USERS.student.id, issuedAt: iso(-2 * day) },
    },
    units: {
      'sess-done': [
        unit('u1', 'CAP-L1-REASONING', 1, 2, 'PROVISIONAL', QUOTE),
        unit('u2', 'CAP-L1-REASONING', 2, 3),
        unit('u3', 'CAP-L1-REASONING', 3, 3),
        unit('u4', 'CAP-L1-COMMUNICATION', 1, 4, 'PROVISIONAL', 'words the candidate never said'),
      ],
      'sess-live': [unit('live1', 'CAP-L1-REASONING', 1, 5), unit('live2', 'CAP-L1-REASONING', 2, 5), unit('live3', 'CAP-L1-REASONING', 3, 5)],
    },
    admin: {},
  }
  const snapshot = JSON.stringify(legacyState)
  await repos.scopes.createSessionScope({ sessionId: 'sess-sponsored', ownerUserId: USERS.student.id, sponsorType: 'INSTITUTION', sponsorOrganizationId: org.id, workspaceId: 'ws', visibilityPolicy: 'OWNER_AND_SPONSOR', createdBy: USERS.student.id })

  const legacy = {
    listEntitlements: async (userId) => legacyState.payments.filter((p) => p.userId === userId).map((p) => ({ ...p })),
    listSessionIds: async (userId) => [...new Set([
      ...Object.values(legacyState.sessions).filter((s) => s.userId === userId).map((s) => s.sessionId),
      ...Object.values(legacyState.reports).filter((r) => r.userId === userId).map((r) => r.sessionId),
    ])],
    getSession: async (id) => (legacyState.sessions[id] ? structuredClone(legacyState.sessions[id]) : null),
    getReport: async (id) => (legacyState.reports[id] ? { ...legacyState.reports[id] } : null),
    adminState: async (id) => legacyState.admin[id] || null,
    paths: EMPTY_LEGACY_SOURCES.paths,
  }
  const roleCalls = []
  const audits = []
  const state = { storeUp }
  const campus = createCampusContext({
    repos,
    campusStoreAvailable: () => state.storeUp,
    clock: () => NOW,
    legacy,
    audit: (type, sessionId, payload) => audits.push({ type, sessionId, payload }),
    scenarioSource: async () => SCENARIOS,
    evidence: { units: async (sid) => structuredClone(legacyState.units[sid] || []) },
    roles: {
      evaluate: async (args) => {
        roleCalls.push(args)
        return [
          { roleId: 'SYN-ROLE', title: 'Synthetic Role', basis: 'SELF_REPORTED', whyShown: [{ type: 'SELF_REPORTED_INTEREST', statement: 'You said you enjoy Investigative work.' }], unknowns: [{ note: 'No formal evidence yet for X.' }], nextStep: { type: 'FORMAL_ASSESSMENT', label: 'Complete an assessment.' } },
          { roleId: 'SYN-NONE', title: 'Unrelated', basis: 'NONE', whyShown: [], unknowns: [], nextStep: { type: 'EXPLORE', label: 'x' } },
        ]
      },
    },
    hashActor: (id) => (id ? `hash-of-${id.length}` : null),
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
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { ...(who ? { 'x-test-user': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const workspaces = (await campus.workspaceService.listWorkspaces(USERS.student))
  const campusWs = workspaces.find((w) => w.type === 'CAMPUS_STUDENT')
  const adminWs = (await campus.workspaceService.listWorkspaces(USERS.admin)).find((w) => w.type === 'CAMPUS_ADMIN')
  return { repos, org, campus, call, legacyState, snapshot, roleCalls, audits, state, campusWs, adminWs, close: () => server.close() }
}

async function sponsoredAssignment(w, { windowStart = iso(-day), windowEnd = iso(7 * day), status = 'ACTIVE', userId = USERS.student.id } = {}) {
  await w.campus.catalog.ensureSeeded()
  const a = await w.repos.assessments.createAssignment({
    id: crypto.randomUUID(), definitionId: CORE_DEFINITION_ID, formPolicy: 'SERVER_SELECTED', sponsorType: 'INSTITUTION', organizationId: w.org.id,
    windowStart, windowEnd, integrityPolicy: 'STANDARD', accommodationsPolicy: { requestable: true }, reminderPolicy: { enabled: false },
    createdBy: USERS.admin.id, status, targets: [{ targetType: 'USER', targetId: userId }],
  })
  await w.repos.assessments.addStudent({ assignmentId: a.id, userId, status: 'ASSIGNED' })
  return a
}

test('C4.01: catalog derives definitions and forms only from the injected frozen bank', () => {
  const cat = buildCatalog(SCENARIOS)
  assert.deepEqual(cat.definitions.map((d) => d.id).sort(), [CORE_DEFINITION_ID, 'syn-bank-l1'].sort())
  assert.deepEqual(cat.forms.filter((f) => f.definitionId === CORE_DEFINITION_ID).map((f) => f.scenarioId), ['syn-general-a'], 'retired scenarios get no form')
  const bank = cat.definitions.find((d) => d.id === 'syn-bank-l1')
  assert.ok(bank.measures.includes('CAP-MKT-EXPERIMENTATION'))
  assert.equal(bank.hasArtifacts, true)
  assert.ok(cat.forms.every((f) => f.status === 'FROZEN' && f.frozenAt))
  assert.equal(definitionForScenario(cat, 'syn-bank-l1'), 'syn-bank-l1')
  assert.equal(definitionForScenario(cat, 'syn-general-b'), CORE_DEFINITION_ID)
  assert.deepEqual(buildCatalog({}).definitions, [], 'no bank → no catalog (nothing invented)')
})

test('C4.02: personal assignments are derived idempotently and legacy records are never mutated', async () => {
  const w = await world()
  try {
    const first = await w.call('student', 'GET', '/me/assessments')
    assert.equal(first.status, 200)
    const second = await w.call('student', 'GET', '/me/assessments')
    assert.deepEqual(second.body.data, first.body.data)
    const all = [...first.body.data.active, ...first.body.data.completed, ...first.body.data.upcoming]
    assert.equal(all.length, 3, 'unstarted entitlement + completed session + in-progress session')
    assert.ok(all.every((a) => a.scope === 'PERSONAL' && a.sponsor === null))
    assert.equal(w.repos.db.assignments.size, 3)
    assert.equal(w.snapshot, JSON.stringify(w.legacyState), 'legacy store untouched')
    const unstarted = all.find((a) => a.id === personalAssignmentId(USERS.student.id, 'legacy:sess-unstarted'))
    assert.equal(unstarted.status, 'NOT_STARTED')
    assert.equal(unstarted.cta.kind, 'START')
    assert.equal(unstarted.cta.to, `/app/assessments/${unstarted.id}/briefing`)
    const live = all.find((a) => a.sessionId === 'sess-live')
    assert.equal(live.status, 'IN_PROGRESS')
    assert.equal(live.title, 'Synthetic Bank Simulation')
    assert.equal(live.cta.to, '/workspace/sess-live')
    const done = first.body.data.completed.find((a) => a.sessionId === 'sess-done')
    assert.equal(done.cta.kind, 'VIEW_REPORT')
    assert.equal(first.body.data.active.some((a) => a.sessionId === 'sess-sponsored'), false, 'sponsored session never appears in personal')
    // Another student's entitlement is never visible.
    const other = await w.call('other', 'GET', '/me/assessments')
    assert.equal(other.body.data.active.length, 1)
    assert.notEqual(other.body.data.active[0].id, unstarted.id)
  } finally { w.close() }
})

test('C4.03: capabilities fail closed and count only completed formal sessions in the workspace', async () => {
  const w = await world()
  try {
    const r = await w.call('student', 'GET', '/me/capabilities')
    assert.equal(r.status, 200)
    const byId = Object.fromEntries(r.body.data.items.map((c) => [c.id, c]))
    assert.equal(r.body.data.items.filter((c) => c.layer === 'PRIMARY').length, 5)
    const reasoning = byId['CAP-L1-REASONING']
    assert.equal(reasoning.status, 'PROVISIONAL')
    assert.equal(reasoning.level.band, 'DEVELOPING', 'from the completed session, never the in-progress one')
    assert.equal(reasoning.change, null)
    assert.equal(reasoning.changeStatus, 'NOT_COMPARABLE')
    assert.equal(reasoning.developmentPriority, true)
    assert.deepEqual(reasoning.evidenceSummary.evidenceIds, ['u1', 'u2', 'u3'])
    assert.match(reasoning.evidenceSummary.text, /^Based on 3 observed responses in Prism Workplace Simulation\.$/)
    assert.equal(reasoning.observedBehaviors[0].quote, QUOTE, 'verbatim candidate words only')
    const comm = byId['CAP-L1-COMMUNICATION']
    assert.equal(comm.status, 'INSUFFICIENT_EVIDENCE')
    assert.equal(comm.level, null)
    assert.deepEqual(comm.observedBehaviors, [])
    for (const id of ['CAP-L1-COLLABORATION', 'CAP-L1-ADAPTABILITY', 'CAP-L1-EXECUTION']) {
      assert.equal(byId[id].status, 'INSUFFICIENT_EVIDENCE')
      assert.equal(byId[id].level, null)
    }
    // Campus workspace: only the sponsored session (which has no evidence).
    const c = await w.call('student', 'GET', '/me/capabilities', null, { 'X-Prism-Workspace': w.campusWs.id })
    assert.equal(c.status, 200)
    assert.ok(c.body.data.items.every((i) => i.level === null && i.status === 'INSUFFICIENT_EVIDENCE'))
    assert.equal(c.body.data.assessedCount, 1)
  } finally { w.close() }
})

test('C4.03: evidence explorer filters, verifies quotes and rejects bad filters', async () => {
  const w = await world()
  try {
    const r = await w.call('student', 'GET', '/me/evidence')
    assert.equal(r.status, 200)
    assert.equal(r.body.data.total, 4, 'completed-session units only')
    assert.ok(r.body.data.items.every((i) => i.kind === 'FORMAL' && i.scope === 'PERSONAL'))
    const u4 = r.body.data.items.find((i) => i.id === 'u4')
    assert.equal(u4.candidateAction.quote, null, 'a non-verbatim excerpt is never shown as a quote')
    const f = await w.call('student', 'GET', '/me/evidence?capability=CAP-L1-COMMUNICATION')
    assert.deepEqual(f.body.data.items.map((i) => i.id), ['u4'])
    const practice = await w.call('student', 'GET', '/me/evidence?kind=PRACTICE')
    assert.deepEqual(practice.body.data.items, [])
    const sponsored = await w.call('student', 'GET', '/me/evidence?scope=SPONSORED')
    assert.deepEqual(sponsored.body.data.items, [], 'personal workspace never returns sponsored evidence')
    assert.equal((await w.call('student', 'GET', '/me/evidence?kind=GUESS')).status, 422)
    assert.equal((await w.call('student', 'GET', '/me/evidence?injected=1')).status, 422)
  } finally { w.close() }
})

test('C4.03: home picks the primary action by spec priority and growth is never compared', async () => {
  const w = await world()
  try {
    const personal = await w.call('student', 'GET', '/me/home')
    assert.equal(personal.status, 200)
    assert.equal(personal.body.data.primaryAction.kind, 'ASSESSMENT_IN_PROGRESS', 'in progress outranks an undated available assessment')
    assert.equal(personal.body.data.capabilitySnapshot.length, 5)
    assert.ok(personal.body.data.focus.length <= 3)
    assert.equal(personal.body.data.focus[0].capabilityId, 'CAP-L1-REASONING')
    assert.equal(personal.body.data.sponsor, null)

    // P3.3: a finished session without a report is never "resume". Within the
    // grace window it is processing (no link to buy or resume); after it, a
    // technical failure whose first action is recovery, not a purchase.
    w.legacyState.sessions['sess-live'].completedAt = NOW.getTime() - 60 * 60 * 1000
    const processing = await w.call('student', 'GET', '/me/home')
    assert.equal(processing.body.data.primaryAction.kind, 'ASSESSMENT_PROCESSING')
    assert.equal(processing.body.data.primaryAction.sessionId, 'sess-live')
    assert.equal(processing.body.data.primaryAction.to, null)
    assert.equal(processing.body.data.primaryAction.title, 'Synthetic Bank Simulation')
    w.legacyState.sessions['sess-live'].completedAt = NOW.getTime() - 2 * day
    const failed = await w.call('student', 'GET', '/me/home')
    assert.equal(failed.body.data.primaryAction.kind, 'ASSESSMENT_TECHNICAL_FAILED')
    assert.equal(failed.body.data.primaryAction.to, '/workspace/sess-live', 'recovery reopens the saved run')
    assert.notEqual(failed.body.data.primaryAction.to, EMPTY_LEGACY_SOURCES.paths.purchase)
    delete w.legacyState.sessions['sess-live'].completedAt

    await sponsoredAssignment(w, { windowEnd: iso(3 * day) })
    const campus = await w.call('student', 'GET', '/me/home', null, { 'X-Prism-Workspace': w.campusWs.id })
    assert.equal(campus.body.data.primaryAction.kind, 'ASSESSMENT_DUE')
    assert.equal(campus.body.data.sponsor.organizationName, 'Synthetic University')

    const growth = await w.call('student', 'GET', '/me/growth')
    assert.equal(growth.body.data.comparable, false)
    assert.deepEqual(growth.body.data.changes, [])
    const plan = await w.call('student', 'GET', '/me/development-plan')
    assert.deepEqual(plan.body.data.missions, [])
    assert.equal(plan.body.data.missionsAvailable, false)
  } finally { w.close() }
})

test('C4.06: sponsored briefing requires an acknowledgement stored as a consent record', async () => {
  const w = await world()
  try {
    const a = await sponsoredAssignment(w)
    const ws = { 'X-Prism-Workspace': w.campusWs.id }
    const b = await w.call('student', 'GET', `/assessment-assignments/${a.id}`, null, ws)
    assert.equal(b.status, 200)
    assert.equal(b.body.data.sponsorship.scope, 'SPONSORED')
    assert.equal(b.body.data.sponsorship.acknowledged, false)
    assert.equal(b.body.data.start.reason, 'ACKNOWLEDGEMENT_REQUIRED')
    assert.ok(b.body.data.definition.measures.length === 5)
    assert.ok(b.body.data.definition.notMeasured.includes('EMOTION_OR_TONE'))

    // Isolation: not visible from the personal workspace or to another student.
    assert.equal((await w.call('student', 'GET', `/assessment-assignments/${a.id}`)).status, 404)
    assert.equal((await w.call('other', 'GET', `/assessment-assignments/${a.id}`)).status, 404)

    const stale = await w.call('student', 'POST', `/assessment-assignments/${a.id}/acknowledge`, { copyVersion: 'old', acknowledged: true }, ws)
    assert.equal(stale.status, 409)
    assert.equal((await w.call('student', 'POST', `/assessment-assignments/${a.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION }, ws)).status, 422)
    const ok = await w.call('student', 'POST', `/assessment-assignments/${a.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, ws)
    assert.equal(ok.status, 200)
    const again = await w.call('student', 'POST', `/assessment-assignments/${a.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, ws)
    assert.equal(again.body.data.acknowledgedAt, ok.body.data.acknowledgedAt, 'idempotent')
    const ackAudit = w.audits.filter((x) => x.type === 'campus.assessment_disclosure.acknowledged')
    assert.ok(ackAudit.length >= 1)
    assert.equal(ackAudit[0].payload.assignmentId, a.id)
    assert.ok(ackAudit[0].payload.requestId)
    // A second assignment from the same sponsor reuses the consent for this copy version.
    const b2 = await sponsoredAssignment(w)
    assert.equal((await w.call('student', 'POST', `/assessment-assignments/${b2.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, ws)).status, 200)
    // An ended assignment cannot be acknowledged.
    const ended = await sponsoredAssignment(w, { windowStart: iso(-9 * day), windowEnd: iso(-2 * day) })
    assert.equal((await w.call('student', 'POST', `/assessment-assignments/${ended.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, ws)).status, 409)
    const consents = (await w.repos.sharing.listConsents(USERS.student.id)).filter((c) => c.consentType === 'CAMPUS_ASSESSMENT_DISCLOSURE')
    assert.equal(consents.length, 1)
    assert.equal(consents[0].organizationId, w.org.id)
    assert.equal(consents[0].copyVersion, CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION)
    const after = await w.call('student', 'GET', `/assessment-assignments/${a.id}`, null, ws)
    assert.equal(after.body.data.sponsorship.acknowledged, true)
    // No sponsorship entitlement exists → the start names the reason, never a dead button.
    assert.equal(after.body.data.start.allowed, false)
    assert.equal(after.body.data.start.reason, 'ENTITLEMENT_REQUIRED')

    // Personal assessments need no acknowledgement.
    const list = await w.call('student', 'GET', '/me/assessments')
    const personal = list.body.data.active.find((x) => x.status === 'NOT_STARTED')
    const pb = await w.call('student', 'GET', `/assessment-assignments/${personal.id}`)
    assert.equal(pb.body.data.start.allowed, true)
    assert.equal(pb.body.data.start.to, '/briefing?session=sess-unstarted')
    assert.equal((await w.call('student', 'POST', `/assessment-assignments/${personal.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true })).status, 422)
  } finally { w.close() }
})

test('C4.05: upcoming and closed sponsored assignments land on the right tab', async () => {
  const w = await world()
  try {
    await sponsoredAssignment(w, { windowStart: iso(2 * day), windowEnd: iso(9 * day) })
    await sponsoredAssignment(w, { windowStart: iso(-9 * day), windowEnd: iso(-2 * day) })
    await sponsoredAssignment(w, { status: 'DRAFT' })
    const r = await w.call('student', 'GET', '/me/assessments', null, { 'X-Prism-Workspace': w.campusWs.id })
    assert.equal(r.body.data.upcoming.length, 1)
    assert.equal(r.body.data.upcoming[0].status, 'UPCOMING')
    assert.equal(r.body.data.completed.length, 1)
    assert.equal(r.body.data.completed[0].status, 'EXPIRED')
    assert.equal(r.body.data.active.length, 0, 'drafts are never shown')
    assert.ok([...r.body.data.upcoming, ...r.body.data.completed].every((a) => a.scope === 'SPONSORED' && a.sponsor.name === 'Synthetic University'))
  } finally { w.close() }
})

test('C4.10: role exploration never evaluates without interests and keeps the two inputs separate', async () => {
  const w = await world()
  try {
    const none = await w.call('student', 'POST', '/me/role-exploration', { interests: null })
    assert.equal(none.status, 200)
    assert.deepEqual(none.body.data.recommendations, [])
    assert.equal(none.body.data.evaluated, false)
    assert.equal(w.roleCalls.length, 0)
    assert.equal(none.body.data.demonstrated[0].capabilityId, 'CAP-L1-REASONING')
    const some = await w.call('student', 'POST', '/me/role-exploration', { interests: { I: 1 } })
    assert.deepEqual(some.body.data.selfReported.interests, ['I'])
    assert.deepEqual(some.body.data.recommendations.map((r) => r.roleId), ['SYN-ROLE'], 'roles with no reason are dropped')
    assert.deepEqual(some.body.data.recommendations[0].demonstratedReasons, [])
    assert.equal(JSON.stringify(some.body.data).match(/%|match/i), null, 'no percentages or match scores')
    assert.equal((await w.call('student', 'POST', '/me/role-exploration', { interests: { I: 7 } })).status, 422)
    process.env.PRISM_ROLE_EXPLORATION_V2 = 'false'
    assert.equal((await w.call('student', 'POST', '/me/role-exploration', { interests: null })).status, 404)
  } finally {
    process.env.PRISM_ROLE_EXPLORATION_V2 = 'true'
    w.close()
  }
})

test('C4.11: preferences persist per account; share grants list without secrets and revoke owner-only', async () => {
  const w = await world()
  try {
    const d = await w.call('student', 'GET', '/me/preferences')
    assert.deepEqual(d.body.data, { reducedMotion: false, largerText: false, segment: null, intention: null, responseMode: null, updatedAt: null })
    assert.equal((await w.call('student', 'PUT', '/me/preferences', { reducedMotion: 'yes', largerText: false })).status, 422)
    const put = await w.call('student', 'PUT', '/me/preferences', { reducedMotion: true, largerText: true })
    assert.equal(put.status, 200)
    assert.equal((await w.call('student', 'GET', '/me/preferences')).body.data.largerText, true)
    assert.equal((await w.call('other', 'GET', '/me/preferences')).body.data.largerText, false)

    const grant = await w.repos.sharing.createShareGrant({
      ownerUserId: USERS.student.id, recipientType: 'ORGANIZATION', recipientOrganizationId: w.org.id,
      expiresAt: iso(30 * day), resources: [{ resourceType: 'ASSESSMENT_REPORT', resourceId: 'sess-done', disclosureLevel: 'SUMMARY' }],
    })
    const list = await w.call('student', 'GET', '/me/share-grants')
    assert.equal(list.body.data.items.length, 1)
    assert.equal(list.body.data.items[0].recipient.organizationName, 'Synthetic University')
    assert.equal(list.body.data.items[0].status, 'ACTIVE')
    assert.equal('tokenHash' in list.body.data.items[0], false)
    assert.equal((await w.call('other', 'POST', `/me/share-grants/${grant.id}/revoke`)).status, 404)
    assert.equal((await w.call('student', 'POST', '/me/share-grants/not-a-uuid/revoke')).status, 404)
    const revoked = await w.call('student', 'POST', `/me/share-grants/${grant.id}/revoke`)
    assert.equal(revoked.body.data.status, 'REVOKED')
    const revokeAudit = w.audits.find((a) => a.type === 'share_grant.revoked')
    assert.equal(revokeAudit.payload.shareGrantId, grant.id)
    assert.ok(revokeAudit.payload.requestId, 'audit carries the request id')
    assert.equal((await w.call('student', 'GET', '/me/share-grants')).body.data.items[0].status, 'REVOKED')

    w.state.storeUp = false
    assert.equal((await w.call('student', 'GET', '/me/preferences')).status, 503)
    // Campus on but its store down: sponsorship is unknowable → fail closed.
    assert.equal((await w.call('student', 'GET', '/me/home')).status, 503)
    // Campus off (B2C without the store): personal reads keep working (K18).
    process.env.PRISM_CAMPUS_ENABLED = 'false'
    assert.equal((await w.call('student', 'GET', '/me/home')).status, 200)
  } finally {
    process.env.PRISM_CAMPUS_ENABLED = 'true'
    w.close()
  }
})

test('K59: held or invalidated sessions are never formal evidence', async () => {
  const w = await world()
  try {
    w.legacyState.admin['sess-done'] = { invalid: false, reviewState: 'held' }
    const caps = await w.call('student', 'GET', '/me/capabilities')
    assert.equal(caps.body.data.assessedCount, 0)
    assert.equal(caps.body.data.excludedCount, 1)
    assert.ok(caps.body.data.items.every((c) => c.level === null))
    assert.equal((await w.call('student', 'GET', '/me/evidence')).body.data.total, 0)
    const list = await w.call('student', 'GET', '/me/assessments')
    assert.equal(list.body.data.completed.find((a) => a.sessionId === 'sess-done').underReview, true)
    w.legacyState.admin['sess-done'] = { invalid: true, reviewState: null }
    assert.equal((await w.call('student', 'GET', '/me/capabilities')).body.data.excludedCount, 1)
    const home = await w.call('student', 'GET', '/me/home')
    assert.deepEqual(home.body.data.focus, [])
  } finally { w.close() }
})

test('C4.13: telemetry accepts allow-listed events and drops everything else', async () => {
  const w = await world()
  try {
    assert.equal((await w.call('student', 'POST', '/telemetry', { event: 'answer_typed' })).status, 422)
    assert.equal((await w.call('student', 'POST', '/telemetry', { event: 'org_created' })).status, 403, 'campus funnel events only from campus admin workspaces')
    assert.equal((await w.call('admin', 'POST', '/telemetry', { event: 'org_created' }, { 'X-Prism-Workspace': w.adminWs.id })).status, 202)
    const r = await w.call('student', 'POST', '/telemetry', {
      event: 'briefing_opened',
      props: { assignmentId: 'pa_0123', scope: 'PERSONAL', email: 'student@test.local', transcript: 'my answer', name: 'Synthetic Student', url: '/app/campus-invite/secret' },
    })
    assert.equal(r.status, 202)
    assert.deepEqual(r.body.data.dropped.sort(), ['email', 'name', 'transcript', 'url'])
    const stored = await w.repos.productEvents.list({ event: 'briefing_opened' })
    assert.equal(stored.length, 1)
    assert.deepEqual(stored[0].props, { assignmentId: 'pa_0123', scope: 'PERSONAL' })
    assert.equal(stored[0].workspaceType, 'PERSONAL')
    const raw = JSON.stringify(stored)
    assert.equal(raw.includes(USERS.student.id), false, 'no user id stored')
    assert.equal(raw.includes('student@test.local'), false)
    assert.deepEqual(sanitizeProps({ scope: 'EVERYONE', count: -1, at: 'yesterday' }).props, {})
  } finally { w.close() }
})

test('C4.03: dark shell flag → 404; admin workspace → 403; anonymous → 401', async () => {
  const w = await world()
  try {
    assert.equal((await w.call('admin', 'GET', '/me/home', null, { 'X-Prism-Workspace': w.adminWs.id })).status, 403)
    assert.equal((await w.call(null, 'GET', '/me/home')).status, 401)
    process.env.PRISM_APP_SHELL_V3 = 'false'
    for (const path of ['/me/home', '/me/capabilities', '/me/evidence', '/me/assessments', '/me/development-plan', '/me/growth', '/me/preferences', '/me/share-grants']) {
      assert.equal((await w.call('student', 'GET', path)).status, 404, path)
    }
    assert.equal((await w.call('student', 'POST', '/telemetry', { event: 'briefing_opened' })).status, 404)
  } finally {
    process.env.PRISM_APP_SHELL_V3 = 'true'
    w.close()
  }
})
