// P10.5 — rollback preserves active and historical work. The plan is pure;
// the fencing/tombstone/idempotency invariants are exercised on the memory
// store and the session service with synthetic data only.
import test from 'node:test'
import assert from 'node:assert/strict'
import { rollbackPlan, canDisable, countActiveV3Runs, ACTIVE_RUN_FLAGS, ROLLBACK_ROLES } from '../domain/release/rollback.js'
import { createMemoryDb } from '../domain/campusStore/memoryDb.js'
import { createSessionIoRepoMemory } from '../domain/assessments/sessionIoRepository.js'
import { createAssessmentSessionService } from '../domain/assessments/sessionService.js'
import { buildRunPin, DRAFT_SEGMENT_ID, DRAFT_EVALUATE_JOB_KIND, evaluateJobKey, SLICE_METHOD_VERSION } from '../domain/assessments/draftSegments.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createEntitlementLedger } from '../domain/entitlements/ledger.js'
import { createGrantService } from '../domain/commerce/grants.js'
import { ERROR_STATUS } from '../domain/http/errors.js'

const ACTIVE = [{ sessionId: 'run-a', universal: true, state: 'IN_PROGRESS' }, { sessionId: 'run-b', runPin: { methodVersion: SLICE_METHOD_VERSION }, state: 'SCORING' }]
const DONE = [{ sessionId: 'run-c', universal: true, state: 'COMPLETED' }, { sessionId: 'legacy-1', state: 'IN_PROGRESS' }]

test('P10.5: rollbackPlan stops allocations first, drains pinned runs, keeps readers/shares and separates schema rollback', () => {
  const plan = rollbackPlan({ activeRuns: [...ACTIVE, ...DONE], flags: { PRISM_ASSESSMENT_WORKSPACE_V3: true, PRISM_GROWTH_ENABLED: true } })
  assert.equal(plan.activeV3Runs, 2)
  assert.equal(plan.safeToDisableNow, false)
  const ids = plan.steps.map((s) => s.id)
  assert.equal(ids[0], 'STOP_NEW_ALLOCATIONS')
  assert.ok(ids.indexOf('DRAIN_OR_PIN_ACTIVE_RUNS') < ids.indexOf('DISABLE_SERVING_FLAGS'))
  assert.ok(ids.indexOf('PRESERVE_READERS_AND_SHARES') < ids.indexOf('DISABLE_SERVING_FLAGS'))
  assert.equal(ids.at(-1), 'SCHEMA_ROLLBACK_SEPARATE_REVIEW')
  assert.equal(plan.steps.at(-1).separateReview, true)
  assert.match(plan.steps.find((s) => s.id === 'DRAIN_OR_PIN_ACTIVE_RUNS').action, /never route an active run to the legacy player/)
  assert.match(plan.steps.find((s) => s.id === 'SCHEMA_ROLLBACK_SEPARATE_REVIEW').action, /never drop evidence\/action\/job tables/)
  const disable = plan.steps.find((s) => s.id === 'DISABLE_SERVING_FLAGS')
  assert.deepEqual(disable.flags, [{ flag: 'PRISM_ASSESSMENT_WORKSPACE_V3', canDisable: false }])
  assert.equal(disable.blocking, true)
  for (const step of plan.steps) assert.ok(Object.values(ROLLBACK_ROLES).includes(step.owner))
  assert.doesNotMatch(JSON.stringify(plan), /run-a|run-b/, 'plan carries counts, not run identifiers')
})

test('P10.5: canDisable is false while active V3 runs exist and true once drained; non-serving flags are unaffected', () => {
  for (const flag of ACTIVE_RUN_FLAGS) assert.equal(canDisable(flag, ACTIVE), false)
  for (const flag of ACTIVE_RUN_FLAGS) assert.equal(canDisable(flag, DONE), true)
  assert.equal(canDisable('PRISM_GROWTH_ENABLED', ACTIVE), true)
  assert.equal(countActiveV3Runs(DONE), 0)
  assert.equal(rollbackPlan({ activeRuns: DONE, flags: {} }).safeToDisableNow, true)
})

