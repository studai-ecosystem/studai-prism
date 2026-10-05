// P10.2 / P10.9 — release configuration, readiness, allocation gate and
// go/no-go are pure and honest: UNVERIFIED never becomes READY, a new
// universal run is refused BEFORE any credit moves, and any OPEN human gate
// yields NO_GO.
import test from 'node:test'
import assert from 'node:assert/strict'
import { RELEASE_CONFIG, RELEASE_STAGES, READINESS_CHECKS, readiness, assertAllocatable, createReleaseGate, summarize, stageConfig } from '../domain/release/config.js'
import { goNoGo, scopedReleaseDecisions, RELEASE_SCOPES, HUMAN_GATES, INDEPENDENT_SIGNOFF_GATES, RELEASE_PROHIBITIONS, defaultHumanGates, defaultIndependentSignoffs } from '../domain/release/goNoGo.js'
import { ALERTS, ALERT_IDS, alertsByTriage } from '../domain/release/alerts.js'
import { ERROR_STATUS } from '../domain/http/errors.js'
import { FLAG_CATALOGUE } from '../lib/flagRegistry.js'
import { createMemoryDb } from '../domain/campusStore/memoryDb.js'
import { createSessionIoRepoMemory } from '../domain/assessments/sessionIoRepository.js'
import { createAssessmentSessionService, REQUIRED_CONSENT_SCOPES } from '../domain/assessments/sessionService.js'
import { DRAFT_SEGMENT_ID } from '../domain/assessments/draftSegments.js'
process.env.PRISM_DRAFT_CONTENT = 'true'

const ALL_READY = { player: true, durableWriter: true, migrationsApplied: ['0040_candidate_actions_jobs', '0049_preview_attempts'], evaluator: true, publication: true, contentState: 'APPROVED_FOR_INTENDED_USE', worker: true }
const ALL_FLAGS = Object.fromEntries(['PRISM_APP_SHELL_V3', 'PRISM_ASSESSMENT_WORKSPACE_V3', 'PRISM_STUDENT_REPORT_V3', 'PRISM_EVIDENCE_FAIL_CLOSED', 'PRISM_DEVELOPMENT_V2'].map((k) => [k, 'true']))

test('P10.2: RELEASE_CONFIG v2 is frozen, covers every stage and ordered dependency bundle, only names registered flags and never requires growth', () => {
  assert.equal(RELEASE_CONFIG.version, 2)
  assert.ok(Object.isFrozen(RELEASE_CONFIG))
  assert.deepEqual(Object.keys(RELEASE_CONFIG.stages).sort(), [...RELEASE_STAGES].sort())
  assert.deepEqual(RELEASE_CONFIG.activationOrder, [
    'PERSONAL_HOME_HISTORY', 'PLAYER_EVIDENCE_REPORT', 'REVIEWED_PRACTICE',
    'PRIVATE_PREPARATION', 'APPROVED_PAID_PACKAGES', 'CAMPUS', 'GROWTH',
  ])
  for (const component of RELEASE_CONFIG.activationOrder) assert.ok(RELEASE_CONFIG.components[component])
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
  const ready = readiness({ env: ALL_FLAGS, stage: 'WIDER_RELEASE', checks: ALL_READY })
  assert.equal(ready.allocatable, true)
  assert.deepEqual(ready.blockers, [])
  const unknown = readiness({ env: ALL_FLAGS, stage: 'WIDER_RELEASE', checks: { ...ALL_READY, worker: null, migrationsApplied: null } })
  assert.equal(unknown.checks.WORKER_REACHABILITY.state, 'UNVERIFIED')
  assert.equal(unknown.checks.DURABLE_WRITER.state, 'UNVERIFIED')
  assert.equal(unknown.allocatable, false)
  assert.ok(unknown.blockers.includes('RDY_UNVERIFIED_WORKER_REACHABILITY'))
  const broken = readiness({ env: ALL_FLAGS, stage: 'WIDER_RELEASE', checks: { ...ALL_READY, evaluator: false, migrationsApplied: ['0039_x'] } })
  assert.equal(broken.checks.EVALUATOR.state, 'NOT_READY')
  assert.equal(broken.checks.DURABLE_WRITER.state, 'NOT_READY')
  const empty = readiness({})
  for (const c of READINESS_CHECKS) assert.equal(empty.checks[c].state, 'UNVERIFIED')
  assert.equal(empty.allocatable, false)
})

