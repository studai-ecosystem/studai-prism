// P6.6 / P6.7 / P6.8 — "Try that moment again", fresh uncoached challenges
// and the bounded practice allowance over the real /api/v1 router with memory
// repositories. A replay copies ONLY the presented stimulus text for the
// chosen moment (from the opportunity ledger when present, else the
// mission's own briefing) — never the learner's transcript — and the source
// session's formal units/report stay byte-for-byte unchanged. A fresh
// challenge picks a mission whose exposure tags the learner has not met and
// runs with hints off; an exhausted allowance answers 409 and never charges
// an idempotent repeat twice.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { FAMILY } from '../domain/assessments/universalForm.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_DEVELOPMENT_V2 = 'true'
process.env.PRISM_DRAFT_CONTENT = 'true'

const SESSION = 'sess-replay-1'
const OTHER_SESSION = 'sess-other-user'
const OPP = 'OPP-COMM-HANDOVER-AUDIENCE'
const OPP_NO_LEDGER = 'OPP-REASON-FACTS-ASSUMPTIONS'
const STIMULUS = 'Message from Ade: I only need to know whether the workshop goes ahead as planned or at reduced scope.'
const TRANSCRIPT = 'LEARNER-TRANSCRIPT-MUST-NEVER-APPEAR'
const USERS = {
  s1: { id: 'student-r1', email: 'r1@test.local', name: 'Asha Verma' },
  s2: { id: 'student-r2', email: 'r2@test.local', name: 'Student Two' },
}

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => new Date('2026-10-10T09:00:00Z') })
  const byId = new Map(Object.values(USERS).map((x) => [x.id, x]))
  const formalUnits = [
    { evidence_id: 'ev-1', session_id: SESSION, capability_id: FAMILY.COMMUNICATION, evidence_status: 'SUFFICIENT', rubric_level: 3, source_turn: 2, excerpt: TRANSCRIPT },
  ]
  const legacyState = {
    sessions: {
      [SESSION]: { sessionId: SESSION, userId: USERS.s1.id, scenarioId: 'syn-general-a', startedAt: Date.parse('2026-10-01T09:00:00Z'), completedAt: Date.parse('2026-10-01T10:00:00Z'), history: [{ role: 'candidate', content: TRANSCRIPT }] },
      [OTHER_SESSION]: { sessionId: OTHER_SESSION, userId: USERS.s2.id, scenarioId: 'syn-general-a', startedAt: Date.parse('2026-10-01T09:00:00Z'), completedAt: Date.parse('2026-10-01T10:00:00Z'), history: [] },
    },
    reports: { [SESSION]: { sessionId: SESSION, userId: USERS.s1.id, issuedAt: '2026-10-01T11:00:00.000Z', reportHash: 'sha256:formal-report-v1', version: 1 } },
  }
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listSessionIds: async (userId) => Object.values(legacyState.sessions).filter((s) => s.userId === userId).map((s) => s.sessionId),
    getSession: async (id) => (legacyState.sessions[id] ? structuredClone(legacyState.sessions[id]) : null),
    getReport: async (id) => (legacyState.reports[id] ? structuredClone(legacyState.reports[id]) : null),
    adminState: async () => null,
  }
  // Opportunity ledger row for the source moment: what the learner was SHOWN
  // (stimulus) plus the ids of their actions (never the text).
  await repos.sessionIo.upsertOpportunity({ sessionId: SESSION, opportunityId: OPP, capabilityId: FAMILY.COMMUNICATION, behaviourIds: ['ADAPT_TO_AUDIENCE', 'STATE_MAIN_POINT'] })
  await repos.sessionIo.setOpportunityState(SESSION, OPP, 'PRESENTED', { presentedAt: '2026-10-01T09:30:00Z', renderHash: 'rh-1', stimulus: { messages: [{ speaker: 'Ade', role: 'Programme contact', actorKind: 'AI_PARTICIPANT', content: STIMULUS }], worldChangeId: null, decision: null } })
  await repos.sessionIo.setOpportunityState(SESSION, OPP, 'ACTION_RECEIVED', { actionId: 'act-1' })
  const audits = []
  const campus = createCampusContext({
    repos, clock: () => new Date('2026-10-10T09:00:00Z'), legacy,
    users: { findById: async (id) => byId.get(id) || null, findByEmail: async (e) => [...byId.values()].find((x) => x.email === e) || null },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
    evidence: { units: async (sessionId) => (sessionId === SESSION ? structuredClone(formalUnits) : []) },
    scenarioSource: async () => ({ generalScenarios: [{ id: 'syn-general-a' }], bankScenarios: {} }),
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
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }
  }
  const formalSnapshot = () => JSON.stringify({ units: formalUnits, report: legacyState.reports[SESSION], session: legacyState.sessions[SESSION], ledger: repos.sessionIo.listOpportunities(SESSION) })
  const ledgerSnapshot = async () => JSON.stringify(await repos.sessionIo.listOpportunities(SESSION))
  return { repos, campus, audits, call, formalSnapshot, ledgerSnapshot, close: () => server.close() }
}
const key = (k) => ({ 'Idempotency-Key': k })

