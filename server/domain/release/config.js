// P10.2 — versioned release configuration. Compatible deployment is separate
// from NEW-run activation: a build may be deployed dark, but a new universal/
// draft run is allocated only when the stage's flag set AND readiness checks
// are READY. UNVERIFIED is never collapsed into READY; this module only reads
// the inputs it is given (it never assigns process.env, never probes a secret).
import { ApiError } from '../http/errors.js'
import { CONTENT_STATES } from '../content/versions.js'
import { RELEASE_CONFIG_VERSION } from './version.js'

export const RELEASE_STAGES = Object.freeze(['LOCAL_CI', 'STAGING', 'INTERNAL_CANARY', 'EXTERNAL_PILOT', 'WIDER_RELEASE'])
export const RELEASE_STAGE_ALIASES = Object.freeze({ LOCAL: 'LOCAL_CI', WIDER: 'WIDER_RELEASE' })
export const CHECK_STATES = Object.freeze(['READY', 'NOT_READY', 'UNVERIFIED'])
export const READINESS_CHECKS = Object.freeze([
  'COMPATIBLE_PLAYER', 'DURABLE_WRITER', 'EVALUATOR', 'PUBLICATION', 'APPROVED_CONTENT', 'WORKER_REACHABILITY',
])
// Accepted-batch/publication receipts and frozen rater context require 0054.
export const REQUIRED_MIGRATION_FLOOR = '0054'

const CORE_CHAIN = ['PRISM_ASSESSMENT_WORKSPACE_V3', 'PRISM_STUDENT_REPORT_V3', 'PRISM_EVIDENCE_FAIL_CLOSED']
const ALL_CHECKS = [...READINESS_CHECKS]
const freeze = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? Object.freeze([...v]) : v])))

export const RELEASE_CONFIG = Object.freeze({
  version: RELEASE_CONFIG_VERSION,
  components: Object.freeze({
    PERSONAL_HOME_HISTORY: freeze({ dependsOn: ['APP_SHELL', 'SCOPED_HISTORY'] }),
    PLAYER_EVIDENCE_REPORT: freeze({ dependsOn: ['ASSESSMENT_WORKSPACE', 'DURABLE_WRITER', 'EVALUATOR', 'PUBLICATION'] }),
    REVIEWED_PRACTICE: freeze({ dependsOn: ['PLAYER_EVIDENCE_REPORT', 'APPROVED_PRACTICE_CONTENT'] }),
    PRIVATE_PREPARATION: freeze({ dependsOn: ['PERSONAL_HOME_HISTORY', 'PRIVACY_ERASURE_APPROVAL'] }),
    APPROVED_PAID_PACKAGES: freeze({ dependsOn: ['PLAYER_EVIDENCE_REPORT', 'REVIEWED_PRACTICE', 'APPROVED_RECOVERY_POLICY'] }),
    CAMPUS: freeze({ dependsOn: ['PLAYER_EVIDENCE_REPORT', 'CAMPUS_PRIVACY_ERASURE_APPROVAL'] }),
    GROWTH: freeze({ dependsOn: ['PLAYER_EVIDENCE_REPORT', 'APPROVED_FORM_COMPARABILITY'] }),
  }),
  activationOrder: Object.freeze([
    'PERSONAL_HOME_HISTORY',
    'PLAYER_EVIDENCE_REPORT',
    'REVIEWED_PRACTICE',
    'PRIVATE_PREPARATION',
    'APPROVED_PAID_PACKAGES',
    'CAMPUS',
    'GROWTH',
  ]),
  // Flags that are never part of a stage's required set: growth stays
  // independently disabled until equivalence/interpretation are approved.
  neverRequired: Object.freeze(['PRISM_GROWTH_ENABLED']),
  stages: Object.freeze({
    // Disposable synthetic/draft data; the in-process worker is acceptable.
    LOCAL_CI: freeze({ requiredFlags: [], requiredChecks: ALL_CHECKS.filter((c) => c !== 'WORKER_REACHABILITY'), minimumContentState: 'DRAFT', humanGates: [] }),
    // Approved synthetic/consented test data and spend.
    STAGING: freeze({ requiredFlags: CORE_CHAIN, requiredChecks: ALL_CHECKS, minimumContentState: 'DRAFT', humanGates: ['HA-C007'] }),
    // Authorized testers, approved pilot content.
    INTERNAL_CANARY: freeze({ requiredFlags: ['PRISM_APP_SHELL_V3', ...CORE_CHAIN], requiredChecks: ALL_CHECKS, minimumContentState: 'APPROVED_FOR_PILOT', humanGates: ['HA-C001', 'HA-C003', 'HA-C007'] }),
    // Consenting target users after content/privacy/security/measurement gates.
    EXTERNAL_PILOT: freeze({ requiredFlags: ['PRISM_APP_SHELL_V3', ...CORE_CHAIN, 'PRISM_DEVELOPMENT_V2'], requiredChecks: ALL_CHECKS, minimumContentState: 'APPROVED_FOR_PILOT', humanGates: ['HA-C001', 'HA-C002', 'HA-C003', 'HA-C005', 'HA-C007', 'HA-C009', 'HA-C012', 'HA-C013'] }),
    // Own intended-use and support readiness.
    WIDER_RELEASE: freeze({ requiredFlags: ['PRISM_APP_SHELL_V3', ...CORE_CHAIN, 'PRISM_DEVELOPMENT_V2'], requiredChecks: ALL_CHECKS, minimumContentState: 'APPROVED_FOR_INTENDED_USE', humanGates: ['HA-C001', 'HA-C002', 'HA-C003', 'HA-C005', 'HA-C007', 'HA-C008', 'HA-C009', 'HA-C010', 'HA-C012', 'HA-C013'] }),
  }),
})

