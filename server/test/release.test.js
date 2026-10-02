// P10.2 / P10.9 — release configuration, readiness, allocation gate and
// go/no-go are pure and honest: UNVERIFIED never becomes READY, a new
// universal run is refused BEFORE any credit moves, and any OPEN human gate
// yields NO_GO.
import test from 'node:test'
import assert from 'node:assert/strict'
import { RELEASE_CONFIG, RELEASE_STAGES, READINESS_CHECKS, readiness, assertAllocatable, createReleaseGate, summarize, stageConfig } from '../domain/release/config.js'
import { goNoGo, HUMAN_GATES, defaultHumanGates } from '../domain/release/goNoGo.js'
import { ALERTS, ALERT_IDS, alertsByTriage } from '../domain/release/alerts.js'
import { ERROR_STATUS } from '../domain/http/errors.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'
import { createMemoryDb } from '../domain/campusStore/memoryDb.js'
import { createSessionIoRepoMemory } from '../domain/assessments/sessionIoRepository.js'
import { createAssessmentSessionService, REQUIRED_CONSENT_SCOPES } from '../domain/assessments/sessionService.js'
import { DRAFT_SEGMENT_ID } from '../domain/assessments/draftSegments.js'

const ALL_READY = { player: true, durableWriter: true, migrationsApplied: ['0040_candidate_actions_jobs', '0049_preview_attempts'], evaluator: true, publication: true, contentState: 'APPROVED_FOR_INTENDED_USE', worker: true }
const ALL_FLAGS = Object.fromEntries(['PRISM_APP_SHELL_V3', 'PRISM_ASSESSMENT_WORKSPACE_V3', 'PRISM_STUDENT_REPORT_V3', 'PRISM_EVIDENCE_FAIL_CLOSED', 'PRISM_DEVELOPMENT_V2'].map((k) => [k, 'true']))

test('P10.2: RELEASE_CONFIG v1 is frozen, covers every stage, only names registered flags and never requires growth', () => {
  assert.equal(RELEASE_CONFIG.version, 1)
  assert.ok(Object.isFrozen(RELEASE_CONFIG))
  assert.deepEqual(Object.keys(RELEASE_CONFIG.stages).sort(), [...RELEASE_STAGES].sort())
  const registered = new Set(FLAG_CATALOGUE.map((f) => f.key))
  for (const stage of RELEASE_STAGES) {
    const cfg = stageConfig(stage)
    assert.ok(Object.isFrozen(cfg.requiredFlags))
    for (const key of cfg.requiredFlags) assert.ok(registered.has(key), `${stage} requires unregistered flag ${key}`)
    assert.ok(!cfg.requiredFlags.includes('PRISM_GROWTH_ENABLED'))
    for (const c of cfg.requiredChecks) assert.ok(READINESS_CHECKS.includes(c))
  }
  assert.equal(stageConfig('nope'), null)
})

test('P10.2: readiness reports READY / NOT_READY / UNVERIFIED per check and never collapses UNVERIFIED into READY', () => {
  const ready = readiness({ env: ALL_FLAGS, stage: 'WIDER', checks: ALL_READY })
  assert.equal(ready.allocatable, true)
  assert.deepEqual(ready.blockers, [])
  const unknown = readiness({ env: ALL_FLAGS, stage: 'WIDER', checks: { ...ALL_READY, worker: null, migrationsApplied: null } })
  assert.equal(unknown.checks.WORKER_REACHABILITY.state, 'UNVERIFIED')
  assert.equal(unknown.checks.DURABLE_WRITER.state, 'UNVERIFIED')
  assert.equal(unknown.allocatable, false)
  assert.ok(unknown.blockers.includes('UNVERIFIED:WORKER_REACHABILITY'))
  const broken = readiness({ env: ALL_FLAGS, stage: 'WIDER', checks: { ...ALL_READY, evaluator: false, migrationsApplied: ['0039_x'] } })
  assert.equal(broken.checks.EVALUATOR.state, 'NOT_READY')
  assert.equal(broken.checks.DURABLE_WRITER.state, 'NOT_READY')
  const empty = readiness({})
  for (const c of READINESS_CHECKS) assert.equal(empty.checks[c].state, 'UNVERIFIED')
  assert.equal(empty.allocatable, false)
})

