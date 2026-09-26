// C5.01–C5.06, C5.13 — the V3 assessment session contract over the real
// /api/v1 handlers with memory repositories and a synthetic engine double
// (the engine router itself is covered by the invoker test below). Proves:
// idempotent start (personal + sponsored, one engine start, one seat),
// owner + workspace isolation, a contract without rubric/prompt internals,
// idempotent messages, versioned artifact writes with 409 conflicts, the
// required-opportunity finish check, early finish, seat consumption, and that
// an engine failure is surfaced — never replaced by generated dialogue.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import express, { Router } from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { createRouterInvoker, createEngineAdapter } from '../domain/assessments/engine.js'
import { transcriptFrom } from '../domain/assessments/sessionContract.js'
import { personalAssignmentId } from '../domain/assessments/assignmentService.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../domain/sharing/copyVersions.js'
import { ApiError } from '../domain/http/errors.js'

// Enabled inside this test process only (K2).
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_ASSESSMENT_WORKSPACE_V3 = 'true'

const NOW = new Date('2026-10-01T10:00:00Z')
const day = 86400000
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()
const USERS = {
  student: { id: 'student-s', email: 'student@test.local', name: 'Synthetic Student' },
  other: { id: 'student-o', email: 'other@test.local', name: 'Other Student' },
}
const SCENARIOS = {
  generalScenarios: [{ id: 'syn-general-a', title: 'Synthetic General', context: 'A synthetic context.', yourRole: 'Analyst', participants: [{ name: 'Synthetic Colleague', role: 'Manager', personality: 'SECRET persona text', tts: { voiceId: 'x' } }] }],
  bankScenarios: {
    'syn-bank-l1': {
      title: 'Synthetic Bank Simulation', version: '1.0.0', blueprintId: 'SYN-JF-L1',
      briefing: { background: 'Background.', objective: 'Objective.', role: 'Associate', characters: [{ name: 'Synthetic Lead', role: 'Lead', persona: 'SECRET persona' }] },
      interactiveArtifacts: [{ artifactId: 'SYN-ART' }],
      probingTree: { initialPrompt: 'SECRET prompt', turns: [1, 2, 3, 4].map((t) => ({ turn: t, targetCapability: 'CAP-L1-REASONING' })) },
    },
  },
}
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-consent.v1' }
const turn = (content) => ({ role: 'assistant', content: JSON.stringify({ messages: [{ speaker: 'Synthetic Colleague', role: 'Manager', content }], internal: 'SECRET directive' }) })