// ── session-service invariants ────────────────────────────────────────────────
const setup = () => {
  let t = Date.parse('2026-01-01T00:00:00Z')
  const db = createMemoryDb({ clock: () => new Date(t) })
  return { db, io: createSessionIoRepoMemory(db), tick: (ms) => { t += ms } }
}
const user = { id: 'u1' }
const draftSession = { userId: user.id, exchangeCount: 0, scenarioId: DRAFT_SEGMENT_ID, artifacts: [] }

test('P10.5: a universal run pinned to a method this build does not carry → RUN_VERSION_UNSUPPORTED, never the legacy engine', async () => {
  assert.equal(ERROR_STATUS.RUN_VERSION_UNSUPPORTED, 409)
  const { io } = setup()
  let engineCalls = 0
  const svc = createAssessmentSessionService({
    repos: { kind: 'memory', sessionIo: io },
    legacy: { getSession: async () => ({ ...draftSession }), getReport: async () => null },
    scenarioSource: async () => ({ bankScenarios: { [DRAFT_SEGMENT_ID]: { title: 'Synthetic', briefing: {}, probingTree: { turns: [{ turn: 1 }] } } } }),
    engine: { async message() { engineCalls += 1; return { messages: [] } }, async saveArtifact() { engineCalls += 1; return { artifact: {} } } },
    sliceEvaluator: {},
  })
  const stalePin = { ...buildRunPin({ formId: null, scenarioId: DRAFT_SEGMENT_ID }), methodVersion: 'v3-slice-0.0-retired' }
  await io.putClientEvent({ sessionId: 's1', clientEventId: 'start', kind: 'START', response: { runPin: stalePin } })
  const args = { user, workspace: { type: 'PERSONAL' }, sessionId: 's1', clientEventId: 'e1', text: 'hello' }
  await assert.rejects(svc.sendMessage(args), (e) => e.code === 'RUN_VERSION_UNSUPPORTED' && e.details.supportedMethodVersion === SLICE_METHOD_VERSION)
  assert.equal(engineCalls, 0, 'legacy engine never consulted for an unsupported pinned run')
  assert.equal((await io.getAction('s1', 'e1')).state, 'FAILED', 'the accepted action is marked failed, not applied')
  await assert.rejects(svc.finish({ user, workspace: { type: 'PERSONAL' }, sessionId: 's1', early: true }), (e) => e.code === 'RUN_VERSION_UNSUPPORTED')
  // A supported pin on the same build is served normally (control).
  const { io: io2 } = setup()
  await io2.putClientEvent({ sessionId: 's2', clientEventId: 'start', kind: 'START', response: { runPin: buildRunPin({ formId: null, scenarioId: DRAFT_SEGMENT_ID }) } })
  const svc2 = createAssessmentSessionService({ repos: { kind: 'memory', sessionIo: io2 }, legacy: { getSession: async () => ({ ...draftSession }), getReport: async () => null }, engine: { async message() { engineCalls += 1; return { messages: [] } } }, sliceEvaluator: {} })
  const out = await svc2.sendMessage({ ...args, sessionId: 's2' })
  assert.equal(out.replayed, false)
})

test('P10.5: a stale fencing token (worker crashed during rollback, lease re-claimed) can never complete or fail the job', async () => {
  const { io, tick } = setup()
  await io.enqueueJob({ taskKey: evaluateJobKey('s1'), sessionId: 's1', kind: DRAFT_EVALUATE_JOB_KIND })
  const crashed = await io.claimJob(DRAFT_EVALUATE_JOB_KIND, 1000)
  tick(1500)
  const recovered = await io.claimJob(DRAFT_EVALUATE_JOB_KIND, 1000)
  assert.ok(recovered.fencingToken > crashed.fencingToken)
  await assert.rejects(io.completeJob(crashed.jobId, crashed.fencingToken, 'DONE'), (e) => e.code === 'CONFLICT')
  await assert.rejects(io.failJob(crashed.jobId, crashed.fencingToken), (e) => e.code === 'CONFLICT')
  assert.equal((await io.getJob(evaluateJobKey('s1'))).state, 'LEASED')
  assert.equal((await io.completeJob(recovered.jobId, recovered.fencingToken, 'DONE')).state, 'DONE')
})