test('P10.2: content state is compared against the stage minimum; flags missing from the stage set block', () => {
  assert.equal(readiness({ env: {}, stage: 'LOCAL', checks: { ...ALL_READY, contentState: 'DRAFT' } }).allocatable, true, 'LOCAL accepts DRAFT and needs no flags')
  const canary = readiness({ env: ALL_FLAGS, stage: 'INTERNAL_CANARY', checks: { ...ALL_READY, contentState: 'DRAFT' } })
  assert.equal(canary.checks.APPROVED_CONTENT.state, 'NOT_READY')
  assert.equal(readiness({ env: ALL_FLAGS, stage: 'INTERNAL_CANARY', checks: { ...ALL_READY, contentState: 'APPROVED_FOR_PILOT' } }).allocatable, true)
  assert.equal(readiness({ env: ALL_FLAGS, stage: 'WIDER', checks: { ...ALL_READY, contentState: 'APPROVED_FOR_PILOT' } }).checks.APPROVED_CONTENT.state, 'NOT_READY')
  assert.equal(readiness({ env: ALL_FLAGS, stage: 'WIDER', checks: { ...ALL_READY, contentState: 'RETIRED' } }).checks.APPROVED_CONTENT.state, 'NOT_READY')
  const dark = readiness({ env: {}, stage: 'STAGING', checks: ALL_READY })
  assert.equal(dark.allocatable, false)
  assert.ok(dark.blockers.includes('FLAG_OFF:PRISM_ASSESSMENT_WORKSPACE_V3'))
})

test('P10.2: assertAllocatable throws RUN_NOT_ALLOCATABLE (503) with state-only details and no secrets', () => {
  assert.equal(ERROR_STATUS.RUN_NOT_ALLOCATABLE, 503)
  const env = { ...ALL_FLAGS, DATABASE_URL: 'private-url', JWT_SECRET: 'private-secret' }
  const result = readiness({ env, stage: 'STAGING', checks: { ...ALL_READY, worker: null } })
  const err = (() => { try { assertAllocatable(result); return null } catch (e) { return e } })()
  assert.equal(err.code, 'RUN_NOT_ALLOCATABLE')
  assert.equal(err.status, 503)
  assert.equal(err.details.checks.WORKER_REACHABILITY, 'UNVERIFIED')
  assert.doesNotMatch(JSON.stringify(err.details), /private-/)
  assert.deepEqual(Object.keys(summarize(result)).sort(), ['blockers', 'checks', 'configVersion', 'missingFlags', 'stage'])
  assert.equal(assertAllocatable(readiness({ env, stage: 'STAGING', checks: ALL_READY })).allocatable, true)
})

test('P10.2: a throwing or missing probe is UNVERIFIED, never READY', async () => {
  const gate = createReleaseGate({ env: {}, stage: 'LOCAL', probes: { player: () => { throw new Error('boom') }, evaluator: async () => true } })
  const r = await gate.readiness({ scenarioId: 'x' })
  assert.equal(r.checks.COMPATIBLE_PLAYER.state, 'UNVERIFIED')
  assert.equal(r.checks.EVALUATOR.state, 'READY')
  assert.equal(r.checks.PUBLICATION.state, 'UNVERIFIED')
  await assert.rejects(gate.assertAllocatable({ scenarioId: 'x' }), (e) => e.code === 'RUN_NOT_ALLOCATABLE')
  assert.equal(createReleaseGate({ env: { PRISM_RELEASE_STAGE: 'bogus' } }).stage, 'LOCAL')
})

