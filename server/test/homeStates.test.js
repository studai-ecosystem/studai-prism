// P3.3 Home states (Layer A, stubbed sources): PRACTICE_AVAILABLE and
// PREPARATION_IN_PROGRESS come from the real development plan / preparation
// list contracts; they never outrank saved formal work, never appear in a
// Campus workspace for preparation, never offer DRAFT missions, and a
// technical failure is never turned into a purchase.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createStudentReadModels } from '../domain/student/readModels.js'
import { EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'

const NOW = new Date('2026-10-01T10:00:00Z')
const USER = { id: 'syn-learner', name: 'Synthetic Learner' }
const PERSONAL = { id: 'personal', type: 'PERSONAL', name: 'Personal' }
const CAMPUS = { id: 'ws-c', type: 'CAMPUS_STUDENT', name: 'Synthetic University', organizationId: 'org-1', organizationName: 'Synthetic University' }

const mission = (over = {}) => ({ id: 'MIS-SYN-01', status: 'PUBLISHED', title: 'Synthetic mission', targetCapabilityName: 'Communication', estimatedMinutes: 12, modes: ['GUIDED'], ...over })

function models({ sessions = [], active = [], completed = [], recommended = [mission()], prep = [], prepOn = true, devOn = true, prepFails = false } = {}) {
  const calls = { planFor: 0, prepList: 0 }
  const m = createStudentReadModels({
    directory: { listSessions: async () => sessions },
    catalog: { getCatalog: async () => ({ definitions: [], forms: [] }) },
    assignments: { listForWorkspace: async () => ({ active, completed }) },
    evidence: { units: async () => [] },
    development: { enabled: () => devOn, planFor: async () => { calls.planFor += 1; return { recommended, allowance: { kind: 'BOUNDED', total: 5, used: 1, remaining: 4, validUntil: null } } } },
    preparation: { enabled: () => prepOn, list: async () => { calls.prepList += 1; if (prepFails) throw new Error('store down'); return { items: prep } } },
    legacy: { paths: EMPTY_LEGACY_SOURCES.paths },
    clock: () => NOW,
  })
  return { m, calls }
}

test('P3.3 PRACTICE_AVAILABLE: one reviewed mission with duration, mode and allowance from the development plan', async () => {
  const { m } = models({ recommended: [mission({ id: 'MIS-DRAFT', status: 'DRAFT', title: 'Draft only' }), mission()] })
  const home = await m.home(USER, PERSONAL)
  assert.equal(home.primaryAction.kind, 'PRACTICE_AVAILABLE')
  assert.equal(home.primaryAction.missionId, 'MIS-SYN-01', 'DRAFT missions are never offered')
  assert.equal(home.primaryAction.estimatedMinutes, 12)
  assert.equal(home.primaryAction.mode, 'GUIDED')
  assert.deepEqual(home.primaryAction.allowance, { kind: 'BOUNDED', total: 5, used: 1, remaining: 4, validUntil: null })
  assert.equal(home.primaryAction.to, '/app/development/missions/MIS-SYN-01')
  const campus = await m.home(USER, CAMPUS)
  assert.equal(campus.primaryAction.to, '/app/campus/org-1/development/missions/MIS-SYN-01')
})

test('P3.3 PRACTICE_AVAILABLE is absent without a reviewed mission or with Development off', async () => {
  assert.equal((await models({ recommended: [mission({ status: 'DRAFT' })] }).m.home(USER, PERSONAL)).primaryAction.kind, 'GET_STARTED')
  const off = models({ devOn: false })
  assert.equal((await off.m.home(USER, PERSONAL)).primaryAction.kind, 'GET_STARTED')
  assert.equal(off.calls.planFor, 0)
})

test('P3.3 PREPARATION_IN_PROGRESS: own DRAFT/REHEARSING attempt, PERSONAL only, flag-gated, private link', async () => {
  const prep = [
    { id: 'prep-done', state: 'COMPLETED', situationLabel: 'Interview', createdAt: '2026-09-01T10:00:00.000Z' },
    { id: 'prep-open', state: 'REHEARSING', situationLabel: 'Interview', createdAt: '2026-09-30T10:00:00.000Z' },
  ]
  const { m } = models({ prep })
  const home = await m.home(USER, PERSONAL)
  assert.equal(home.primaryAction.kind, 'PREPARATION_IN_PROGRESS')
  assert.equal(home.primaryAction.to, '/app/prepare/prep-open')
  assert.equal(home.primaryAction.scope, 'PERSONAL')
  const campus = models({ prep })
  assert.notEqual((await campus.m.home(USER, CAMPUS)).primaryAction.kind, 'PREPARATION_IN_PROGRESS')
  assert.equal(campus.calls.prepList, 0, 'a Campus workspace never reads personal preparation')
  const off = models({ prep, prepOn: false })
  assert.notEqual((await off.m.home(USER, PERSONAL)).primaryAction.kind, 'PREPARATION_IN_PROGRESS')
  assert.equal(off.calls.prepList, 0)
  // A failed preparation read omits the state rather than inventing one.
  assert.equal((await models({ prep, prepFails: true }).m.home(USER, PERSONAL)).primaryAction.kind, 'PRACTICE_AVAILABLE')
})

test('P3.3 saved formal work outranks preparation and practice; a technical failure never becomes "buy"', async () => {
  const inProgress = { id: 'a-1', status: 'IN_PROGRESS', title: 'Synthetic assessment', scope: 'PERSONAL', dueAt: null, cta: { kind: 'RESUME', to: '/app/assessment/s-1' } }
  const { m, calls } = models({ active: [inProgress], prep: [{ id: 'p', state: 'DRAFT', createdAt: null }] })
  assert.equal((await m.home(USER, PERSONAL)).primaryAction.kind, 'ASSESSMENT_IN_PROGRESS')
  assert.equal(calls.prepList, 0)
  assert.equal(calls.planFor, 0)
  const failedSession = { sessionId: 's-f', scenarioId: 'x', scope: 'PERSONAL', integrity: 'OK', hasSession: true, hasReport: false, sessionCompletedAt: new Date(NOW.getTime() - 3 * 86400000).toISOString() }
  const failed = await models({ sessions: [failedSession] }).m.home(USER, PERSONAL)
  assert.equal(failed.primaryAction.kind, 'ASSESSMENT_TECHNICAL_FAILED')
  assert.notEqual(failed.primaryAction.to, EMPTY_LEGACY_SOURCES.paths.purchase)
})

// P3.6/P3.7 contract additions: the intro shows the persisted policy duration
// before Begin, and the plan board carries the exact server-validated choices.
test('P3.7/P3.6 contract: policy duration before Begin; PLAN_BOARD schema equals the validated lists', async () => {
  const { buildSessionContract } = await import('../domain/assessments/sessionContract.js')
  const { draftBankScenarios } = await import('../domain/assessments/draftSegments.js')
  const { CORE_TEAMREADY_A, CORE_TEAMREADY_A_ID, BOARD_ARTIFACT_ID, validateBoardPatch } = await import('../domain/assessments/universalForm.js')
  const { DRAFT_UNIVERSAL } = await import('../domain/assessments/timingPolicy.js')
  const prev = process.env.PRISM_DRAFT_CONTENT
  process.env.PRISM_DRAFT_CONTENT = 'true'
  try {
    const bank = draftBankScenarios()
    const session = { sessionId: 's-p3', scenarioId: CORE_TEAMREADY_A_ID, history: [], artifacts: bank[CORE_TEAMREADY_A_ID].interactiveArtifacts }
    const c = buildSessionContract({
      session, hasReport: false, engineStatus: 'IDLE', scope: 'PERSONAL', catalog: { definitions: [] }, scenarios: { bankScenarios: bank },
      limitMs: 35 * 60000, now: NOW,
      runTiming: { timedStartedAt: null, answerDeadlineAt: null, graceDeadlineAt: null, policyVersion: DRAFT_UNIVERSAL.version, policy: { durationMs: DRAFT_UNIVERSAL.durationMs, status: DRAFT_UNIVERSAL.status } },
    })
    assert.equal(c.status, 'ALLOCATED')
    assert.equal(c.timing.begun, false)
    assert.equal(c.timing.policyDurationMs, 25 * 60000, 'the proposed 25-minute policy, not the 35-minute legacy limit')
    assert.equal(c.timing.policyStatus, 'PROPOSED_PENDING_REVIEW')
    const board = c.artifacts.find((a) => a.artifactId === BOARD_ARTIFACT_ID)
    assert.deepEqual(board.schema.owners, [...CORE_TEAMREADY_A.board.owners])
    assert.deepEqual(board.schema.statuses, [...CORE_TEAMREADY_A.board.statuses])
    assert.deepEqual(board.schema.editable, [...CORE_TEAMREADY_A.board.editable])
    for (const owner of board.schema.owners) assert.ok(validateBoardPatch(CORE_TEAMREADY_A, { 'R2.owner': owner }).ok)
    assert.equal(JSON.stringify(c).includes('rubric'), false, 'no rubric reference reaches the player')
    // Legacy runs keep the 35-minute limit as their displayed policy.
    const legacy = buildSessionContract({ session: { ...session, startedAt: NOW.getTime() }, hasReport: false, engineStatus: 'IDLE', scope: 'PERSONAL', catalog: { definitions: [] }, scenarios: { bankScenarios: bank }, limitMs: 35 * 60000, now: NOW })
    assert.equal(legacy.timing.policyDurationMs, 35 * 60000)
    assert.equal(legacy.timing.begun, true)
  } finally {
    if (prev === undefined) delete process.env.PRISM_DRAFT_CONTENT
    else process.env.PRISM_DRAFT_CONTENT = prev
  }
})
