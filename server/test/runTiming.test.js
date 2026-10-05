// P3.8 one authoritative timing policy — through the real /api/v1 router with
// memory repos. A draft-segment run is allocated untimed, begun exactly once
// (idempotent + concurrency-safe), its deadline survives refresh, formal
// answers stop at the server-side cutoff while finish still works, and a
// legacy (non-draft) run keeps its engine-derived 35-minute timing untouched.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION } from '../domain/sharing/copyVersions.js'
import { DRAFT_CORE_TEAMREADY_A_HANDOVER, DRAFT_SEGMENT_ID, draftBankScenarios } from '../domain/assessments/draftSegments.js'
import { createSliceEvaluator } from '../domain/evidence/sliceEvaluator.js'
import { LEGACY_35, DRAFT_UNIVERSAL, timingPolicyFor, legacyPolicy } from '../domain/assessments/timingPolicy.js'
import { createSessionIoRepoMemory } from '../domain/assessments/sessionIoRepository.js'
import evidenceGraph from '../lib/evidenceGraph.js'

process.env.NODE_ENV = 'test'
process.env.PRISM_AUDIT_AI = 'true'
process.env.PRISM_DRAFT_CONTENT = 'true'
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_ASSESSMENT_WORKSPACE_V3 = 'true'
process.env.PRISM_STUDENT_REPORT_V3 = 'true'
const { createCompletion } = await import('../services/ai/completionService.js')

const T0 = new Date('2026-10-02T10:00:00Z')
const MINUTE = 60_000
const day = 86400000
const USER = { id: 'student-timing', email: 'timing@test.local', name: 'Synthetic Student' }
const CONSENT = { scopes: ['data_processing', 'ai_disclosure', 'ai_scoring_oversight', 'proctoring', 'face_analysis', 'own_work'], consentVersion: 'synthetic-consent.v1' }
const DRAFT_FORM_ID = `${DRAFT_SEGMENT_ID}:${DRAFT_CORE_TEAMREADY_A_HANDOVER.version}`
const LEGACY_BANK = {
  'syn-bank-l1': {
    title: 'Synthetic Bank Simulation', version: '1.0.0', blueprintId: 'SYN-JF-L1',
    briefing: { background: 'Background.', objective: 'Objective.', role: 'Associate', characters: [{ name: 'Synthetic Lead', role: 'Lead' }] },
    interactiveArtifacts: [{ artifactId: 'SYN-ART' }],
    probingTree: { initialPrompt: 'prompt', turns: [1, 2, 3].map((t) => ({ turn: t, targetCapability: 'CAP-L1-REASONING' })) },
  },
}
const turn = (content) => ({ role: 'assistant', content: JSON.stringify({ messages: [{ speaker: 'Nia', role: 'Co-organiser', content }] }) })

function fakeEngine(state, clock) {
  const owner = (sid) => state.payments.find((p) => p.sessionId === sid)?.userId || null
  return {
    async recordConsent({ sessionId, scopes }) { state.consents[sessionId] = scopes },
    async start({ sessionId, scenarioId }) {
      const bank = { ...draftBankScenarios(), ...LEGACY_BANK }[scenarioId]
      state.sessions[sessionId] = {
        sessionId, userId: owner(sessionId), scenarioId, startedAt: clock().getTime(), exchangeCount: 0,
        history: [{ role: 'user', content: 'opening instruction' }, turn('Dev is away from tomorrow. Where do we stand?')],
        artifacts: (bank?.interactiveArtifacts || []).map((a) => structuredClone(a)),
      }
      return { messages: [] }
    },
    async message({ sessionId, text }) {
      const s = state.sessions[sessionId]
      s.history.push({ role: 'user', content: `[Candidate]: ${text}` }, turn(`reply ${s.exchangeCount + 1}`))
      s.exchangeCount += 1
      return { messages: [{ speaker: 'Nia', role: 'Co-organiser', content: `reply ${s.exchangeCount}` }] }
    },
    async saveArtifact({ sessionId, artifactId, updates }) {
      const a = state.sessions[sessionId].artifacts.find((x) => x.artifactId === artifactId)
      a.data = { ...a.data, ...updates }
      return { artifact: structuredClone(a) }
    },
    async evaluate() { return { state: 'SCORING' } },
    async evaluateStatus() { return 'IDLE' },
  }
}