test('P6.6: replay creates a separate PRACTICE attempt that copies only the presented stimulus; owner-scoped; formal report and ledger unchanged', async () => {
  const w = await world()
  const before = w.formalSnapshot()
  const ledgerBefore = await w.ledgerSnapshot()
  try {
    assert.equal((await w.call('s1', 'POST', '/development/replay', { sessionId: SESSION, opportunityId: OPP })).status, 428, 'Idempotency-Key required')
    assert.equal((await w.call('s1', 'POST', '/development/replay', { sessionId: SESSION }, key('r-bad'))).status, 422)
    assert.equal((await w.call('s2', 'POST', '/development/replay', { sessionId: SESSION, opportunityId: OPP }, key('r-s2'))).status, 404, 'another user cannot replay this session')
    assert.equal((await w.call('s1', 'POST', '/development/replay', { sessionId: OTHER_SESSION, opportunityId: OPP }, key('r-other'))).status, 404)
    assert.equal((await w.call('s1', 'POST', '/development/replay', { sessionId: 'sess-nope', opportunityId: OPP }, key('r-nope'))).status, 404)

    const r = await w.call('s1', 'POST', '/development/replay', { sessionId: SESSION, opportunityId: OPP }, key('r-1'))
    assert.equal(r.status, 201, JSON.stringify(r.body))
    const { attempt, missionId } = r.body.data
    assert.equal(missionId, 'MIS-CORE-HANDOVER-01', 'the mission whose exposure tags name this moment')
    assert.equal(attempt.missionVersion, 3, 'the latest version (P6.8 honest-checks revision)')
    assert.equal(attempt.evidenceType, 'PRACTICE')
    assert.deepEqual(attempt.origin, { kind: 'ASSESSMENT_MOMENT', sessionId: SESSION, opportunityId: OPP })
    assert.deepEqual(attempt.assistance, { mode: 'GUIDED', hintsUsed: 0, scaffoldRequested: false })
    assert.equal(attempt.stimulus.source, 'ASSESSMENT_MOMENT')
    assert.equal(attempt.stimulus.text, `Ade: ${STIMULUS}`)
    assert.equal(attempt.stimulus.presentedAt, '2026-10-01T09:30:00.000Z')
    const text = JSON.stringify(r.body)
    assert.ok(!text.includes(TRANSCRIPT), 'no transcript or evidence excerpt travels with a replay')
    assert.ok(!/rubric_level|reportHash|act-1|renderHash/.test(text))
    // Idempotent: the same key returns the same attempt and no second row.
    const again = await w.call('s1', 'POST', '/development/replay', { sessionId: SESSION, opportunityId: OPP }, key('r-1'))
    assert.equal(again.status, 200)
    assert.equal(again.body.data.attempt.id, attempt.id)
    // It is a normal practice attempt: hints work, it is owner-only, and it can be submitted.
    assert.equal((await w.call('s1', 'POST', `/mission-attempts/${attempt.id}/hints`, undefined, { 'If-Match': '"1"' })).status, 200)
    assert.equal((await w.call('s2', 'GET', `/mission-attempts/${attempt.id}`)).status, 404)
    const hist = await w.call('s1', 'GET', '/me/history')
    const practice = hist.body.data.items.filter((i) => i.sourceType !== 'FORMAL_SESSION')
    assert.ok(practice.length >= 1)

    // No ledger row → the mission's own briefing is the teaching situation.
    const r2 = await w.call('s1', 'POST', '/development/replay', { sessionId: SESSION, opportunityId: OPP_NO_LEDGER }, key('r-2'))
    assert.equal(r2.status, 201, JSON.stringify(r2.body))
    assert.equal(r2.body.data.missionId, 'MIS-CORE-MISSING-FACT-01')
    assert.equal(r2.body.data.attempt.stimulus.source, 'MISSION_BRIEFING')
    assert.ok(r2.body.data.attempt.stimulus.text.includes('Room 2'))

    assert.equal(w.formalSnapshot(), before, 'formal units, report and session are byte-for-byte unchanged')
    assert.equal(await w.ledgerSnapshot(), ledgerBefore, 'the opportunity ledger is read, never written')
    assert.ok(w.audits.some((a) => a.type === 'development.replay.started' && a.payload.stimulusSource === 'ASSESSMENT_MOMENT' && a.payload.evidenceType === 'PRACTICE'))
    assert.ok(w.audits.every((a) => !JSON.stringify(a).includes(TRANSCRIPT)))
  } finally { w.close() }
})

