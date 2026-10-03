// P10.5 — rollback safety (pure). Rolling back a path used by active V3/
// universal runs is never a flag flip: new allocations stop first, active runs
// are drained on their pinned compatible version (never routed to the legacy
// player), readers/shares stay intact, and schema rollback is a separate
// review. Nothing here executes anything; operators follow the plan.
import { RELEASE_CONFIG } from './config.js'

export const ROLLBACK_ROLES = Object.freeze({
  STOP_NEW_STARTS: 'Release operator',
  DRAIN_ACTIVE_RUNS: 'Engineering lead',
  CUSTOMER_COMMUNICATION: 'Support owner',
  RECOVERY_DISPOSITION: 'Product/commercial owner',
  SCHEMA_REVIEW: 'Engineering lead + data owner',
  RESTART: 'Release operator + product owner',
})

// Flags whose disabling changes what an in-flight V3/universal run is served by.
export const ACTIVE_RUN_FLAGS = Object.freeze([
  'PRISM_ASSESSMENT_WORKSPACE_V3', 'PRISM_STUDENT_REPORT_V3', 'PRISM_EVIDENCE_FAIL_CLOSED', 'PRISM_APP_SHELL_V3',
])

const ACTIVE_STATES = new Set(['ALLOCATED', 'IN_PROGRESS', 'SCORING', 'EVALUATION_PENDING'])

export function isActiveV3Run(run) {
  if (!run) return false
  const universal = run.universal === true || Boolean(run.runPin) || run.engine === 'V3'
  const state = String(run.state || run.status || '').toUpperCase()
  return universal && (ACTIVE_STATES.has(state) || (!state && !run.completedAt))
}

export function countActiveV3Runs(activeRuns = []) {
  return (Array.isArray(activeRuns) ? activeRuns : []).filter(isActiveV3Run).length
}

/** canDisable(flag, activeRuns) → false while active V3 runs depend on the flag. */
export function canDisable(flag, activeRuns = []) {
  if (!ACTIVE_RUN_FLAGS.includes(flag)) return true
  return countActiveV3Runs(activeRuns) === 0
}

/**
 * rollbackPlan({ activeRuns, flags }) → ordered steps with owner roles.
 * `flags` is the effective flag map ({ KEY: boolean }); `activeRuns` a list of
 * run summaries (ids are opaque, never learner data).
 */
export function rollbackPlan({ activeRuns = [], flags = {} } = {}) {
  const active = countActiveV3Runs(activeRuns)
  const enabledActiveFlags = ACTIVE_RUN_FLAGS.filter((k) => flags[k] === true)
  const steps = [
    { order: 1, id: 'STOP_NEW_ALLOCATIONS', owner: ROLLBACK_ROLES.STOP_NEW_STARTS, action: 'Set the release stage so readiness reports NOT_READY for new runs (RUN_NOT_ALLOCATABLE); do not touch serving flags yet.', blocking: false },
    { order: 2, id: 'INVENTORY_ACTIVE_RUNS', owner: ROLLBACK_ROLES.DRAIN_ACTIVE_RUNS, action: 'List active V3/universal runs by pinned method/form/snapshot hash (ids only).', blocking: false, activeRuns: active },
    { order: 3, id: 'DRAIN_OR_PIN_ACTIVE_RUNS', owner: ROLLBACK_ROLES.DRAIN_ACTIVE_RUNS, action: active > 0 ? 'Keep serving pinned compatible versions until each run finishes or its deadline passes; never route an active run to the legacy player and never rerun Start.' : 'No active V3 runs: drain window may close.', blocking: active > 0 },
    { order: 4, id: 'PRESERVE_READERS_AND_SHARES', owner: ROLLBACK_ROLES.DRAIN_ACTIVE_RUNS, action: 'Keep /score, /report/:id/v2, /report/:id/employee, /shared/:token and V3 report readers available; approved share scope is unchanged.', blocking: false },
    { order: 5, id: 'DISABLE_SERVING_FLAGS', owner: ROLLBACK_ROLES.STOP_NEW_STARTS, action: enabledActiveFlags.length ? `Disable ${enabledActiveFlags.join(', ')} only when canDisable() is true for each.` : 'No active-run flags are enabled.', blocking: active > 0 && enabledActiveFlags.length > 0, flags: enabledActiveFlags.map((flag) => ({ flag, canDisable: canDisable(flag, activeRuns) })) },
    { order: 6, id: 'RECOVERY_DISPOSITION', owner: ROLLBACK_ROLES.RECOVERY_DISPOSITION, action: 'If safe continuation is impossible, preserve saved work and use the reviewed, auditable reissue/refund/review process; no automatic credits.', blocking: false },
    { order: 7, id: 'CUSTOMER_COMMUNICATION', owner: ROLLBACK_ROLES.CUSTOMER_COMMUNICATION, action: 'Tell affected learners what is preserved and what happens next, without session URLs or tokens.', blocking: false },
    { order: 8, id: 'PRESERVE_ERASURE_TOMBSTONES', owner: ROLLBACK_ROLES.SCHEMA_REVIEW, action: 'Keep queued/completed erasure tombstones and fencing checks active so late worker/model results cannot recreate erased evidence.', blocking: false },
    { order: 9, id: 'SCHEMA_ROLLBACK_SEPARATE_REVIEW', owner: ROLLBACK_ROLES.SCHEMA_REVIEW, action: 'Schema rollback is a separate review; never drop evidence/action/job tables as part of an application rollback.', blocking: false, separateReview: true },
    { order: 10, id: 'RESTART_AFTER_READINESS', owner: ROLLBACK_ROLES.RESTART, action: 'Restart new allocations only after readiness, compatibility, recovery disposition and communications are re-checked and recorded.', blocking: true },
  ]
  return {
    configVersion: RELEASE_CONFIG.version,
    activeV3Runs: active,
    safeToDisableNow: active === 0,
    steps,
  }
}