function fakeEngine(state) {
  const calls = { consent: 0, start: 0, message: 0, artifact: 0, evaluate: 0 }
  const owner = (sid) => state.payments.find((p) => p.sessionId === sid)?.userId || null
  return {
    calls,
    async recordConsent({ sessionId, scopes, client }) {
      calls.consent += 1
      if (!CONSENT.scopes.every((s) => scopes.includes(s))) throw new ApiError('CONSENT_REQUIRED', 'Please accept every consent item to continue.', { status: 422 })
      state.consents[sessionId] = scopes
      state.consentClients[sessionId] = client
    },
    async start({ sessionId, scenarioId }) {
      calls.start += 1
      await new Promise((r) => setTimeout(r, 5))
      if (state.failNextStart) { state.failNextStart = false; throw new ApiError('UPSTREAM_UNAVAILABLE', 'This assessment could not be started.') }
      state.sessions[sessionId] = {
        sessionId, userId: owner(sessionId), scenarioId: scenarioId || 'syn-general-a', startedAt: NOW.getTime() - 60000, exchangeCount: 0,
        history: [{ role: 'user', content: 'opening instruction (system text)' }, turn('Welcome to the synthetic scenario.')],
        artifacts: scenarioId === 'syn-bank-l1' ? [{ artifactId: 'SYN-ART', type: 'BUDGET_MODELER', title: 'Synthetic budget', data: { total: 10 } }] : [],
      }
      return { messages: [] }
    },
    async message({ sessionId, text }) {
      calls.message += 1
      await new Promise((r) => setTimeout(r, 5))
      if (state.failNextMessage) { state.failNextMessage = false; throw new ApiError('UPSTREAM_UNAVAILABLE', 'Your answer was not sent.') }
      const s = state.sessions[sessionId]
      s.history.push({ role: 'user', content: `[Candidate]: ${text}` }, turn(`Reply ${s.exchangeCount + 1}`))
      s.exchangeCount += 1
      return { messages: [{ speaker: 'Synthetic Colleague', role: 'Manager', content: `Reply ${s.exchangeCount}` }] }
    },
    async saveArtifact({ sessionId, artifactId, updates }) {
      calls.artifact += 1
      const a = state.sessions[sessionId].artifacts.find((x) => x.artifactId === artifactId)
      a.data = { ...a.data, ...updates }
      return { artifact: structuredClone(a) }
    },
    async evaluate({ sessionId }) {
      calls.evaluate += 1
      state.reports[sessionId] = { sessionId, userId: state.sessions[sessionId].userId, issuedAt: NOW.toISOString(), status: 'INSUFFICIENT_EVIDENCE' }
      return { state: 'COMPLETE' }
    },
    async evaluateStatus() { return 'IDLE' },
  }
}

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USERS.student.id, role: 'STUDENT', status: 'ACTIVE' })
  const state = {
    payments: [{ sessionId: 'sess-personal-001', mode: 'paid', userId: USERS.student.id, consumed: false, createdAt: iso(-day) }],
    sessions: {}, reports: {}, consents: {}, consentClients: {},
  }
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listEntitlements: async (uid) => state.payments.filter((p) => p.userId === uid && p.mode !== 'campus'),
    listSessionIds: async (uid) => Object.values(state.sessions).filter((s) => s.userId === uid).map((s) => s.sessionId),
    getSession: async (sid) => (state.sessions[sid] ? structuredClone(state.sessions[sid]) : null),
    getReport: async (sid) => (state.reports[sid] ? { ...state.reports[sid] } : null),
    getEntitlement: async (sid) => state.payments.find((p) => p.sessionId === sid) || null,
    createEntitlement: async (rec) => { state.payments.push({ ...rec, consumed: false, createdAt: NOW.toISOString() }); return rec },
  }
  const engine = fakeEngine(state)
  const audits = []
  const campus = createCampusContext({
    repos, clock: () => NOW, legacy, engine, scenarioSource: async () => SCENARIOS,
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
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
    return { status: r.status, body: await r.json().catch(() => null), etag: r.headers.get('etag') }
  }
  const campusWs = (await campus.workspaceService.listWorkspaces(USERS.student)).find((w) => w.type === 'CAMPUS_STUDENT')
  return { repos, org, state, engine, audits, campus, call, campusWs, close: () => server.close() }
}

const personalId = () => personalAssignmentId(USERS.student.id, 'legacy:sess-personal-001')
const startPersonal = (w, key = 'idem-personal-1', body = { consent: CONSENT }, headers = {}) => w.call('student', 'POST', `/assessment-assignments/${personalId()}/start`, body, { 'Idempotency-Key': key, ...headers })

async function sponsored(w, { definitionId = 'syn-bank-l1', entitlement = true } = {}) {
  await w.campus.catalog.ensureSeeded()
  const a = await w.repos.assessments.createAssignment({
    id: crypto.randomUUID(), definitionId, formPolicy: 'FIXED_FORM', formId: 'syn-bank-l1:1.0.0', sponsorType: 'INSTITUTION', organizationId: w.org.id,
    windowStart: iso(-day), windowEnd: iso(7 * day), integrityPolicy: 'STANDARD', accommodationsPolicy: {}, reminderPolicy: {},
    createdBy: 'owner', status: 'ACTIVE', targets: [{ targetType: 'USER', targetId: USERS.student.id }],
  })
  await w.repos.assessments.addStudent({ assignmentId: a.id, userId: USERS.student.id, status: 'ASSIGNED' })
  let ent = null
  if (entitlement) {
    ent = await w.repos.entitlements.createEntitlement({
      organizationId: w.org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5,
      validFrom: iso(-day), validUntil: iso(30 * day), status: 'ACTIVE',
    })
  }
  return { assignment: a, entitlement: ent, ws: { 'X-Prism-Workspace': w.campusWs.id } }
}