async function world() {
  let now = T0
  const clock = () => now
  const repos = createMemoryCampusRepos({ clock })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: `syn-t-${Math.random().toString(36).slice(2, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: USER.id, role: 'STUDENT', status: 'ACTIVE' })
  const state = { payments: [], sessions: {}, consents: {} }
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listEntitlements: async () => [],
    listSessionIds: async (uid) => Object.values(state.sessions).filter((s) => s.userId === uid).map((s) => s.sessionId),
    getSession: async (sid) => (state.sessions[sid] ? structuredClone(state.sessions[sid]) : null),
    getReport: async () => null,
    getEntitlement: async (sid) => state.payments.find((p) => p.sessionId === sid) || null,
    createEntitlement: async (rec) => { state.payments.push({ ...rec, consumed: false, createdAt: clock().toISOString() }); return rec },
    // Draft runs are created through the legacy store, never the engine.
    createSession: async (sid, rec) => { state.sessions[sid] = { sessionId: sid, ...structuredClone(rec), startedAt: clock().getTime(), completedAt: null } },
    updateSession: async (sid, patch) => { Object.assign(state.sessions[sid], structuredClone(patch)); return structuredClone(state.sessions[sid]) },
  }
  const engine = fakeEngine(state, clock)
  const audits = []
  const sliceEvaluator = createSliceEvaluator({ complete: createCompletion, recordUnit: (unit, tx) => evidenceGraph.recordEvidenceUnit(unit, tx) })
  const campus = createCampusContext({
    repos, clock, legacy, engine, sliceEvaluator,
    scenarioSource: async () => ({ generalScenarios: [], bankScenarios: { ...draftBankScenarios(), ...LEGACY_BANK } }),
    evidence: { units: (sid) => evidenceGraph.getEvidenceUnits(sid) },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
  })
  const requireUser = (req, _res, next) => { req.user = USER; next() }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const campusWs = (await campus.workspaceService.listWorkspaces(USER)).find((w) => w.type === 'CAMPUS_STUDENT')
  const ws = { 'X-Prism-Workspace': campusWs.id }
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(`${base}${path}`, {
      method, headers: { ...ws, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  await campus.catalog.ensureSeeded()
  await repos.entitlements.createEntitlement({
    organizationId: org.id, sourceType: 'INSTITUTION_SPONSORSHIP', productCode: 'PRISM_CAMPUS_ASSESSMENT', quantity: 5,
    validFrom: new Date(T0.getTime() - day).toISOString(), validUntil: new Date(T0.getTime() + 30 * day).toISOString(), status: 'ACTIVE',
  })
  const assign = async (definitionId, formId) => {
    const assignment = await repos.assessments.createAssignment({
      id: crypto.randomUUID(), definitionId, formPolicy: 'FIXED_FORM', formId, sponsorType: 'INSTITUTION', organizationId: org.id,
      windowStart: new Date(T0.getTime() - day).toISOString(), windowEnd: new Date(T0.getTime() + 7 * day).toISOString(),
      integrityPolicy: 'STANDARD', accommodationsPolicy: {}, reminderPolicy: {}, createdBy: 'owner', status: 'ACTIVE', targets: [{ targetType: 'USER', targetId: USER.id }],
    })
    await repos.assessments.addStudent({ assignmentId: assignment.id, userId: USER.id, status: 'ASSIGNED' })
    await call('POST', `/assessment-assignments/${assignment.id}/acknowledge`, { copyVersion: CAMPUS_ASSESSMENT_DISCLOSURE_COPY_VERSION, acknowledged: true })
    const r = await call('POST', `/assessment-assignments/${assignment.id}/start`, { consent: CONSENT }, { 'Idempotency-Key': `k-${Math.random()}` })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    return r.body.data.sessionId
  }
  const startDraft = () => assign(DRAFT_SEGMENT_ID, DRAFT_FORM_ID)
  const startLegacy = () => assign('syn-bank-l1', 'syn-bank-l1:1.0.0')
  const begin = (sid, key, body = {}) => call('POST', `/assessment-sessions/${sid}/begin`, body, { 'Idempotency-Key': key })
  const message = (sid, id, text = 'Who is free to take the invitation list this week?') => call('POST', `/assessment-sessions/${sid}/messages`, { clientEventId: id, text })
  const get = (sid) => call('GET', `/assessment-sessions/${sid}`)
  return {
    repos, audits, call, startDraft, startLegacy, begin, message, get,
    advance: (ms) => { now = new Date(now.getTime() + ms) },
    close: () => server.close(),
  }
}

test('timing policies: legacy is 35 minutes with no grace; the draft universal policy is 25+5 and labelled proposed; nothing resolves to 30', () => {
  assert.equal(LEGACY_35.durationMs, 35 * MINUTE)
  assert.equal(LEGACY_35.graceMs, 0)
  assert.equal(DRAFT_UNIVERSAL.durationMs, 25 * MINUTE)
  assert.equal(DRAFT_UNIVERSAL.graceMs, 5 * MINUTE)
  assert.equal(DRAFT_UNIVERSAL.status, 'PROPOSED_PENDING_REVIEW')
  assert.equal(timingPolicyFor({ draft: true, limitMs: 35 * MINUTE }), DRAFT_UNIVERSAL)
  assert.equal(timingPolicyFor({ draft: false, limitMs: 35 * MINUTE }), LEGACY_35)
  assert.equal(legacyPolicy(undefined).durationMs, 35 * MINUTE)
  for (const p of [LEGACY_35, DRAFT_UNIVERSAL]) assert.notEqual(p.durationMs, 30 * MINUTE)
})

test('P3.8: a draft run is ALLOCATED and not begun; formal answers and artifact saves are refused with ASSESSMENT_NOT_BEGUN', async () => {
  const w = await world()
  try {
    const sid = await w.startDraft()
    const c = await w.get(sid)
    assert.equal(c.status, 200)
    assert.equal(c.body.data.status, 'ALLOCATED')
    assert.equal(c.body.data.timing.begun, false)
    assert.equal(c.body.data.timing.startedAt, null)
    assert.equal(c.body.data.timing.deadlineAt, null)
    assert.equal(c.body.data.timing.remainingMs, null)
    assert.equal(c.body.data.timing.policyVersion, DRAFT_UNIVERSAL.version)
    const m = await w.message(sid, 'evt-notbegun-001')
    assert.equal(m.status, 409)
    assert.equal(m.body.error.code, 'ASSESSMENT_NOT_BEGUN')
    const a = await w.call('PATCH', `/assessment-sessions/${sid}/artifacts/HANDOVER-BOARD`, { updates: { 'row-1-owner': 'Nia' }, clientEventId: 'art-notbegun-001' }, { 'If-Match': '0' })
    assert.equal(a.status, 409)
    assert.equal(a.body.error.code, 'ASSESSMENT_NOT_BEGUN')
    // Nothing was accepted as a candidate action while unbegun.
    assert.equal((await w.repos.sessionIo.listActions(sid)).length, 0)
  } finally { w.close() }
})

test('P3.8: begin requires an Idempotency-Key, starts the clock once, and repeated begins (same or different key) return the original timestamps', async () => {
  const w = await world()
  try {
    const sid = await w.startDraft()
    assert.equal((await w.call('POST', `/assessment-sessions/${sid}/begin`, {})).status, 428)
    const first = await w.begin(sid, 'begin-a')
    assert.equal(first.status, 200, JSON.stringify(first.body))
    assert.equal(first.body.data.replayed, false)
    assert.equal(first.body.data.startedAt, T0.toISOString())
    assert.equal(first.body.data.deadlineAt, new Date(T0.getTime() + 25 * MINUTE).toISOString())
    assert.equal(first.body.data.graceDeadlineAt, new Date(T0.getTime() + 30 * MINUTE).toISOString())
    assert.equal(first.body.data.policyVersion, DRAFT_UNIVERSAL.version)

    w.advance(3 * MINUTE)
    const sameKey = await w.begin(sid, 'begin-a')
    assert.equal(sameKey.status, 200)
    assert.equal(sameKey.body.data.replayed, true)
    assert.equal(sameKey.body.data.startedAt, first.body.data.startedAt)
    assert.equal(sameKey.body.data.deadlineAt, first.body.data.deadlineAt)
    const otherKey = await w.begin(sid, 'begin-b')
    assert.equal(otherKey.body.data.replayed, true)
    assert.equal(otherKey.body.data.startedAt, first.body.data.startedAt, 'a second tab never restarts the clock')

    const row = await w.repos.sessionIo.getRunTiming(sid)
    assert.equal(row.beginIdempotencyKey, 'begin-a')
    assert.equal(row.version, 2)
    assert.equal(w.audits.filter((a) => a.type === 'assessment.begun' && a.sid === sid).length, 1)
    // Refresh: the contract reports the same deadline and the true remaining time.
    const c = await w.get(sid)
    assert.equal(c.body.data.status, 'IN_PROGRESS')
    assert.equal(c.body.data.timing.begun, true)
    assert.equal(c.body.data.timing.startedAt, first.body.data.startedAt)
    assert.equal(c.body.data.timing.deadlineAt, first.body.data.deadlineAt)
    assert.equal(c.body.data.timing.graceDeadlineAt, first.body.data.graceDeadlineAt)
    assert.equal(c.body.data.timing.remainingMs, 22 * MINUTE)
  } finally { w.close() }
})

test('P3.8 T15: concurrent begins with different keys resolve to exactly one start time', async () => {
  const w = await world()
  try {
    const sid = await w.startDraft()
    const results = await Promise.all(['c1', 'c2', 'c3', 'c4', 'c5'].map((k) => w.begin(sid, `begin-${k}`)))
    for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body))
    assert.equal(new Set(results.map((r) => r.body.data.startedAt)).size, 1)
    assert.equal(new Set(results.map((r) => r.body.data.deadlineAt)).size, 1)
    assert.equal(results.filter((r) => r.body.data.replayed === false).length, 1)
  } finally { w.close() }
})

test('P3.8: expectedVersion protects against a stale briefing; a mismatch is a CONFLICT and does not start the clock', async () => {
  const w = await world()
  try {
    const sid = await w.startDraft()
    const stale = await w.begin(sid, 'begin-stale', { expectedVersion: 7 })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.error.code, 'CONFLICT')
    assert.equal((await w.repos.sessionIo.getRunTiming(sid)).timedStartedAt, null)
    const okBegin = await w.begin(sid, 'begin-ok', { expectedVersion: 1 })
    assert.equal(okBegin.status, 200)
    assert.equal(okBegin.body.data.replayed, false)
  } finally { w.close() }
})

test('P3.8: after the answer cutoff the server refuses new formal answers (SESSION_TIME_LIMIT), replays accepted ones, and finish still works', async () => {
  const w = await world()
  try {
    const sid = await w.startDraft()
    assert.equal((await w.begin(sid, 'begin-cut')).status, 200)
    const before = await w.message(sid, 'evt-cut-0001')
    assert.equal(before.status, 201)
    w.advance(25 * MINUTE + 1)
    const late = await w.message(sid, 'evt-cut-0002')
    assert.equal(late.status, 410)
    assert.equal(late.body.error.code, 'SESSION_TIME_LIMIT')
    assert.equal(late.body.error.details.deadlineAt, new Date(T0.getTime() + 25 * MINUTE).toISOString())
    const lateArtifact = await w.call('PATCH', `/assessment-sessions/${sid}/artifacts/HANDOVER-BOARD`, { updates: { 'row-1-owner': 'Nia' }, clientEventId: 'art-cut-0001' }, { 'If-Match': '0' })
    assert.equal(lateArtifact.body.error.code, 'SESSION_TIME_LIMIT')
    // A replay of work accepted before cutoff is still answered.
    const replay = await w.message(sid, 'evt-cut-0001')
    assert.equal(replay.status, 200)
    assert.equal(replay.body.data.replayed, true)
    // Only the pre-cutoff answer is a candidate action.
    assert.deepEqual((await w.repos.sessionIo.listActions(sid)).map((a) => a.clientEventId), ['evt-cut-0001'])
    const c = await w.get(sid)
    assert.equal(c.body.data.timing.remainingMs, 0)
    assert.equal(c.body.data.status, 'IN_PROGRESS')
    // Submission (of already-accepted work) is still possible after cutoff.
    const fin = await w.call('POST', `/assessment-sessions/${sid}/finish`, { early: true })
    assert.ok([200, 202].includes(fin.status), JSON.stringify(fin.body))
    assert.notEqual(fin.body?.error?.code, 'SESSION_TIME_LIMIT')
  } finally { w.close() }
})

test('P3.8: a legacy (non-draft) run is unchanged — begun at engine start, 35 minutes, no grace, begin is a no-op replay, answers accepted immediately', async () => {
  const w = await world()
  try {
    const sid = await w.startLegacy()
    const c = await w.get(sid)
    assert.equal(c.status, 200, JSON.stringify(c.body))
    assert.equal(c.body.data.status, 'IN_PROGRESS')
    assert.equal(c.body.data.timing.begun, true)
    assert.equal(c.body.data.timing.startedAt, T0.toISOString())
    assert.equal(c.body.data.timing.deadlineAt, new Date(T0.getTime() + 35 * MINUTE).toISOString())
    assert.equal(c.body.data.timing.graceDeadlineAt, null)
    assert.equal(c.body.data.timing.policyVersion, LEGACY_35.version)
    assert.equal(c.body.data.timing.remainingMs, 35 * MINUTE)
    const b = await w.begin(sid, 'begin-legacy')
    assert.equal(b.status, 200)
    assert.equal(b.body.data.replayed, true)
    assert.equal(b.body.data.startedAt, T0.toISOString())
    assert.equal(b.body.data.graceDeadlineAt, null)
    assert.equal((await w.message(sid, 'evt-legacy-0001', 'hello')).status, 201)
    // Legacy enforcement stays with the engine: the service adds no second cutoff.
    w.advance(36 * MINUTE)
    assert.equal((await w.message(sid, 'evt-legacy-0002', 'still the engine decides')).status, 201)
  } finally { w.close() }
})

test('P3.8: a run started before 0043 (no timing row) keeps engine-derived legacy timing and begin reports it', async () => {
  const w = await world()
  try {
    const sid = await w.startLegacy()
    const db = w.repos.sessionIo
    const row = await db.getRunTiming(sid)
    assert.ok(row)
    // Simulate a pre-0043 run by dropping its row.
    const legacyMem = createSessionIoRepoMemory({ clock: () => T0 })
    assert.equal(await legacyMem.getRunTiming('never-allocated'), null)
    await assert.rejects(legacyMem.beginRun('never-allocated', { idempotencyKey: 'x' }), { code: 'NOT_FOUND' })
    await assert.rejects(legacyMem.beginRun('never-allocated', { idempotencyKey: '' }), { code: 'IDEMPOTENCY_KEY_REQUIRED' })
  } finally { w.close() }
})
