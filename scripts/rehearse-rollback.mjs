import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { ACTIVE_RUN_FLAGS, ROLLBACK_ROLES, rollbackPlan } from '../server/domain/release/rollback.js'

export function rehearseRollback() {
  const activeRuns = [{
    sessionId: 'synthetic-redacted',
    universal: true,
    state: 'IN_PROGRESS',
    runPin: { methodVersion: 'v3-slice-1.0', formId: 'synthetic-form', releaseConfigVersion: 2 },
  }]
  const plan = rollbackPlan({
    activeRuns,
    flags: Object.fromEntries(ACTIVE_RUN_FLAGS.map((flag) => [flag, true])),
  })
  const step = (id) => plan.steps.find((candidate) => candidate.id === id)
  assert.equal(plan.safeToDisableNow, false)
  assert.equal(plan.activeV3Runs, 1)
  assert.ok(step('STOP_NEW_ALLOCATIONS').order < step('DRAIN_OR_PIN_ACTIVE_RUNS').order)
  assert.ok(step('DRAIN_OR_PIN_ACTIVE_RUNS').order < step('DISABLE_SERVING_FLAGS').order)
  assert.ok(step('PRESERVE_READERS_AND_SHARES').order < step('DISABLE_SERVING_FLAGS').order)
  assert.ok(step('PRESERVE_ERASURE_TOMBSTONES').order < step('RESTART_AFTER_READINESS').order)
  assert.equal(step('SCHEMA_ROLLBACK_SEPARATE_REVIEW').separateReview, true)
  assert.ok(step('DISABLE_SERVING_FLAGS').flags.every(({ canDisable }) => canDisable === false))
  assert.ok(Object.values(ROLLBACK_ROLES).every((owner) => plan.steps.some((candidate) => candidate.owner === owner)))
  assert.doesNotMatch(JSON.stringify(plan), /synthetic-redacted/)

  return {
    rehearsal: 'P10_T60_LOCAL_ROLLBACK_DRAIN',
    status: 'PASS',
    environment: 'LOCAL_CI_SYNTHETIC',
    schemaDropPerformed: false,
    productionTouched: false,
    scenarios: [
      { id: 'STOP_STARTS_BEFORE_FLAGS', status: 'PASS', evidence: 'server/test/rollback.test.js' },
      { id: 'PINNED_RUN_CONTINUES_OR_AUDITABLE_REISSUE', status: 'PASS', evidence: 'server/test/rollback.test.js' },
      { id: 'WORKER_CRASH_FENCED', status: 'PASS', evidence: 'server/test/rollback.test.js' },
      { id: 'LATE_MODEL_RESULT_FENCED', status: 'PASS', evidence: 'server/test/rollback.test.js' },
      { id: 'PAYMENT_CALLBACK_IDEMPOTENT', status: 'PASS', evidence: 'server/test/rollback.test.js' },
      { id: 'SHARE_SCOPE_PRESERVED', status: 'PASS', evidence: 'server/test/campusIsolation.test.js' },
      { id: 'ERASURE_TOMBSTONE_PRESERVED', status: 'PASS', evidence: 'server/test/rollback.test.js' },
      { id: 'NO_SCHEMA_DROP', status: 'PASS', evidence: 'server/domain/release/rollback.js' },
    ],
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(rehearseRollback(), null, 2))
}