test('C5.03: personal start needs an Idempotency-Key and consent, records consent, starts the engine once', async () => {
  const w = await world()
  try {
    assert.equal((await startPersonal(w, '')).status, 428)
    assert.equal((await startPersonal(w, 'idem-1', {})).status, 422)
    const bad = await startPersonal(w, 'idem-2', { consent: { scopes: ['data_processing'], consentVersion: 'v' } })
    assert.equal(bad.status, 422)
    assert.equal(bad.body.error.code, 'CONSENT_REQUIRED')
    assert.equal(w.engine.calls.consent, 0, 'incomplete consent is refused before anything is recorded or reserved')
    assert.equal(w.engine.calls.start, 0, 'no engine start without full consent')
    const first = await startPersonal(w, 'idem-3', { consent: CONSENT }, { 'User-Agent': 'SyntheticAgent/1.0' })
    assert.equal(first.status, 201)
    assert.equal(first.body.data.sessionId, 'sess-personal-001')
    assert.equal(first.body.data.to, '/app/assessment/sess-personal-001')
    const client = w.state.consentClients['sess-personal-001']
    assert.equal(client.userAgent, 'SyntheticAgent/1.0', 'the consent record describes the real request')
    assert.match(client.ip, /127\.0\.0\.1|::1/)
    const started = w.audits.find((x) => x.type === 'assessment.started')
    assert.equal(started.sid, 'sess-personal-001', 'the start audit row is linked to its session')
    assert.equal(started.payload.scope, 'PERSONAL')
    const replay = await startPersonal(w, 'idem-3')
    assert.equal(replay.status, 200)
    assert.equal(replay.body.data.resumed, true)
    const otherKey = await startPersonal(w, 'idem-4')
    assert.equal(otherKey.body.data.sessionId, 'sess-personal-001')
    assert.equal(w.engine.calls.start, 1, 'the engine is never started twice for one assignment')
    assert.equal((await w.call('other', 'POST', `/assessment-assignments/${personalId()}/start`, { consent: CONSENT }, { 'Idempotency-Key': 'k-other' })).status, 404)
  } finally { w.close() }
})