test('P10.2: content state is compared against the stage minimum; flags missing from the stage set block', () => {
  assert.equal(readiness({ env: {}, stage: 'LOCAL_CI', checks: { ...ALL_READY, contentState: 'DRAFT' } }).allocatable, true, 'LOCAL_CI accepts DRAFT and needs no flags')
  const canary = readiness({ env: ALL_FLAGS, stage: 'INTERNAL_CANARY', checks: { ...ALL_READY, contentState: 'DRAFT' } })
  assert.equal(canary.checks.APPROVED_CONTENT.state, 'NOT_READY')
  assert.equal(readiness({ env: ALL_FLAGS, stage: 'INTERNAL_CANARY', checks: { ...ALL_READY, contentState: 'APPROVED_FOR_PILOT' } }).allocatable, true)
  assert.equal(readiness({ env: ALL_FLAGS, stage: 'WIDER_RELEASE', checks: { ...ALL_READY, contentState: 'APPROVED_FOR_PILOT' } }).checks.APPROVED_CONTENT.state, 'NOT_READY')
  assert.equal(readiness({ env: ALL_FLAGS, stage: 'WIDER_RELEASE', checks: { ...ALL_READY, contentState: 'RETIRED' } }).checks.APPROVED_CONTENT.state, 'NOT_READY')
  const dark = readiness({ env: {}, stage: 'STAGING', checks: ALL_READY })
  assert.equal(dark.allocatable, false)
  assert.ok(dark.blockers.includes('RDY_FLAG_OFF_PRISM_ASSESSMENT_WORKSPACE_V3'))
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
  assert.deepEqual(Object.keys(summarize(result)).sort(), ['allocatable', 'blockerIds', 'checks', 'configVersion', 'effectiveFlags', 'missingFlags', 'stage'])
  assert.equal(assertAllocatable(readiness({ env, stage: 'STAGING', checks: ALL_READY })).allocatable, true)
})

test('P10.2: a throwing or missing probe is UNVERIFIED, never READY', async () => {
  const gate = createReleaseGate({ env: {}, stage: 'LOCAL_CI', probes: { player: () => { throw new Error('boom') }, evaluator: async () => true } })
  const r = await gate.readiness({ scenarioId: 'x' })
  assert.equal(r.checks.COMPATIBLE_PLAYER.state, 'UNVERIFIED')
  assert.equal(r.checks.EVALUATOR.state, 'READY')
  assert.equal(r.checks.PUBLICATION.state, 'UNVERIFIED')
  await assert.rejects(gate.assertAllocatable({ scenarioId: 'x' }), (e) => e.code === 'RUN_NOT_ALLOCATABLE')
  assert.equal(createReleaseGate({ env: { PRISM_RELEASE_STAGE: 'bogus' } }).stage, 'LOCAL_CI')
})