test('P6.7: a fresh challenge picks the unfamiliar-transfer version of a practised mission first (same behaviours, different setting), then an unexposed mission; runs uncoached (hints and examples refused) and records exposure', async () => {
  const w = await world()
  try {
    assert.equal((await w.call('s1', 'POST', '/development/challenge', { capabilityId: 'CAP-NOPE' }, key('c-bad'))).status, 422)
    // Practising M01 (exposure OPP-REASON-FACTS-ASSUMPTIONS) makes M01's transfer version the fresh setting for the same behaviours.
    const guided = await w.call('s1', 'POST', '/missions/MIS-CORE-MISSING-FACT-01/attempts', {}, key('g-1'))
    assert.equal(guided.status, 201)
    assert.equal(guided.body.data.assistance.mode, 'GUIDED')
    assert.equal(guided.body.data.variant, 'BASE')
    const c = await w.call('s1', 'POST', '/development/challenge', { capabilityId: FAMILY.REASONING }, key('c-1'))
    assert.equal(c.status, 201, JSON.stringify(c.body))
    assert.equal(c.body.data.missionId, 'MIS-CORE-MISSING-FACT-01')
    const a = c.body.data.attempt
    assert.equal(a.variant, 'TRANSFER')
    assert.notEqual(a.scene.setting, guided.body.data.scene.setting, 'a different setting, not the same story')
    assert.ok(!/Room 2|Dev/.test(a.scene.setting), 'the transfer scene does not reuse the base scene\'s facts')
    assert.deepEqual(a.assistance, { mode: 'UNCOACHED', hintsUsed: 0, scaffoldRequested: false })
    assert.deepEqual(a.hints, [])
    assert.equal(a.hintsRemaining, 0)
    assert.deepEqual(a.examples, [])
    assert.equal(a.examplesAvailable, 0, 'examples are not offered in an uncoached challenge')
    assert.equal(a.stimulus, null)
    const hint = await w.call('s1', 'POST', `/mission-attempts/${a.id}/hints`, undefined, { 'If-Match': '"1"' })
    assert.equal(hint.status, 409, 'hints are off for the whole challenge attempt')
    assert.equal((await w.call('s1', 'POST', `/mission-attempts/${a.id}/examples`)).status, 409, 'examples are off too')
    assert.equal((await w.call('s1', 'GET', `/mission-attempts/${a.id}`)).body.data.assistance.mode, 'UNCOACHED')
    const started = w.audits.find((x) => x.type === 'development.challenge.started')
    assert.equal(started.payload.variant, 'TRANSFER')
    assert.ok(started.payload.exposureTags.length === 0 || started.payload.exposureTags.every((t) => t !== 'OPP-REASON-FACTS-ASSUMPTIONS'), 'the chosen setting carries no exposed tag')
    // Same key → same attempt. New keys → the other Reasoning mission (base, then transfer), then nothing unexposed is left.
    assert.equal((await w.call('s1', 'POST', '/development/challenge', { capabilityId: FAMILY.REASONING }, key('c-1'))).body.data.attempt.id, a.id)
    const second = await w.call('s1', 'POST', '/development/challenge', { capabilityId: FAMILY.REASONING }, key('c-2'))
    assert.equal(second.status, 201)
    assert.equal(second.body.data.missionId, 'MIS-CORE-CHECK-RECOMMENDATION-01')
    assert.equal(second.body.data.attempt.variant, 'BASE')
    const third = await w.call('s1', 'POST', '/development/challenge', { capabilityId: FAMILY.REASONING }, key('c-2b'))
    assert.equal(third.status, 201)
    assert.equal(third.body.data.missionId, 'MIS-CORE-CHECK-RECOMMENDATION-01')
    assert.equal(third.body.data.attempt.variant, 'TRANSFER')
    const none = await w.call('s1', 'POST', '/development/challenge', { capabilityId: FAMILY.REASONING }, key('c-2c'))
    assert.equal(none.status, 409)
    assert.equal(none.body.error.code, 'NO_FRESH_CHALLENGE')
    // A replayed moment counts as exposure too: replaying the handover moment (M04 base) → the fresh Communication setting is M04's transfer version.
    await w.call('s1', 'POST', '/development/replay', { sessionId: SESSION, opportunityId: OPP }, key('r-x'))
    const comm = await w.call('s1', 'POST', '/development/challenge', { capabilityId: FAMILY.COMMUNICATION }, key('c-3'))
    assert.equal(comm.status, 201)
    assert.equal(comm.body.data.missionId, 'MIS-CORE-HANDOVER-01')
    assert.equal(comm.body.data.attempt.variant, 'TRANSFER')
    assert.ok(/comms pack/i.test(comm.body.data.attempt.scene.setting))
    assert.equal(comm.body.data.attempt.work.BOARD.rows[0].task, 'Venue contract', 'the transfer version starts from its own artifact state')
    // Submitting an uncoached attempt is ordinary practice: PRACTICE evidence only, no formal write.
    const sub = await w.call('s1', 'POST', `/mission-attempts/${a.id}/submit`)
    assert.equal(sub.status, 201)
    assert.equal(sub.body.data.evidenceType, 'PRACTICE')
    const ev = w.audits.find((x) => x.type === 'development.mission.evaluated' && x.payload.attemptId === a.id)
    assert.equal(ev.payload.assistance.mode, 'UNCOACHED')
    assert.equal(ev.payload.variant, 'TRANSFER')
    const history = await w.campus.development.listAttemptHistory(USERS.s1, { id: 'personal', type: 'PERSONAL' })
    assert.ok(history.some((h) => h.id === a.id && h.assistance.mode === 'UNCOACHED' && h.variant === 'TRANSFER'))
  } finally { w.close() }
})