test('C5.03: sponsored start needs the acknowledgement and a sponsorship seat; replays share one session and one seat', async () => {
  const w = await world()
  try {
    const noSeat = await sponsored(w, { entitlement: false })
    const path = `/assessment-assignments/${noSeat.assignment.id}/start`
    assert.equal((await w.call('student', 'POST', path, { consent: CONSENT }, { ...noSeat.ws, 'Idempotency-Key': 'k-a' })).body.error.code, 'ACKNOWLEDGEMENT_REQUIRED')
    await w.call('student', 'POST', `/assessment-assignments/${noSeat.assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, noSeat.ws)
    const denied = await w.call('student', 'POST', path, { consent: CONSENT }, { ...noSeat.ws, 'Idempotency-Key': 'k-b' })
    assert.equal(denied.status, 402)
    assert.equal(w.engine.calls.start, 0)

    const s = await sponsored(w)
    await w.call('student', 'POST', `/assessment-assignments/${s.assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, s.ws)
    const p2 = `/assessment-assignments/${s.assignment.id}/start`
    const [a, b] = await Promise.all([
      w.call('student', 'POST', p2, { consent: CONSENT }, { ...s.ws, 'Idempotency-Key': 'k-c' }),
      w.call('student', 'POST', p2, { consent: CONSENT }, { ...s.ws, 'Idempotency-Key': 'k-d' }),
    ])
    assert.equal(a.body.data.sessionId, b.body.data.sessionId, 'concurrent starts share one session')
    assert.equal(w.engine.calls.start, 1)
    const sessionId = a.body.data.sessionId
    const scope = await w.repos.scopes.getSessionScope(sessionId)
    assert.equal(scope.sponsorType, 'INSTITUTION')
    assert.equal(scope.sponsorOrganizationId, w.org.id)
    assert.equal(w.state.payments.find((p) => p.sessionId === sessionId).mode, 'campus', 'engine gate record, never a personal purchase')
    const reserved = (await w.repos.entitlements.listConsumptions(s.entitlement.id)).filter((c) => c.event === 'RESERVED')
    assert.equal(reserved.length, 1, 'one seat')
    const roster = await w.repos.assessments.getAssignmentForUser(s.assignment.id, USERS.student.id)
    assert.equal(roster.student.status, 'IN_PROGRESS')
    assert.equal(roster.student.sessionId, sessionId)
    // The sponsored session never appears in the personal workspace.
    const personal = await w.call('student', 'GET', '/me/assessments')
    assert.equal([...personal.body.data.active, ...personal.body.data.completed].some((x) => x.sessionId === sessionId), false)
    assert.equal((await w.call('student', 'GET', `/assessment-sessions/${sessionId}`)).status, 404, 'sponsored session not readable from personal')
    assert.ok(w.audits.some((x) => x.type === 'assessment.started' && x.payload.scope === 'SPONSORED' && x.sid === sessionId))
  } finally { w.close() }
})

test('C5.03 (K69): a failed sponsored start keeps its seat; the retry reuses it and finishing consumes it once', async () => {
  const w = await world()
  try {
    const s = await sponsored(w)
    await w.call('student', 'POST', `/assessment-assignments/${s.assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, s.ws)
    const path = `/assessment-assignments/${s.assignment.id}/start`
    w.state.failNextStart = true
    const failed = await w.call('student', 'POST', path, { consent: CONSENT }, { ...s.ws, 'Idempotency-Key': 'k-fail-1' })
    assert.equal(failed.status, 503)
    const retried = await w.call('student', 'POST', path, { consent: CONSENT }, { ...s.ws, 'Idempotency-Key': 'k-fail-2' })
    assert.equal(retried.status, 201)
    const sid = retried.body.data.sessionId
    let events = (await w.repos.entitlements.listConsumptions(s.entitlement.id)).map((c) => c.event)
    assert.deepEqual(events, ['RESERVED'], 'no release on a retryable failure: the retry runs on an open seat')
    assert.equal((await w.repos.entitlements.listConsumptions(s.entitlement.id))[0].sessionId, sid)
    await w.call('student', 'POST', `/assessment-sessions/${sid}/finish`, { early: true }, s.ws)
    events = (await w.repos.entitlements.listConsumptions(s.entitlement.id)).map((c) => c.event)
    assert.deepEqual(events.sort(), ['CONSUMED', 'RESERVED'])
  } finally { w.close() }
})

test('C5.03: a fixed-form assignment resolves its scenario through its pinned form; a form that does not belong to it fails closed before any seat', async () => {
  const w = await world()
  try {
    const s = await sponsored(w)
    const foreignForm = (await w.campus.catalog.getCatalog()).forms.find((f) => f.definitionId !== 'syn-bank-l1')
    await w.repos.assessments.createAssignment({
      id: crypto.randomUUID(), definitionId: 'syn-bank-l1', formPolicy: 'FIXED_FORM', formId: foreignForm.id, sponsorType: 'INSTITUTION', organizationId: w.org.id,
      windowStart: iso(-day), windowEnd: iso(7 * day), integrityPolicy: 'STANDARD', accommodationsPolicy: {}, reminderPolicy: {},
      createdBy: 'owner', status: 'ACTIVE', targets: [{ targetType: 'USER', targetId: USERS.student.id }],
    }).then(async (bad) => {
      await w.repos.assessments.addStudent({ assignmentId: bad.id, userId: USERS.student.id, status: 'ASSIGNED' })
      await w.call('student', 'POST', `/assessment-assignments/${bad.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, s.ws)
      const r = await w.call('student', 'POST', `/assessment-assignments/${bad.id}/start`, { consent: CONSENT }, { ...s.ws, 'Idempotency-Key': 'k-form-bad' })
      assert.equal(r.status, 422)
      assert.equal(r.body.error.code, 'SCENARIO_NOT_FOUND')
    })
    assert.equal((await w.repos.entitlements.listConsumptions(s.entitlement.id)).length, 0, 'no seat reserved for an unresolvable form')
    await w.call('student', 'POST', `/assessment-assignments/${s.assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, s.ws)
    const ok = await w.call('student', 'POST', `/assessment-assignments/${s.assignment.id}/start`, { consent: CONSENT }, { ...s.ws, 'Idempotency-Key': 'k-form-ok' })
    assert.equal(ok.status, 201)
    assert.equal(w.state.sessions[ok.body.data.sessionId].scenarioId, 'syn-bank-l1')
  } finally { w.close() }
})

test('K67: campus-sponsored engine sessions are real candidates; the V3 consent pre-check mirrors the engine', async () => {
  const { REAL_ENTITLEMENT_MODES } = await import('../lib/sharedConstants.js')
  assert.ok(REAL_ENTITLEMENT_MODES.includes('campus'))
  const { fromLegacyEntitlement } = await import('../domain/entitlements/legacyAdapter.js')
  assert.equal(fromLegacyEntitlement({ sessionId: 'sess-campus-0001', mode: 'campus', userId: 'u' }), null, 'a campus engine record is never read as a personal entitlement')
  const { REQUIRED_CONSENT_SCOPES } = await import('../domain/assessments/sessionService.js')
  const src = readFileSync(new URL('../routes/assessment.js', import.meta.url), 'utf-8')
  const block = src.match(/const REQUIRED_CONSENT_SCOPES = \[([\s\S]*?)\]/)[1]
  const engineScopes = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  assert.deepEqual([...REQUIRED_CONSENT_SCOPES], engineScopes)
})

test('C5.02: the session contract carries what the player needs and nothing that reveals scoring', async () => {
  const w = await world()
  try {
    await startPersonal(w)
    const r = await w.call('student', 'GET', '/assessment-sessions/sess-personal-001')
    assert.equal(r.status, 200)
    const c = r.body.data
    assert.equal(c.status, 'IN_PROGRESS')
    assert.equal(c.scope, 'PERSONAL')
    assert.equal(c.scenario.title, 'Synthetic General')
    assert.deepEqual(c.scenario.participants, [{ name: 'Synthetic Colleague', role: 'Manager' }])
    assert.deepEqual(c.messages, [{ speaker: 'Synthetic Colleague', role: 'Manager', content: 'Welcome to the synthetic scenario.', isUser: false }])
    assert.equal(c.progress.requiredExchanges, 3)
    assert.equal(c.timing.serverTime, NOW.toISOString())
    assert.ok(c.timing.remainingMs > 0)
    const raw = JSON.stringify(c)
    for (const secret of ['SECRET', 'probingTree', 'targetCapability', '"persona"', '"personality"', 'rubric', 'anchor', 'evidence', 'ledger', '"tts"', 'opening instruction']) {
      assert.equal(raw.includes(secret), false, `contract must not contain ${secret}`)
    }
    assert.equal((await w.call('other', 'GET', '/assessment-sessions/sess-personal-001')).status, 404)
    assert.equal((await w.call('student', 'GET', '/assessment-sessions/sess-personal-001', null, { 'X-Prism-Workspace': w.campusWs.id })).status, 404, 'personal session not readable from the campus workspace')
    assert.equal((await w.call('student', 'GET', '/assessment-sessions/no-such-session')).status, 404)
    // An unknown scenario fails closed.
    w.state.sessions['sess-personal-001'].scenarioId = 'retired-and-gone'
    const unknown = await w.call('student', 'GET', '/assessment-sessions/sess-personal-001')
    assert.equal(unknown.status, 422)
    assert.equal(unknown.body.error.code, 'SCENARIO_NOT_FOUND')
  } finally { w.close() }
})

test('C5.04: messages are idempotent by clientEventId; engine failures are surfaced, never replaced', async () => {
  const w = await world()
  try {
    await startPersonal(w)
    const path = '/assessment-sessions/sess-personal-001/messages'
    assert.equal((await w.call('student', 'POST', path, { text: 'hello' })).status, 422)
    const [a, b] = await Promise.all([
      w.call('student', 'POST', path, { clientEventId: 'evt-00000001', text: 'First answer' }),
      w.call('student', 'POST', path, { clientEventId: 'evt-00000001', text: 'First answer' }),
    ])
    assert.deepEqual(a.body.data.messages, b.body.data.messages)
    assert.equal(w.engine.calls.message, 1, 'a duplicate never produces a second engine turn')
    assert.equal([a.body.data.replayed, b.body.data.replayed].filter(Boolean).length, 1)
    assert.equal(a.body.data.exchanges, 1)

    w.state.failNextMessage = true
    const failed = await w.call('student', 'POST', path, { clientEventId: 'evt-00000002', text: 'Second answer' })
    assert.equal(failed.status, 503)
    assert.equal(failed.body.error.code, 'UPSTREAM_UNAVAILABLE')
    assert.equal(failed.body.data, undefined, 'no generated reply')
    const retried = await w.call('student', 'POST', path, { clientEventId: 'evt-00000002', text: 'Second answer' })
    assert.equal(retried.status, 201, 'the same event can be retried after a failure')
    assert.equal(retried.body.data.messages[0].content, 'Reply 2')
    // Resume after refresh: the transcript comes from the server.
    const again = await w.call('student', 'GET', '/assessment-sessions/sess-personal-001')
    assert.deepEqual(again.body.data.messages.filter((m) => m.isUser).map((m) => m.content), ['First answer', 'Second answer'])
  } finally { w.close() }
})

test('C5.05: artifact writes are versioned; stale writes get 409 with the server snapshot', async () => {
  const w = await world()
  try {
    const s = await sponsored(w)
    await w.call('student', 'POST', `/assessment-assignments/${s.assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, s.ws)
    const started = await w.call('student', 'POST', `/assessment-assignments/${s.assignment.id}/start`, { consent: CONSENT }, { ...s.ws, 'Idempotency-Key': 'k-art' })
    const sid = started.body.data.sessionId
    const path = `/assessment-sessions/${sid}/artifacts/SYN-ART`
    const contract = await w.call('student', 'GET', `/assessment-sessions/${sid}`, null, s.ws)
    assert.equal(contract.body.data.artifacts[0].version, 0)
    assert.equal(contract.body.data.device.requiresLargeScreen, true)
    assert.equal((await w.call('student', 'PATCH', path, { updates: { total: 12 } }, s.ws)).status, 428)
    const saved = await w.call('student', 'PATCH', path, { updates: { total: 12 }, notes: 'Synthetic reasoning', clientEventId: 'art-00000001' }, { ...s.ws, 'If-Match': '0' })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.data.version, 1)
    assert.equal(saved.body.data.notes, 'Synthetic reasoning')
    assert.equal(saved.etag, '"1"')
    const resumed = await w.call('student', 'GET', `/assessment-sessions/${sid}`, null, s.ws)
    assert.equal(resumed.body.data.artifacts[0].notes, 'Synthetic reasoning', 'saved reasoning comes back on resume')
    const replay = await w.call('student', 'PATCH', path, { updates: { total: 12 }, notes: 'Synthetic reasoning', clientEventId: 'art-00000001' }, { ...s.ws, 'If-Match': '0' })
    assert.equal(replay.body.data.replayed, true)
    const stale = await w.call('student', 'PATCH', path, { updates: { total: 99 } }, { ...s.ws, 'If-Match': '0' })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.error.details.version, 1)
    assert.deepEqual(stale.body.error.details.artifact.data, { total: 12 }, 'server snapshot, not the stale draft')
    assert.equal(stale.body.error.details.artifact.notes, 'Synthetic reasoning')
    assert.equal(w.engine.calls.artifact, 1)
    assert.equal((await w.call('student', 'PATCH', `/assessment-sessions/${sid}/artifacts/NOPE`, { updates: {} }, { ...s.ws, 'If-Match': '0' })).status, 404)
  } finally { w.close() }
})

