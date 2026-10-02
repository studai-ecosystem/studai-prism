// P10.2 — versioned release configuration. Compatible deployment is separate
// from NEW-run activation: a build may be deployed dark, but a new universal/
// draft run is allocated only when the stage's flag set AND readiness checks
// are READY. UNVERIFIED is never collapsed into READY; this module only reads
// the inputs it is given (it never assigns process.env, never probes a secret).
import { ApiError } from '../http/errors.js'
import { CONTENT_STATES } from '../content/versions.js'

export const RELEASE_STAGES = Object.freeze(['LOCAL', 'STAGING', 'INTERNAL_CANARY', 'EXTERNAL_PILOT', 'WIDER'])
export const CHECK_STATES = Object.freeze(['READY', 'NOT_READY', 'UNVERIFIED'])
export const READINESS_CHECKS = Object.freeze([
  'COMPATIBLE_PLAYER', 'DURABLE_WRITER', 'EVALUATOR', 'PUBLICATION', 'APPROVED_CONTENT', 'WORKER_REACHABILITY',
])
// The lowest migration a universal/draft run needs (actions, jobs, erasure markers).
export const REQUIRED_MIGRATION_FLOOR = '0040'

const CORE_CHAIN = ['PRISM_ASSESSMENT_WORKSPACE_V3', 'PRISM_STUDENT_REPORT_V3', 'PRISM_EVIDENCE_FAIL_CLOSED']
const ALL_CHECKS = [...READINESS_CHECKS]
const freeze = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? Object.freeze([...v]) : v])))

export const RELEASE_CONFIG = Object.freeze({
  version: 1,
  // Flags that are never part of a stage's required set: growth stays
  // independently disabled until equivalence/interpretation are approved.
  neverRequired: Object.freeze(['PRISM_GROWTH_ENABLED']),
  stages: Object.freeze({
    // Disposable synthetic/draft data; the in-process worker is acceptable.
    LOCAL: freeze({ requiredFlags: [], requiredChecks: ALL_CHECKS.filter((c) => c !== 'WORKER_REACHABILITY'), minimumContentState: 'DRAFT', humanGates: [] }),
    // Approved synthetic/consented test data and spend.
    STAGING: freeze({ requiredFlags: CORE_CHAIN, requiredChecks: ALL_CHECKS, minimumContentState: 'DRAFT', humanGates: ['HA-C007'] }),
    // Authorized testers, approved pilot content.
    INTERNAL_CANARY: freeze({ requiredFlags: ['PRISM_APP_SHELL_V3', ...CORE_CHAIN], requiredChecks: ALL_CHECKS, minimumContentState: 'APPROVED_FOR_PILOT', humanGates: ['HA-C001', 'HA-C003', 'HA-C007'] }),
    // Consenting target users after content/privacy/security/measurement gates.
    EXTERNAL_PILOT: freeze({ requiredFlags: ['PRISM_APP_SHELL_V3', ...CORE_CHAIN, 'PRISM_DEVELOPMENT_V2'], requiredChecks: ALL_CHECKS, minimumContentState: 'APPROVED_FOR_PILOT', humanGates: ['HA-C001', 'HA-C002', 'HA-C003', 'HA-C005', 'HA-C007', 'HA-C009', 'HA-C012', 'HA-C013'] }),
    // Own intended-use and support readiness.
    WIDER: freeze({ requiredFlags: ['PRISM_APP_SHELL_V3', ...CORE_CHAIN, 'PRISM_DEVELOPMENT_V2'], requiredChecks: ALL_CHECKS, minimumContentState: 'APPROVED_FOR_INTENDED_USE', humanGates: ['HA-C001', 'HA-C002', 'HA-C003', 'HA-C005', 'HA-C007', 'HA-C008', 'HA-C009', 'HA-C010', 'HA-C012', 'HA-C013'] }),
  }),
})

export function stageConfig(stage) {
  const key = typeof stage === 'string' ? stage.toUpperCase() : ''
  return RELEASE_CONFIG.stages[key] ? { stage: key, ...RELEASE_CONFIG.stages[key] } : null
}

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
export function readiness({ env = {}, stage = 'LOCAL', checks = {} } = {}) {
  const cfg = stageConfig(stage) || stageConfig('LOCAL')
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
    ...missingFlags.map((key) => `FLAG_OFF:${key}`),
    ...cfg.requiredChecks.filter((c) => verdicts[c].state !== 'READY').map((c) => `${verdicts[c].state}:${c}`),
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
    missingFlags: [...result.flags.missing],
    checks: Object.fromEntries(Object.entries(result.checks).map(([k, v]) => [k, v.state])),
    blockers: [...result.blockers],
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
export function createReleaseGate({ env = process.env, stage = env.PRISM_RELEASE_STAGE || 'LOCAL', probes = {} } = {}) {
  const resolvedStage = stageConfig(stage)?.stage || 'LOCAL'
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