// ── start() gate: the credit never moves when the chain is not ready ────────
function startWorld({ allocatable }) {
  const db = createMemoryDb()
  const io = createSessionIoRepoMemory(db)
  const calls = { reserve: 0, engineStart: 0, createEntitlement: 0 }
  const gate = createReleaseGate({ env: {}, stage: 'LOCAL', probes: allocatable
    ? { player: () => true, durableWriter: () => true, migrationsApplied: () => ['0040_x'], evaluator: () => true, publication: () => true, contentState: () => 'DRAFT' }
    : { player: () => true, durableWriter: () => true, migrationsApplied: () => ['0040_x'], evaluator: () => false, publication: () => true, contentState: () => 'DRAFT' } })
  let session = null
  const svc = createAssessmentSessionService({
    repos: { kind: 'memory', sessionIo: io, assessments: { updateStudent: async () => {} } },
    assignments: { resolveItem: async () => ({ item: { definition: { id: 'def-1', formPolicy: 'FIXED_FORM' }, assignment: { formId: 'form-1' } }, card: { status: 'OPEN', scope: 'SPONSORED', acknowledged: true, sessionId: null } }) },
    catalog: { getCatalog: async () => ({ forms: [{ id: 'form-1', definitionId: 'def-1', status: 'FROZEN', scenarioId: DRAFT_SEGMENT_ID }] }) },
    scenarioSource: async () => [],
    resolver: { resolveEntitlement: async () => ({ kind: 'SPONSORED' }) },
    ledger: { reserve: async ({ sessionId }) => { calls.reserve += 1; return { consumption: { sessionId, entitlementId: 'ent-1' } } }, finalizeOn: async () => ({}) },
    sessionScopes: { recordSponsoredStart: async () => {} },
    legacy: { getSession: async () => session, getReport: async () => null, getEntitlement: async () => null, createEntitlement: async () => { calls.createEntitlement += 1 } },
    engine: { recordConsent: async () => {}, start: async ({ sessionId }) => { calls.engineStart += 1; session = { sessionId, userId: 'u1', scenarioId: DRAFT_SEGMENT_ID } } },
    sliceEvaluator: {},
    releaseGate: gate,
  })
  return { svc, calls, io }
}
const startArgs = { user: { id: 'u1' }, workspace: { type: 'CAMPUS_STUDENT', organizationId: 'org-1' }, assignmentId: 'asg-1', idempotencyKey: 'k1', consent: { scopes: [...REQUIRED_CONSENT_SCOPES] } }

test('P10.2: a NEW draft/universal run is refused with RUN_NOT_ALLOCATABLE before any reservation, entitlement or engine start', async () => {
  const { svc, calls } = startWorld({ allocatable: false })
  await assert.rejects(svc.start(startArgs), (e) => e.code === 'RUN_NOT_ALLOCATABLE' && e.status === 503 && e.details.checks.EVALUATOR === 'NOT_READY')
  assert.deepEqual(calls, { reserve: 0, engineStart: 0, createEntitlement: 0 })
})

test('P10.2: the same start proceeds when readiness is READY (gate is a pre-check, not a behaviour change)', async () => {
  const { svc, calls, io } = startWorld({ allocatable: true })
  const out = await svc.start(startArgs)
  assert.equal(out.resumed, false)
  assert.equal(calls.reserve, 1)
  assert.equal(calls.engineStart, 1)
  const start = await io.getClientEvent(out.sessionId, 'start')
  assert.ok(start.response.runPin.methodVersion, 'run is pinned to its method')
})

