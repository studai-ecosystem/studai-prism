// P2.8 — one real, separate practice attempt over the real /api/v1 router
// with memory repositories. The DRAFT handover mission is reachable only
// behind PRISM_DRAFT_CONTENT; an attempt records WHY it was started (the
// learner's goal or one approved assessment moment, by id only); criterion
// feedback, a scaffold (hint) and a retry (always a NEW attempt) work; only
// PRACTICE evidence is written and the formal evidence/report for the source
// session is byte-for-byte unchanged; history links the two records while
// keeping them separately typed.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { MISSION_LIBRARY } from '../domain/development/missionLibrary.js'
import { parseMission } from '../domain/development/missionSchema.js'
import { createDevelopmentService, normaliseOrigin } from '../domain/development/service.js'
import { initialWork, runDeterministicChecks } from '../domain/development/validators.js'
import { createMissionEvaluator } from '../domain/development/evaluator.js'
import { createCompletionService } from '../services/ai/completionService.js'
import { auditConverse } from '../services/ai/auditConverse.js'

process.env.NODE_ENV = 'test'
process.env.PRISM_AUDIT_AI = 'true'
process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'
process.env.PRISM_DEVELOPMENT_V2 = 'true'
process.env.PRISM_DRAFT_CONTENT = 'true'

const MID = 'MIS-CORE-HANDOVER-01'
const HANDOVER = parseMission(MISSION_LIBRARY.find((m) => m.mission_id === MID))
const SESSION = 'sess-source-1'
const ORIGIN = { kind: 'ASSESSMENT_MOMENT', sessionId: SESSION, opportunityId: 'opp-handover-3' }
const USERS = {
  s1: { id: 'student-h1', email: 'h1@test.local', name: 'Asha Verma' },
  s2: { id: 'student-h2', email: 'h2@test.local', name: 'Student Two' },
}