test('C5.06: finish checks evidence opportunities, allows an explicit early exit, and closes the seat', async () => {
  const w = await world()
  try {
    const s = await sponsored(w)
    await w.call('student', 'POST', `/assessment-assignments/${s.assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true }, s.ws)
    const sid = (await w.call('student', 'POST', `/assessment-assignments/${s.assignment.id}/start`, { consent: CONSENT }, { ...s.ws, 'Idempotency-Key': 'k-fin' })).body.data.sessionId
    await w.call('student', 'POST', `/assessment-sessions/${sid}/messages`, { clientEventId: 'evt-fin-0001', text: 'Only answer' }, s.ws)
    const early = await w.call('student', 'POST', `/assessment-sessions/${sid}/finish`, {}, s.ws)
    assert.equal(early.status, 409)
    assert.equal(early.body.error.code, 'FINISH_CONFIRMATION_REQUIRED')
    assert.deepEqual(early.body.error.details, { exchanges: 1, requiredExchanges: 4 })
    assert.equal(w.engine.calls.evaluate, 0)
    const done = await w.call('student', 'POST', `/assessment-sessions/${sid}/finish`, { early: true }, s.ws)
    assert.equal(done.status, 200)
    assert.equal(done.body.data.state, 'COMPLETE')
    const again = await w.call('student', 'POST', `/assessment-sessions/${sid}/finish`, { early: true }, s.ws)
    assert.equal(again.body.data.state, 'COMPLETE')
    assert.equal(w.engine.calls.evaluate, 1, 'finish is idempotent')
    const events = (await w.repos.entitlements.listConsumptions(s.entitlement.id)).map((c) => c.event)
    assert.deepEqual(events.sort(), ['CONSUMED', 'RESERVED'])
    const roster = await w.repos.assessments.getAssignmentForUser(s.assignment.id, USERS.student.id)
    assert.equal(roster.student.status, 'COMPLETED')
    const contract = await w.call('student', 'GET', `/assessment-sessions/${sid}`, null, s.ws)
    assert.equal(contract.body.data.status, 'COMPLETED')
    assert.ok(contract.body.data.reportPath)
    assert.equal((await w.call('student', 'POST', `/assessment-sessions/${sid}/messages`, { clientEventId: 'evt-fin-0002', text: 'Late' }, s.ws)).status, 409)
    assert.ok(w.audits.some((x) => x.type === 'assessment.finish_requested' && x.payload.early === true && x.sid === sid && x.payload.sessionId === sid))
  } finally { w.close() }
})

test('C5.12: the session API is dark without PRISM_ASSESSMENT_WORKSPACE_V3', async () => {
  const w = await world()
  try {
    process.env.PRISM_ASSESSMENT_WORKSPACE_V3 = 'false'
    assert.equal((await startPersonal(w)).status, 404)
    assert.equal((await w.call('student', 'GET', '/assessment-sessions/sess-personal-001')).status, 404)
    // The briefing falls back to the legacy start (K52).
    const b = await w.call('student', 'GET', `/assessment-assignments/${personalId()}`)
    assert.equal(b.body.data.start.mode, 'LEGACY')
  } finally {
    process.env.PRISM_ASSESSMENT_WORKSPACE_V3 = 'true'
    w.close()
  }
})

test('engine adapter: the router invoker runs the unchanged engine router in-process and maps its answers', async () => {
  const router = Router()
  router.post('/start', (req, res) => {
    if (req.headers.authorization !== 'Bearer t') return res.status(402).json({ error: 'Payment required' })
    return res.json({ messages: [{ speaker: 'A', role: 'B', content: 'Hi' }], secret: 'x' })
  })
  router.post('/message', (_req, res) => res.status(410).json({ error: 'Session time limit reached.' }))
  router.post('/evaluate', (_req, res) => res.status(500).json({ error: 'Evaluation failed' }))
  router.get('/evaluate-status/:sessionId', (req, res) => res.json({ status: req.params.sessionId === 's1' ? 'scoring' : 'idle' }))
  router.post('/boom', (_req, _res, next) => next(new Error('boom')))
  router.post('/consent', (req, res) => res.json({ ok: true, ip: req.ip ?? null, userAgent: req.get('user-agent') || null }))
  const invoke = createRouterInvoker(router)
  const engine = createEngineAdapter({ invoke })
  const consent = await engine.recordConsent({ sessionId: 's1', scopes: ['a'], consentVersion: 'v', authorization: 'Bearer t', client: { ip: '203.0.113.9', userAgent: 'SyntheticAgent/1.0' } })
  assert.equal(consent.ip, '203.0.113.9', 'the caller address is forwarded, never a made-up loopback')
  assert.equal(consent.userAgent, 'SyntheticAgent/1.0')
  const anonymous = await engine.recordConsent({ sessionId: 's1', scopes: ['a'], consentVersion: 'v' })
  assert.equal(anonymous.ip, null)
  assert.deepEqual(await engine.start({ sessionId: 's1', authorization: 'Bearer t' }), { messages: [{ speaker: 'A', role: 'B', content: 'Hi' }] })
  await assert.rejects(engine.start({ sessionId: 's1' }), { code: 'ENTITLEMENT_REQUIRED' })
  await assert.rejects(engine.message({ sessionId: 's1', text: 'x' }), { code: 'SESSION_TIME_LIMIT' })
  await assert.rejects(engine.evaluate({ sessionId: 's1' }), { code: 'UPSTREAM_UNAVAILABLE' })
  assert.equal(await engine.evaluateStatus({ sessionId: 's1' }), 'SCORING')
  assert.equal((await invoke({ method: 'GET', path: '/nope' })).status, 404)
  await assert.rejects(invoke({ method: 'POST', path: '/boom' }), /boom/)
})

test('transcript: only candidate turns and parsed participant turns; system text and raw output never shown', () => {
  const t = transcriptFrom([
    { role: 'user', content: 'opening instruction' },
    { role: 'assistant', content: 'not json at all' },
    { role: 'assistant', content: JSON.stringify({ messages: [{ speaker: 'P', role: 'R', content: 'Hello' }, { speaker: 'Q', content: '' }] }) },
    { role: 'user', content: '[Candidate]: My answer' },
  ])
  assert.deepEqual(t, [
    { speaker: 'P', role: 'R', content: 'Hello', isUser: false },
    { speaker: 'You', role: null, content: 'My answer', isUser: true },
  ])
})

test('the session time limit matches the engine', () => {
  const src = readFileSync(new URL('../routes/assessment.js', import.meta.url), 'utf-8')
  assert.match(src, /const SESSION_LIMIT_MS = 35 \* 60 \* 1000/)
})