// ── go/no-go ─────────────────────────────────────────────────────────────────
test('P10.9: every human gate defaults to OPEN and any OPEN gate of the stage yields NO_GO even with full readiness', () => {
  assert.deepEqual(Object.values(defaultHumanGates()), HUMAN_GATES.map(() => 'OPEN'))
  const ready = readiness({ env: ALL_FLAGS, stage: 'WIDER', checks: ALL_READY })
  const verdict = goNoGo({ readiness: ready })
  assert.equal(verdict.verdict, 'NO_GO')
  assert.ok(verdict.reasons.every((r) => r.startsWith('HUMAN_GATE_OPEN:')))
  const approved = Object.fromEntries(HUMAN_GATES.map((id) => [id, 'APPROVED']))
  assert.equal(goNoGo({ readiness: ready, humanGates: approved }).verdict, 'GO')
  for (const id of stageConfig('WIDER').humanGates) {
    assert.equal(goNoGo({ readiness: ready, humanGates: { ...approved, [id]: 'OPEN' } }).verdict, 'NO_GO', `${id} OPEN must be NO_GO`)
  }
  // Unknown gate values are ignored (treated as OPEN), readiness gaps are reasons too.
  assert.equal(goNoGo({ readiness: ready, humanGates: { ...approved, 'HA-C001': 'yes please' } }).verdict, 'NO_GO')
  const partial = goNoGo({ readiness: readiness({ env: ALL_FLAGS, stage: 'WIDER', checks: { ...ALL_READY, worker: null } }), humanGates: approved })
  assert.deepEqual(partial.reasons, ['UNVERIFIED:WORKER_REACHABILITY'])
  assert.equal(goNoGo({}).verdict, 'NO_GO')
  assert.equal(goNoGo({ readiness: readiness({ env: {}, stage: 'LOCAL', checks: { ...ALL_READY, contentState: 'DRAFT' } }), humanGates: {} }).verdict, 'GO', 'LOCAL has no human gates')
})

// ── diagnostic script integration ────────────────────────────────────────────
test('P10.2: check-experience-baseline reports release readiness per stage without collapsing UNVERIFIED and refuses bad --stage values', async () => {
  const { runDiagnostic, baselineReport } = await import('../../scripts/check-experience-baseline.mjs')
  const out = baselineReport({ DATABASE_URL: 'private-url' })
  assert.equal(out.release.stage, 'LOCAL')
  for (const c of ['COMPATIBLE_PLAYER', 'EVALUATOR', 'PUBLICATION', 'APPROVED_CONTENT', 'WORKER_REACHABILITY', 'DURABLE_WRITER']) assert.equal(out.release.checks[c].state, 'UNVERIFIED')
  assert.equal(out.release.allocatable, false)
  assert.doesNotMatch(JSON.stringify(out), /private-/)
  const lines = []
  assert.equal(await runDiagnostic({ args: ['--stage', 'WIDER'], env: {}, write: (l) => lines.push(l) }), 1)
  const parsed = JSON.parse(lines[0])
  assert.equal(parsed.release.stage, 'WIDER')
  assert.ok(parsed.release.blockers.includes('FLAG_OFF:PRISM_APP_SHELL_V3'))
  assert.equal(parsed.database.status, 'UNVERIFIED')
  for (const args of [['--stage'], ['--stage', 'prod'], ['--stage', 'LOCAL', '--stage', 'WIDER'], ['--stage', 'postgres://private']]) {
    const bad = []
    assert.equal(await runDiagnostic({ args, env: {}, write: (l) => bad.push(l) }), 1)
    assert.equal(JSON.parse(bad[0]).database.code, 'DIAGNOSTIC_INVALID_ARGUMENTS')
    assert.doesNotMatch(bad[0], /private/)
  }
})

// ── alerts ──────────────────────────────────────────────────────────────────
test('P10.8: alert definitions are operational-only, unique, and each maps to a runbook triage path', () => {
  assert.equal(new Set(ALERT_IDS).size, ALERTS.length)
  for (const a of ALERTS) {
    assert.equal(a.view, 'OPERATIONAL')
    assert.ok(['PAGE', 'TICKET', 'REVIEW'].includes(a.severity))
    assert.ok(a.owner && a.triage)
  }
  for (const id of ['SAVED_ACTION_LOSS', 'TECHNICAL_EMPTY_REPORT', 'MISSING_OWNED_HISTORY', 'REPEATED_START_TRANSITIONS', 'QUEUE_DEPTH', 'EXPIRED_LEASES', 'FAILED_CLAIMS', 'UNAUTHORIZED_SCOPE_ACCESS', 'COST_OUTLIER', 'RECOVERY_CREDIT_USAGE']) assert.ok(ALERT_IDS.includes(id), id)
  assert.ok(Object.keys(alertsByTriage()).length >= 4)
})