// ── start() gate: the credit never moves when the chain is not ready ────────
function startWorld({ allocatable }) {
  const db = createMemoryDb()
  const io = createSessionIoRepoMemory(db)
  const calls = { reserve: 0, engineStart: 0, createEntitlement: 0, draftSession: 0 }
  const gate = createReleaseGate({ env: {}, stage: 'LOCAL_CI', probes: allocatable
    ? { player: () => true, durableWriter: () => true, migrationsApplied: () => ['0040_x'], evaluator: () => true, publication: () => true, contentState: () => 'DRAFT' }
    : { player: () => true, durableWriter: () => true, migrationsApplied: () => ['0040_x'], evaluator: () => false, publication: () => true, contentState: () => 'DRAFT' } })
  let session = null
  const svc = createAssessmentSessionService({
    repos: { kind: 'memory', sessionIo: io, assessments: { updateStudent: async () => {} } },
    assignments: { resolveItem: async () => ({ item: { definition: { id: 'def-1', formPolicy: 'FIXED_FORM' }, assignment: { formId: 'form-1' } }, card: { status: 'OPEN', scope: 'SPONSORED', acknowledged: true, sessionId: null } }) },
    catalog: { getCatalog: async () => ({ forms: [{ id: 'form-1', definitionId: 'def-1', status: 'FROZEN', scenarioId: DRAFT_SEGMENT_ID }] }) },
    scenarioSource: async () => ({ generalScenarios: [], bankScenarios: { [DRAFT_SEGMENT_ID]: { title: 'Synthetic', interactiveArtifacts: [] } } }),
    resolver: { resolveEntitlement: async () => ({ kind: 'SPONSORED' }) },
    ledger: { reserve: async ({ sessionId }) => { calls.reserve += 1; return { consumption: { sessionId, entitlementId: 'ent-1' } } }, finalizeOn: async () => ({}) },
    sessionScopes: { recordSponsoredStart: async () => {} },
    legacy: { getSession: async () => session, getReport: async () => null, getEntitlement: async () => null, createEntitlement: async () => { calls.createEntitlement += 1 },
      createSession: async (sessionId, rec) => { calls.draftSession += 1; session = { sessionId, ...rec } } },
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
  assert.deepEqual(calls, { reserve: 0, engineStart: 0, createEntitlement: 0, draftSession: 0 })
})

test('P10.2: the same start proceeds when readiness is READY (gate is a pre-check, not a behaviour change)', async () => {
  const { svc, calls, io } = startWorld({ allocatable: true })
  const out = await svc.start(startArgs)
  assert.equal(out.resumed, false)
  assert.equal(calls.reserve, 1)
  assert.equal(calls.engineStart, 0, 'a draft run is never started by the legacy engine')
  assert.equal(calls.draftSession, 1)
  const start = await io.getClientEvent(out.sessionId, 'start')
  assert.ok(start.response.runPin.methodVersion, 'run is pinned to its method')
  assert.equal(start.response.runPin.releaseConfigVersion, RELEASE_CONFIG.version, 'run is pinned to its release configuration')
})

// ── go/no-go ─────────────────────────────────────────────────────────────────
test('P9.9/P10.9: human gates and six independent sign-offs default OPEN and each preserves NO_GO', () => {
  assert.deepEqual(Object.values(defaultHumanGates()), HUMAN_GATES.map(() => 'OPEN'))
  assert.deepEqual(Object.values(defaultIndependentSignoffs()), INDEPENDENT_SIGNOFF_GATES.map(() => 'OPEN'))
  const ready = readiness({ env: ALL_FLAGS, stage: 'WIDER_RELEASE', checks: ALL_READY })
  const verdict = goNoGo({ readiness: ready })
  assert.equal(verdict.verdict, 'NO_GO')
  assert.ok(verdict.reasons.some((r) => r.startsWith('HUMAN_GATE_OPEN:')))
  assert.ok(verdict.reasons.some((r) => r.startsWith('INDEPENDENT_SIGNOFF_OPEN:')))
  const approved = Object.fromEntries(HUMAN_GATES.map((id) => [id, 'APPROVED']))
  const signed = Object.fromEntries(INDEPENDENT_SIGNOFF_GATES.map((id) => [id, 'APPROVED']))
  const clear = Object.fromEntries(RELEASE_PROHIBITIONS.map((id) => [id, 'CLEAR']))
  assert.equal(goNoGo({ readiness: ready, humanGates: approved, independentSignoffs: signed, releaseProhibitions: clear }).verdict, 'GO')
  for (const id of stageConfig('WIDER_RELEASE').humanGates) {
    assert.equal(goNoGo({ readiness: ready, humanGates: { ...approved, [id]: 'OPEN' }, independentSignoffs: signed, releaseProhibitions: clear }).verdict, 'NO_GO', `${id} OPEN must be NO_GO`)
  }
  for (const id of INDEPENDENT_SIGNOFF_GATES) {
    assert.equal(goNoGo({ readiness: ready, humanGates: approved, independentSignoffs: { ...signed, [id]: 'OPEN' }, releaseProhibitions: clear }).verdict, 'NO_GO', `${id} sign-off OPEN must be NO_GO`)
  }
  for (const id of RELEASE_PROHIBITIONS) assert.equal(goNoGo({ readiness: ready, humanGates: approved, independentSignoffs: signed, releaseProhibitions: { ...clear, [id]: 'PRESENT' } }).verdict, 'NO_GO')
  // Unknown gate values are ignored (treated as OPEN), readiness gaps are reasons too.
  assert.equal(goNoGo({ readiness: ready, humanGates: { ...approved, 'HA-C001': 'yes please' }, independentSignoffs: signed }).verdict, 'NO_GO')
  const partial = goNoGo({ readiness: readiness({ env: ALL_FLAGS, stage: 'WIDER_RELEASE', checks: { ...ALL_READY, worker: null } }), humanGates: approved, independentSignoffs: signed, releaseProhibitions: clear })
  assert.deepEqual(partial.reasons, ['UNVERIFIED:WORKER_REACHABILITY'])
  assert.equal(goNoGo({}).verdict, 'NO_GO')
  assert.equal(goNoGo({ readiness: readiness({ env: {}, stage: 'LOCAL_CI', checks: { ...ALL_READY, contentState: 'DRAFT' } }), humanGates: {} }).verdict, 'GO', 'LOCAL_CI has no human gates')
})

// ── diagnostic script integration ────────────────────────────────────────────
test('P10.2: check-experience-baseline reports release readiness per stage without collapsing UNVERIFIED and refuses bad --stage values', async () => {
  const { runDiagnostic, baselineReport } = await import('../../scripts/check-experience-baseline.mjs')
  const out = baselineReport({ DATABASE_URL: 'private-url' })
  assert.equal(out.release.stage, 'LOCAL_CI')
  for (const c of ['COMPATIBLE_PLAYER', 'EVALUATOR', 'PUBLICATION', 'APPROVED_CONTENT', 'WORKER_REACHABILITY', 'DURABLE_WRITER']) assert.equal(out.release.checks[c], 'UNVERIFIED')
  assert.equal(out.release.allocatable, false)
  assert.equal(out.release.schemaCompatibility, 'UNVERIFIED')
  assert.doesNotMatch(JSON.stringify(out), /private-/)
  const lines = []
  assert.equal(await runDiagnostic({ args: ['--stage', 'WIDER_RELEASE'], env: {}, write: (l) => lines.push(l) }), 1)
  const parsed = JSON.parse(lines[0])
  assert.equal(parsed.release.stage, 'WIDER_RELEASE')
  assert.ok(parsed.release.blockerIds.includes('RDY_FLAG_OFF_PRISM_APP_SHELL_V3'))
  assert.equal(parsed.database.status, 'UNVERIFIED')
  for (const args of [['--stage'], ['--stage', 'prod'], ['--stage', 'LOCAL_CI', '--stage', 'WIDER_RELEASE'], ['--stage', 'postgres://private']]) {
    const bad = []
    assert.equal(await runDiagnostic({ args, env: {}, write: (l) => bad.push(l) }), 1)
    assert.equal(JSON.parse(bad[0]).database.code, 'DIAGNOSTIC_INVALID_ARGUMENTS')
    assert.doesNotMatch(bad[0], /private/)
  }
})

test('developmental pilot decisions defer paid, preparation, Campus and growth without waiving applicable owner approvals', () => {
  const approved = Object.fromEntries(HUMAN_GATES.map((id) => [id, 'APPROVED']))
  const signed = Object.fromEntries(INDEPENDENT_SIGNOFF_GATES.map((id) => [id, 'APPROVED']))
  const clear = Object.fromEntries(RELEASE_PROHIBITIONS.map((id) => [id, 'CLEAR']))
  const coreFlags = { ...ALL_FLAGS, PRISM_CAMPUS_ENABLED: 'false', PRISM_PREPARATION_V1: 'false', PRISM_GROWTH_ENABLED: 'false' }
  const pilot = {
    env: coreFlags,
    readiness: readiness({ env: coreFlags, stage: 'EXTERNAL_PILOT', checks: { ...ALL_READY, contentState: 'APPROVED_FOR_PILOT' } }),
    componentChecks: { SCOPED_HISTORY: true, APPROVED_PRACTICE_CONTENT: true },
    humanGates: { ...approved, 'HA-C004': 'OPEN', 'HA-C006': 'OPEN', 'HA-C008': 'OPEN', 'HA-C010': 'OPEN', 'HA-C011': 'OPEN' },
    independentSignoffs: signed, releaseProhibitions: clear,
  }
  const decision = scopedReleaseDecisions(pilot)
  assert.equal(decision.verdict, 'GO', 'no price, comparability or Campus approval is required for an unpaid personal developmental scope')
  assert.equal(decision.activationAuthorized, false, 'a diagnostic result does not authorize deployment or flag activation')
  assert.deepEqual(decision.components.filter((c) => c.status === 'DEFERRED').map((c) => c.id), ['PRIVATE_PREPARATION', 'APPROVED_PAID_PACKAGES', 'CAMPUS', 'GROWTH'])
  assert.match(decision.scopeBoundary, /No paid offers, formal longitudinal growth, employment prediction/)
  for (const owner of INDEPENDENT_SIGNOFF_GATES) {
    const open = scopedReleaseDecisions({ ...pilot, independentSignoffs: { ...signed, [owner]: 'OPEN' } })
    assert.equal(open.verdict, 'NO_GO', `${owner} must actually approve this limited scope`)
  }
  const notApplicable = scopedReleaseDecisions({ ...pilot, humanGates: { ...pilot.humanGates, 'HA-C003': 'NOT_APPLICABLE' } })
  assert.equal(notApplicable.verdict, 'NO_GO', 'scope deferral does not excuse required scenario approval')
  const noPractice = scopedReleaseDecisions({ ...pilot, componentChecks: { SCOPED_HISTORY: true, APPROVED_PRACTICE_CONTENT: false } })
  assert.ok(noPractice.reasons.includes('NOT_READY:APPROVED_PRACTICE_CONTENT'))
  const leakedGrowth = scopedReleaseDecisions({ ...pilot, env: { ...coreFlags, PRISM_GROWTH_ENABLED: 'true' } })
  assert.ok(leakedGrowth.reasons.includes('OUT_OF_SCOPE_FLAG_ON:PRISM_GROWTH_ENABLED'))
  const leakedExtras = scopedReleaseDecisions({ ...pilot, env: { ...coreFlags, PRISM_ROLE_EXPLORATION_V2: 'true', PRISM_CAMPUS_ANALYTICS: 'true' } })
  assert.ok(leakedExtras.reasons.includes('OUT_OF_SCOPE_FLAG_ON:PRISM_ROLE_EXPLORATION_V2'))
  assert.ok(leakedExtras.reasons.includes('OUT_OF_SCOPE_FLAG_ON:PRISM_CAMPUS_ANALYTICS'))
  const draft = scopedReleaseDecisions({ ...pilot, readiness: readiness({ env: coreFlags, stage: 'LOCAL_CI', checks: { ...ALL_READY, contentState: 'DRAFT' } }) })
  assert.ok(draft.reasons.includes('NOT_READY:APPROVED_CONTENT'), 'LOCAL_CI draft acceptance cannot be promoted to a developmental pilot')
  const unrecordedContent = scopedReleaseDecisions({ ...pilot, readiness: null, componentChecks: { ...pilot.componentChecks, APPROVED_CONTENT: true } })
  assert.ok(unrecordedContent.reasons.includes('UNVERIFIED:APPROVED_CONTENT'), 'a boolean alone cannot prove pilot-approved content state')
  decision.components[0].ownerRoles.length = 0
  assert.ok(scopedReleaseDecisions({ ...pilot, independentSignoffs: { ...signed, ENGINEERING: 'OPEN' } }).reasons.includes('INDEPENDENT_SIGNOFF_OPEN:ENGINEERING'), 'editing a diagnostic does not edit gate requirements')
  const paid = scopedReleaseDecisions({ ...pilot, scope: 'PAID_PILOT' })
  assert.equal(paid.verdict, 'NO_GO')
  assert.ok(paid.reasons.includes('HUMAN_GATE_OPEN:HA-C006'))
  assert.ok(paid.reasons.includes('UNVERIFIED:PAID_OFFER_READY'))
  const growth = scopedReleaseDecisions({
    ...pilot, scope: 'FULL_RELEASE',
    env: { ...coreFlags, PRISM_GROWTH_ENABLED: 'true' },
    componentChecks: { ...pilot.componentChecks, APPROVED_FORM_COMPARABILITY: false },
  }).components.find((c) => c.id === 'GROWTH')
  assert.equal(growth.status, 'NO_GO')
  assert.ok(growth.reasons.includes('NOT_READY:APPROVED_FORM_COMPARABILITY'))
  assert.ok(growth.reasons.includes('HUMAN_GATE_OPEN:HA-C004'))
  assert.equal(scopedReleaseDecisions().verdict, 'NO_GO')
})

test('basic personal navigation does not depend on evaluator, practice, paid, Campus or growth activation', () => {
  const result = scopedReleaseDecisions({
    scope: 'PERSONAL_NAVIGATION', env: { PRISM_APP_SHELL_V3: 'true' },
    componentChecks: { SCOPED_HISTORY: true },
    humanGates: Object.fromEntries(['HA-C001', 'HA-C005', 'HA-C007', 'HA-C012', 'HA-C013'].map((id) => [id, 'APPROVED'])),
    independentSignoffs: { ENGINEERING: 'APPROVED', SECURITY_PRIVACY: 'APPROVED', OPERATIONS: 'APPROVED' },
    releaseProhibitions: Object.fromEntries(RELEASE_PROHIBITIONS.slice(0, 4).map((id) => [id, 'CLEAR'])),
  })
  assert.equal(result.verdict, 'GO')
  assert.equal(result.components.filter((c) => c.status === 'GO').length, 1)
  assert.ok(result.components.slice(1).every((c) => c.status === 'DEFERRED'))
  assert.equal(result.activationAuthorized, false)
  assert.deepEqual(Object.keys(RELEASE_SCOPES), ['PERSONAL_NAVIGATION', 'DEVELOPMENTAL_PILOT', 'PAID_PILOT', 'FULL_RELEASE'])
})

test('read-only scope diagnostic emits per-component decisions and refuses unknown or repeated scopes', async () => {
  const { runDiagnostic } = await import('../../scripts/check-experience-baseline.mjs')
  const lines = []
  const env = { PRISM_APP_SHELL_V3: 'true', JWT_SECRET: 'must-not-leak' }
  const before = { ...env }
  await runDiagnostic({ args: ['--scope', 'PERSONAL_NAVIGATION'], env, write: (line) => lines.push(line) })
  const out = JSON.parse(lines[0])
  assert.equal(out.release.scopeDecision.scope, 'PERSONAL_NAVIGATION')
  assert.equal(out.release.scopeDecision.verdict, 'NO_GO', 'schema presence is not an independent owner sign-off')
  assert.ok(out.release.scopeDecision.components.slice(1).every((c) => c.status === 'DEFERRED'))
  assert.deepEqual(env, before, 'diagnostics never enable flags')
  assert.doesNotMatch(lines[0], /must-not-leak/)
  for (const args of [['--scope', 'bogus'], ['--scope'], ['--scope', 'FULL_RELEASE', '--scope', 'PERSONAL_NAVIGATION']]) {
    const errors = []
    assert.equal(await runDiagnostic({ args, env: {}, write: (line) => errors.push(line) }), 1)
    assert.equal(JSON.parse(errors[0]).database.code, 'DIAGNOSTIC_INVALID_ARGUMENTS')
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