test('P6.8: a bounded allowance is shown exactly, stops new attempts at 409 when used up, never charges an idempotent repeat twice, and keeps finished work readable', async () => {
  const w = await world()
  try {
    assert.deepEqual((await w.call('s1', 'GET', '/missions')).body.data.allowance, { kind: 'UNLIMITED' }, 'no row = unlimited (no pricing here)')
    await w.repos.development.setPracticeAllowance({ userId: USERS.s1.id, total: 2, source: 'TEST_FIXTURE' })
    assert.deepEqual((await w.call('s1', 'GET', '/missions')).body.data.allowance, { kind: 'BOUNDED', total: 2, used: 0, remaining: 2, validUntil: null })
    const a1 = await w.call('s1', 'POST', '/missions/MIS-CORE-MISSING-FACT-01/attempts', {}, key('a-1'))
    assert.equal(a1.status, 201)
    assert.equal((await w.call('s1', 'POST', '/missions/MIS-CORE-MISSING-FACT-01/attempts', {}, key('a-1'))).status, 200, 'same key replays')
    assert.equal((await w.call('s1', 'POST', '/missions/MIS-CORE-MISSING-FACT-01/attempts', {}, key('a-1b'))).body.data.id, a1.body.data.id, 'resuming the open attempt costs nothing')
    assert.equal((await w.call('s1', 'GET', '/missions')).body.data.allowance.remaining, 1)
    const a2 = await w.call('s1', 'POST', '/development/challenge', { capabilityId: FAMILY.EXECUTION }, key('a-2'))
    assert.equal(a2.status, 201)
    const list = await w.call('s1', 'GET', '/missions')
    assert.deepEqual(list.body.data.allowance, { kind: 'BOUNDED', total: 2, used: 2, remaining: 0, validUntil: null })
    const blocked = await w.call('s1', 'POST', '/missions/MIS-CORE-MISSING-FACT-01/attempts', { retry: true }, key('a-3'))
    assert.equal(blocked.status, 409)
    assert.equal(blocked.body.error.code, 'ALLOWANCE_EXHAUSTED')
    assert.equal((await w.call('s1', 'POST', '/development/replay', { sessionId: SESSION, opportunityId: OPP }, key('a-4'))).status, 409)
    assert.equal((await w.call('s1', 'POST', '/development/challenge', { capabilityId: FAMILY.ADAPTABILITY }, key('a-5'))).status, 409)
    // Work already started stays usable and readable after the allowance is spent.
    assert.equal((await w.call('s1', 'POST', `/mission-attempts/${a1.body.data.id}/submit`)).status, 201)
    assert.equal((await w.call('s1', 'GET', `/mission-attempts/${a1.body.data.id}`)).status, 200)
    assert.equal((await w.call('s1', 'GET', `/mission-attempts/${a2.body.data.attempt.id}`)).status, 200)
    // Another user is unaffected (allowance is per user and workspace).
    assert.deepEqual((await w.call('s2', 'GET', '/missions')).body.data.allowance, { kind: 'UNLIMITED' })
    // An expired row also blocks.
    await w.repos.development.setPracticeAllowance({ userId: USERS.s2.id, total: 5, validUntil: '2026-01-01T00:00:00.000Z', source: 'TEST_FIXTURE' })
    assert.equal((await w.call('s2', 'POST', '/missions/MIS-CORE-MISSING-FACT-01/attempts', {}, key('b-1'))).status, 409)
  } finally { w.close() }
})