test('P10.5: a model result arriving after a queued erasure is never written back (job fails closed, no evidence/opportunity write)', async () => {
  const { io } = setup()
  await io.putClientEvent({ sessionId: 's1', clientEventId: 'start', kind: 'START', response: { runPin: buildRunPin({ formId: null, scenarioId: DRAFT_SEGMENT_ID }) } })
  await io.acceptAction({ sessionId: 's1', clientEventId: 'e1', kind: 'MESSAGE', payload: { text: 'answer' } })
  await io.enqueueJob({ taskKey: evaluateJobKey('s1'), sessionId: 's1', kind: DRAFT_EVALUATE_JOB_KIND })
  let evaluatorRan = 0
  const svc = createAssessmentSessionService({
    repos: { kind: 'memory', sessionIo: io },
    legacy: { getSession: async () => ({ ...draftSession }), getReport: async () => null },
    engine: {},
    // The external model is slow; the learner's erasure lands while it runs.
    sliceEvaluator: { async evaluateRun() { evaluatorRan += 1; await io.markErased('s1'); return { units: [{ id: 'late' }] } } },
  })
  const job = await svc.runEvaluationWorkerOnce({})
  assert.equal(evaluatorRan, 1)
  assert.notEqual(job.state, 'DONE')
  assert.equal(job.resultState, 'TECHNICAL_FAILURE')
  // Any later apply on the erased session is rejected too.
  const action = await io.getAction('s1', 'e1')
  await assert.rejects(io.applyAction(action.actionId, { late: true }), (e) => e.code === 'NOT_FOUND')
  await assert.rejects(io.acceptAction({ sessionId: 's1', clientEventId: 'e2', kind: 'MESSAGE', payload: {} }), (e) => e.code === 'NOT_FOUND')
  // A retry after the marker exists does not resurrect anything.
  await io.retryJob(evaluateJobKey('s1'))
  const again = await svc.runEvaluationWorkerOnce({})
  assert.equal(evaluatorRan, 1, 'the evaluator is not called again for an erased session')
  assert.notEqual(again?.state, 'DONE')
})

test('P10.5: a pending payment webhook delivered after a rollback is still idempotent (one grant, replays return it)', async () => {
  let now = new Date('2026-10-01T10:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const ledger = createEntitlementLedger({ repos, clock: () => now, audit: () => {} })
  const commerce = createGrantService({ repos, ledger, clock: () => now, audit: () => {} })
  const first = await commerce.grantFromPayment({ userId: 'u1', providerEventKey: 'razorpay:payment:pay_rollback_1', purchaseRef: 'order_rb_1' })
  assert.equal(first.created, true)
  // Rollback happens; the provider retries the same event and a reordered sibling afterwards.
  now = new Date('2026-10-01T12:00:00Z')
  const replay = await commerce.grantFromPayment({ userId: 'u1', providerEventKey: 'razorpay:payment:pay_rollback_1', purchaseRef: 'order_rb_1' })
  assert.equal(replay.created, false)
  assert.equal(replay.grant.id, first.grant.id)
  const sibling = await commerce.grantFromPayment({ userId: 'u1', providerEventKey: 'razorpay:order:order_rb_1', purchaseRef: 'order_rb_1' })
  assert.equal(sibling.created, false)
  assert.equal(sibling.grant.id, first.grant.id)
  assert.equal((await commerce.listForUser('u1')).length, 1)
})