export function stageConfig(stage) {
  const requested = typeof stage === 'string' ? stage.toUpperCase() : ''
  const key = RELEASE_STAGE_ALIASES[requested] || requested
  return RELEASE_CONFIG.stages[key] ? { stage: key, ...RELEASE_CONFIG.stages[key] } : null
}

export const readinessBlockerId = (state, check) => `RDY_${state}_${check}`
export const flagBlockerId = (key) => `RDY_FLAG_OFF_${key}`

const tri = (value, detail) => ({
  state: value === true ? 'READY' : value === false ? 'NOT_READY' : 'UNVERIFIED',
  ...(detail === undefined ? {} : { detail }),
})
const rank = (state) => CONTENT_STATES.indexOf(state)

function contentCheck(contentState, minimum) {
  if (contentState == null) return tri(null, { minimum })
  if (!CONTENT_STATES.includes(contentState)) return tri(false, { contentState: 'UNKNOWN', minimum })
  if (contentState === 'RETIRED') return tri(false, { contentState, minimum })
  return tri(rank(contentState) >= rank(minimum), { contentState, minimum })
}

function migrationsCheck(applied) {
  if (!Array.isArray(applied)) return tri(null, { floor: REQUIRED_MIGRATION_FLOOR })
  const head = applied.map((n) => String(n).slice(0, 4)).filter((n) => /^\d{4}$/.test(n)).sort().at(-1) || null
  return tri(head !== null && head >= REQUIRED_MIGRATION_FLOOR, { head, floor: REQUIRED_MIGRATION_FLOOR })
}

/**
 * readiness({ env, stage, checks }) → pure per-check verdicts.
 * `checks` carries raw probe facts, each true | false | null/undefined:
 *   player (compatible player/method for the pinned snapshot), durableWriter
 *   (store carries actions/jobs/timing/opportunities), migrationsApplied
 *   (array of applied migration names, or null), evaluator, publication,
 *   contentState (CONTENT_STATES value or null), worker.
 * Nothing here reads secrets or learner data; `env` is used for flags only.
 */
export function readiness({ env = {}, stage = 'LOCAL_CI', checks = {} } = {}) {
  const cfg = stageConfig(stage) || stageConfig('LOCAL_CI')
  const flags = Object.fromEntries(cfg.requiredFlags.map((key) => [key, env[key] === 'true']))
  const missingFlags = cfg.requiredFlags.filter((key) => !flags[key])
  const durable = tri(checks.durableWriter)
  const migrations = migrationsCheck(checks.migrationsApplied)
  const writerState = durable.state === 'NOT_READY' || migrations.state === 'NOT_READY' ? 'NOT_READY'
    : durable.state === 'READY' && migrations.state === 'READY' ? 'READY' : 'UNVERIFIED'
  const verdicts = {
    COMPATIBLE_PLAYER: tri(checks.player),
    // Writer READY needs both the store surface and the schema floor; an
    // unprobed schema leaves the check UNVERIFIED rather than READY.
    DURABLE_WRITER: { state: writerState, detail: { store: durable.state, migrations: migrations.detail } },
    EVALUATOR: tri(checks.evaluator),
    PUBLICATION: tri(checks.publication),
    APPROVED_CONTENT: contentCheck(checks.contentState, cfg.minimumContentState),
    WORKER_REACHABILITY: tri(checks.worker),
  }
  const blockers = [
    ...missingFlags.map(flagBlockerId),
    ...cfg.requiredChecks.filter((c) => verdicts[c].state !== 'READY').map((c) => readinessBlockerId(verdicts[c].state, c)),
  ]
  return {
    configVersion: RELEASE_CONFIG.version,
    stage: cfg.stage,
    flags: { required: [...cfg.requiredFlags], effective: flags, missing: missingFlags },
    requiredChecks: [...cfg.requiredChecks],
    checks: verdicts,
    allocatable: blockers.length === 0,
    blockers,
  }
}

// Safe summary for error details / diagnostics: states only, no probe payloads.
export function summarize(result) {
  return {
    configVersion: result.configVersion,
    stage: result.stage,
    allocatable: result.allocatable === true,
    missingFlags: [...result.flags.missing],
    effectiveFlags: { ...result.flags.effective },
    checks: Object.fromEntries(Object.entries(result.checks).map(([k, v]) => [k, v.state])),
    blockerIds: [...result.blockers],
  }
}

export function assertAllocatable(result) {
  if (result?.allocatable === true) return result
  throw new ApiError('RUN_NOT_ALLOCATABLE', 'New assessment runs are not available right now. Nothing has been charged.', {
    status: 503, details: summarize(result || readiness()),
  })
}

/**
 * createReleaseGate({ env, stage, probes }) — binds readiness to runtime
 * probes. Each probe is sync or async and returns a raw fact (true/false/
 * null); a throwing probe counts as UNVERIFIED, never READY.
 */
export function createReleaseGate({ env = process.env, stage = env.PRISM_RELEASE_STAGE || 'LOCAL_CI', probes = {} } = {}) {
  const resolvedStage = stageConfig(stage)?.stage || 'LOCAL_CI'
  async function probe(name, context) {
    const fn = probes[name]
    if (typeof fn !== 'function') return null
    try { return await fn(context) } catch { return null }
  }
  async function compute(context = {}) {
    const names = ['player', 'durableWriter', 'migrationsApplied', 'evaluator', 'publication', 'contentState', 'worker']
    const facts = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await probe(n, context)])))
    return readiness({ env, stage: resolvedStage, checks: facts })
  }
  return {
    stage: resolvedStage,
    readiness: compute,
    async assertAllocatable(context = {}) { return assertAllocatable(await compute(context)) },
  }
}