// A complete handover: both tasks named, owners settled, a first step, a day + time.
const GOOD_WORK = {
  BOARD: { rows: [{ id: 'quotes', owner: 'Sam' }, { id: 'checklist', owner: 'Ask Priya to decide by Wednesday' }] },
  MESSAGE: { text: 'Sam, two tasks have no owner yet: the vendor quotes (due Thursday) and the launch checklist (due Friday). Please call the venue to confirm the quote first.' },
  PLAN: { fields: { first_step: 'Call the venue to confirm the quote before anything else.', checkpoint: 'Thursday 10:30 am' } },
}
const PARTIAL_WORK = {
  BOARD: { rows: [{ id: 'quotes', owner: 'Sam' }, { id: 'checklist', owner: null }] },
  MESSAGE: { text: 'Sam, please look after the supplier pricing while I am away.' },
  PLAN: { fields: { first_step: 'Read the plan.', checkpoint: 'soon' } },
}

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => new Date('2026-10-10T09:00:00Z') })
  const byId = new Map(Object.values(USERS).map((x) => [x.id, x]))
  // Formal evidence + report for the source session, frozen as the baseline.
  const formalUnits = [
    { evidence_id: 'ev-1', session_id: SESSION, capability_id: 'CAP-L1-COMMUNICATION', evidence_status: 'SUFFICIENT', rubric_level: 3, source_turn: 2 },
    { evidence_id: 'ev-2', session_id: SESSION, capability_id: 'CAP-L1-COMMUNICATION', evidence_status: 'INSUFFICIENT_EVIDENCE', rubric_level: null, source_turn: 4 },
  ]
  const legacyState = {
    sessions: { [SESSION]: { sessionId: SESSION, userId: USERS.s1.id, scenarioId: 'syn-general-a', startedAt: Date.parse('2026-10-01T09:00:00Z'), completedAt: Date.parse('2026-10-01T10:00:00Z'), history: [] } },
    reports: { [SESSION]: { sessionId: SESSION, userId: USERS.s1.id, issuedAt: '2026-10-01T11:00:00.000Z', reportHash: 'sha256:formal-report-v1', version: 1 } },
  }
  const legacy = {
    ...EMPTY_LEGACY_SOURCES,
    listSessionIds: async (userId) => Object.values(legacyState.sessions).filter((s) => s.userId === userId).map((s) => s.sessionId),
    getSession: async (id) => (legacyState.sessions[id] ? structuredClone(legacyState.sessions[id]) : null),
    getReport: async (id) => (legacyState.reports[id] ? structuredClone(legacyState.reports[id]) : null),
    adminState: async () => null,
  }
  const audits = []
  const campus = createCampusContext({
    repos, clock: () => new Date('2026-10-10T09:00:00Z'), legacy,
    users: { findById: async (id) => byId.get(id) || null, findByEmail: async (e) => [...byId.values()].find((x) => x.email === e) || null },
    audit: (type, sid, payload) => audits.push({ type, sid, payload }),
    evidence: { units: async (sessionId) => (sessionId === SESSION ? structuredClone(formalUnits) : []) },
    scenarioSource: async () => ({ generalScenarios: [{ id: 'syn-general-a' }], bankScenarios: {} }),
    // P6.8: the latest handover version checks "names both tasks" and "first
    // step" by meaning, so the deterministic harness evaluator is wired in.
    missionEvaluator: createMissionEvaluator({ complete: createCompletionService({ converseFn: auditConverse }) }),
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
  const formalSnapshot = () => JSON.stringify({ units: formalUnits, report: legacyState.reports[SESSION], session: legacyState.sessions[SESSION] })
  return { repos, campus, audits, call, formalUnits, formalSnapshot, close: () => server.close() }
}

test('P2.8: the DRAFT handover mission is governed, hides rule internals, and its starting state demonstrates nothing', async () => {
  assert.equal(HANDOVER.status, 'DRAFT')
  assert.equal(HANDOVER.scaffolding_policy.hints.length, 3)
  assert.deepEqual(HANDOVER.rubric.criteria.map((c) => c.criterion_id), ['C-NAMES-TASKS', 'C-OWNERSHIP', 'C-FIRST-STEP', 'C-CHECKPOINT'])
  const start = runDeterministicChecks(HANDOVER, initialWork(HANDOVER))
  assert.ok([...start.values()].every((r) => !r.observed), 'an untouched board/message/plan passes no rule')
  // Deterministic rules demonstrate: owner changed from null, both task names in the message.
  const good = runDeterministicChecks(HANDOVER, GOOD_WORK)
  assert.deepEqual([...good.entries()].map(([k, v]) => [k, v.observed]), [['C-NAMES-TASKS', true], ['C-OWNERSHIP', true], ['C-FIRST-STEP', true], ['C-CHECKPOINT', true]])
  const partial = runDeterministicChecks(HANDOVER, PARTIAL_WORK)
  assert.deepEqual([...partial.entries()].map(([k, v]) => [k, v.observed]), [['C-NAMES-TASKS', false], ['C-OWNERSHIP', false], ['C-FIRST-STEP', true], ['C-CHECKPOINT', false]])

  const w = await world()
  try {
    const one = await w.call('s1', 'GET', `/missions/${MID}`)
    assert.equal(one.status, 200)
    assert.equal(one.body.data.mission.status, 'DRAFT')
    assert.equal(one.body.data.mission.evidenceType, 'PRACTICE')
    assert.equal(one.body.data.mission.hintCount, 3)
    const text = JSON.stringify(one.body.data)
    for (const k of ['"params"', '"pattern"', 'evaluator_guidance', 'min_criteria_observed', 'rule_id']) assert.ok(!text.includes(k), `player view leaks ${k}`)
    assert.ok(!/level\s*\d|score|percent|%/i.test(text))
  } finally { w.close() }
})

test('P2.8: DRAFT content is dark by default and never recommended; the institution catalogue never lists it', async () => {
  const w = await world()
  try {
    process.env.PRISM_DRAFT_CONTENT = 'false'
    assert.equal((await w.call('s1', 'GET', `/missions/${MID}`)).status, 404, 'dark unless PRISM_DRAFT_CONTENT=true')
    assert.ok(!(await w.call('s1', 'GET', '/missions')).body.data.items.some((m) => m.id === MID))
    process.env.PRISM_DRAFT_CONTENT = 'true'
    assert.ok((await w.call('s1', 'GET', '/missions')).body.data.items.some((m) => m.id === MID && m.status === 'DRAFT'))
    const catalogue = await w.campus.development.catalogue()
    assert.ok(!catalogue.some((m) => m.id === MID), 'intervention builder sees published missions only')
    const personal = { id: 'personal', type: 'PERSONAL', organizationId: null }
    const plan = await w.campus.development.planFor(USERS.s1, personal, [{ capabilityId: 'CAP-L1-COMMUNICATION', basedOn: { sessionId: SESSION } }])
    assert.ok(!plan.recommended.some((m) => m.id === MID), 'a DRAFT mission is never recommended even when it matches the priority')
    assert.ok(plan.catalogue.some((m) => m.id === MID), 'but it stays openable locally')
  } finally { process.env.PRISM_DRAFT_CONTENT = 'true'; w.close() }
})

test('P2.8: start with an origin, submit, criterion feedback, scaffold, retry as a NEW attempt; practice evidence only; formal untouched', async () => {
  const w = await world()
  const before = w.formalSnapshot()
  const historyBefore = await w.call('s1', 'GET', '/me/history')
  const formalBefore = historyBefore.body.data.items.find((i) => i.sourceType === 'FORMAL_SESSION' && i.sourceId === SESSION)
  assert.ok(formalBefore, 'the source session is in history before practice')
  try {
    // Origin validation: shape only, identifiers only.
    assert.equal((await w.call('s1', 'POST', `/missions/${MID}/attempts`, { origin: { kind: 'ASSESSMENT_MOMENT', sessionId: SESSION } }, { 'Idempotency-Key': 'bad-1' })).status, 422)
    assert.equal((await w.call('s1', 'POST', `/missions/${MID}/attempts`, { origin: { kind: 'ASSESSMENT_MOMENT', ...ORIGIN, transcript: 'leak' } }, { 'Idempotency-Key': 'bad-2' })).status, 422, 'no raw assessment data rides along')
    assert.throws(() => normaliseOrigin({ kind: 'OTHER' }), (e) => e.code === 'VALIDATION_FAILED')
    assert.deepEqual(normaliseOrigin(null), { kind: 'GOAL' })

    const a = await w.call('s1', 'POST', `/missions/${MID}/attempts`, { origin: ORIGIN }, { 'Idempotency-Key': 'start-1' })
    assert.equal(a.status, 201)
    const id = a.body.data.id
    assert.deepEqual(a.body.data.origin, ORIGIN)
    assert.equal(a.body.data.evidenceType, 'PRACTICE')
    assert.equal(a.body.data.work.BOARD.rows[0].owner, null)
    assert.equal((await w.call('s2', 'GET', `/mission-attempts/${id}`)).status, 404, 'owner only')
    assert.equal((await w.call('s1', 'POST', `/missions/${MID}/attempts`, {}, { 'Idempotency-Key': 'start-2' })).body.data.id, id, 'open attempt resumes')

    // Scaffold on request: hints are revealed one at a time and recorded.
    const hint = await w.call('s1', 'POST', `/mission-attempts/${id}/hints`, undefined, { 'If-Match': '"1"' })
    assert.equal(hint.status, 200)
    assert.deepEqual(hint.body.data.hints, [HANDOVER.scaffolding_policy.hints[0]])
    assert.equal(hint.body.data.hintsRemaining, 2)

    // A partial handover: criterion-level feedback says exactly what was and was not shown.
    const saved = await w.call('s1', 'PATCH', `/mission-attempts/${id}`, { work: PARTIAL_WORK }, { 'If-Match': '"2"' })
    assert.equal(saved.status, 200)
    const sub = await w.call('s1', 'POST', `/mission-attempts/${id}/submit`)
    assert.equal(sub.status, 201)
    const r = sub.body.data.result
    assert.equal(sub.body.data.origin.kind, 'ASSESSMENT_MOMENT')
    assert.ok(['EVALUATED', 'EVALUATION_UNAVAILABLE'].includes(r.status))
    const byCriterion = Object.fromEntries(r.criteria.map((c) => [c.criterionId, c]))
    assert.equal(byCriterion['C-NAMES-TASKS'].result, 'NOT_OBSERVED')
    assert.equal(byCriterion['C-NAMES-TASKS'].reason, 'MEANING_NOT_EXPRESSED', 'naming the tasks is a meaning check, not a required phrase (P6.8)')
    assert.deepEqual(byCriterion['C-NAMES-TASKS'].checks, [])
    assert.equal(byCriterion['C-OWNERSHIP'].result, 'NOT_OBSERVED')
    assert.equal(byCriterion['C-CHECKPOINT'].result, 'NOT_OBSERVED')
    assert.notEqual(byCriterion['C-FIRST-STEP'].result, 'OBSERVED', '"Read the plan" is not a concrete first step')
    assert.ok(r.criteria.every((c) => c.quote === null || c.result === 'OBSERVED'))
    assert.ok(!/level\s*\d|score|%/i.test(JSON.stringify(r)))
    const unitsAfterPartial = await w.repos.development.listPracticeUnits({ userId: USERS.s1.id })
    assert.equal(unitsAfterPartial.length, 0, 'nothing observed → no practice evidence written')
    assert.equal((await w.call('s1', 'PATCH', `/mission-attempts/${id}`, { work: GOOD_WORK }, { 'If-Match': '"4"' })).status, 409, 'a submitted attempt is never mutated')

    // Retry → a NEW attempt (previous one untouched), same origin carried by the client.
    const retry = await w.call('s1', 'POST', `/missions/${MID}/attempts`, { retry: true, origin: ORIGIN }, { 'Idempotency-Key': 'retry-1' })
    assert.equal(retry.status, 201)
    const id2 = retry.body.data.id
    assert.notEqual(id2, id)
    assert.equal(retry.body.data.status, 'IN_PROGRESS')
    assert.deepEqual(retry.body.data.hints, [])
    const first = await w.call('s1', 'GET', `/mission-attempts/${id}`)
    assert.equal(first.body.data.status, sub.body.data.status)
    assert.deepEqual(first.body.data.result, r, 'the earlier attempt keeps its result')

    await w.call('s1', 'PATCH', `/mission-attempts/${id2}`, { work: GOOD_WORK }, { 'If-Match': '"1"' })
    const sub2 = await w.call('s1', 'POST', `/mission-attempts/${id2}/submit`)
    assert.equal(sub2.status, 201)
    const by2 = Object.fromEntries(sub2.body.data.result.criteria.map((c) => [c.criterionId, c]))
    assert.equal(by2['C-NAMES-TASKS'].result, 'OBSERVED')
    assert.equal(by2['C-OWNERSHIP'].result, 'OBSERVED')
    assert.equal(by2['C-CHECKPOINT'].result, 'OBSERVED')

    // Practice evidence only, kept in the practice ledger.
    const units = await w.repos.development.listPracticeUnits({ userId: USERS.s1.id })
    assert.ok(units.length >= 3)
    assert.ok(units.every((u) => u.sourceType === 'MISSION_PRACTICE' && u.missionId === MID && u.attemptId === id2))
    assert.ok(w.audits.every((e) => e.type !== 'development.mission.evaluated' || e.payload.evidenceType === 'PRACTICE'))

    // Formal evidence and report for the source session: byte-for-byte unchanged.
    assert.equal(w.formalSnapshot(), before)
    assert.deepEqual(w.formalUnits, JSON.parse(before).units)
    const historyAfter = await w.call('s1', 'GET', '/me/history')
    const formalAfter = historyAfter.body.data.items.find((i) => i.sourceType === 'FORMAL_SESSION' && i.sourceId === SESSION)
    assert.deepEqual(formalAfter, formalBefore, 'the formal history record did not change')
    const practice = historyAfter.body.data.items.filter((i) => i.sourceType === 'PRACTICE_ATTEMPT')
    assert.equal(practice.length, 2)
    assert.ok(practice.every((p) => p.mode === 'PRACTICE' && p.linkedSessionId === SESSION && p.reportFormat === null))
    assert.equal(formalAfter.mode, 'FORMAL')
    assert.ok(!('linkedSessionId' in formalAfter) || formalAfter.linkedSessionId == null)
  } finally { w.close() }
})

test('P2.8: a goal-origin attempt and the memory/pg attempt shape carry origin additively', async () => {
  const repos = createMemoryCampusRepos({ clock: () => new Date('2026-10-10T09:00:00Z') })
  const svc = createDevelopmentService({ repos })
  const personal = { id: 'personal', type: 'PERSONAL', organizationId: null }
  const started = await svc.startAttempt(USERS.s1, personal, MID, { idempotencyKey: 'g-1' })
  assert.deepEqual(started.attempt.origin, { kind: 'GOAL' })
  const row = await repos.development.getAttempt(started.attempt.id)
  assert.deepEqual(row.origin, { kind: 'GOAL' })
  const history = await svc.listAttemptHistory(USERS.s1, personal)
  assert.deepEqual(history.map((h) => h.origin), [{ kind: 'GOAL' }])
})
