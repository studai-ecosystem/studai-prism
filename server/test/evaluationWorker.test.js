import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext, EMPTY_LEGACY_SOURCES } from '../domain/campusStore/context.js'
import { buildRunPin, evaluateJobKey, DRAFT_EVALUATE_JOB_KIND, draftBankScenarios } from '../domain/assessments/draftSegments.js'
import { CORE_TEAMREADY_A_ID, CORE_TEAMREADY_A_FORM_ID } from '../domain/assessments/universalForm.js'
import { startEvaluationWorker } from '../domain/assessments/evaluationWorker.js'
import { createSliceEvaluator } from '../domain/evidence/sliceEvaluator.js'
import { EvidenceGraph } from '../lib/evidenceGraph.js'

process.env.NODE_ENV = 'test'
process.env.PRISM_DRAFT_CONTENT = 'true'

async function queuedWorld({ compute = null } = {}) {
  let at = new Date()
  const repos = createMemoryCampusRepos({ clock: () => at })
  const sessionId = `worker-${randomUUID()}`
  const user = { id: `owner-${randomUUID()}`, name: 'Synthetic worker fixture' }
  const session = { sessionId, scenarioId: CORE_TEAMREADY_A_ID, userId: user.id, history: [], startedAt: at.getTime(), exchangeCount: 0 }
  const graph = new EvidenceGraph()
  const evaluator = createSliceEvaluator({
    complete: async () => { throw new Error('An unanswered fixture must not invoke a provider.') },
    recordUnit: (unit, tx) => graph.recordEvidenceUnit(unit, tx),
  })
  let computes = 0
  const campus = createCampusContext({
    repos, clock: () => at, engine: {},
    legacy: { ...EMPTY_LEGACY_SOURCES, getSession: async (id) => id === sessionId ? structuredClone(session) : null },
    scenarioSource: async () => ({ generalScenarios: [], bankScenarios: draftBankScenarios() }),
    evidence: { units: (id) => graph.getEvidenceUnits(id) },
    sliceEvaluator: { ...evaluator, evaluateRun: async (input) => { computes += 1; return compute ? compute(input) : evaluator.evaluateRun(input) } },
  })
  await repos.scopes.createSessionScope({ sessionId, ownerUserId: user.id, sponsorType: 'PERSONAL', workspaceId: `personal:${user.id}`, visibilityPolicy: 'OWNER_ONLY', createdBy: user.id })
  await repos.sessionIo.putClientEvent({
    sessionId, clientEventId: 'start', kind: 'START',
    response: { runPin: buildRunPin({ scenarioId: CORE_TEAMREADY_A_ID, formId: CORE_TEAMREADY_A_FORM_ID }) },
  })
  await repos.sessionIo.requestEvaluation({ sessionId, taskKey: evaluateJobKey(sessionId), kind: DRAFT_EVALUATE_JOB_KIND, payload: { early: true }, universal: true })
  return { campus, repos, graph, sessionId, user, computes: () => computes, advance: (ms) => { at = new Date(at.getTime() + ms) } }
}

async function until(check) {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return
    await delay(10)
  }
  throw new Error('The synthetic worker did not progress within its bounded test window.')
}

test('durable queued work progresses and publishes without an open Finish request or browser', async () => {
  const w = await queuedWorld()
  const errors = []
  const worker = startEvaluationWorker({ sessions: w.campus.sessions, available: () => true, onError: (e) => errors.push(e), pollMs: 10 })
  try {
    await until(async () => Boolean(await w.repos.sessionIo.getClientEvent(w.sessionId, 'publish')))
    assert.equal((await w.repos.sessionIo.getJob(evaluateJobKey(w.sessionId))).state, 'DONE')
    assert.equal(w.computes(), 1)
    assert.equal((await w.repos.reportVersions.listVersions(w.sessionId)).length, 1)
    assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
    assert.deepEqual(errors, [])
  } finally { await worker.stop() }
})

test('worker renews its lease while computation is still pending', async (t) => {
  let release
  let started
  const pending = new Promise((resolve) => { release = resolve })
  const began = new Promise((resolve) => { started = resolve })
  const w = await queuedWorld({ compute: async () => { started(); await pending; return { units: [] } } })
  t.mock.timers.enable({ apis: ['setInterval'] })
  const work = w.campus.sessions.runEvaluationWorkerOnce()
  await began
  const initial = await w.repos.sessionIo.getJob(evaluateJobKey(w.sessionId))
  w.advance(80_000)
  t.mock.timers.tick(40_000)
  await until(async () => new Date((await w.repos.sessionIo.getJob(evaluateJobKey(w.sessionId))).leaseExpiresAt) > new Date(initial.leaseExpiresAt))
  release()
  assert.equal((await work).state, 'DONE')
  assert.equal((await w.repos.sessionIo.getJob(evaluateJobKey(w.sessionId))).fencingToken, initial.fencingToken)
  t.mock.timers.reset()
})

test('lease renewal failure cannot accept the still-running computation', async (t) => {
  let release
  let started
  const pending = new Promise((resolve) => { release = resolve })
  const began = new Promise((resolve) => { started = resolve })
  const w = await queuedWorld({ compute: async () => { started(); await pending; return { units: [] } } })
  let attempted = false
  w.repos.sessionIo.renewJobLease = async () => { attempted = true; throw Object.assign(new Error('Synthetic lease loss'), { code: 'CONFLICT' }) }
  t.mock.timers.enable({ apis: ['setInterval'] })
  const work = w.campus.sessions.runEvaluationWorkerOnce()
  await began
  t.mock.timers.tick(40_000)
  await until(() => attempted)
  release()
  assert.equal((await work).state, 'FAILED')
  assert.equal(await w.repos.reportVersions.latest(w.sessionId), null)
  assert.deepEqual(await w.graph.getEvidenceUnits(w.sessionId), [])
  t.mock.timers.reset()
})

test('a restarted worker retries publication without recomputing accepted work', async () => {
  const w = await queuedWorld()
  const publish = w.campus.reports.publish
  w.campus.reports.publish = async () => { throw new Error('Synthetic publication outage') }
  assert.equal((await w.campus.sessions.runEvaluationWorkerOnce()).state, 'DONE')
  assert.equal(await w.repos.reportVersions.latest(w.sessionId), null)
  assert.equal(await w.repos.sessionIo.getClientEvent(w.sessionId, 'publish'), null)
  w.campus.reports.publish = publish
  const errors = []
  const worker = startEvaluationWorker({ sessions: w.campus.sessions, available: () => true, onError: (e) => errors.push(e), pollMs: 10 })
  try {
    await until(async () => Boolean(await w.repos.sessionIo.getClientEvent(w.sessionId, 'publish')))
    assert.equal(w.computes(), 1)
    assert.equal((await w.repos.reportVersions.listVersions(w.sessionId)).length, 1)
    assert.deepEqual(errors, [])
  } finally { await worker.stop() }
})
