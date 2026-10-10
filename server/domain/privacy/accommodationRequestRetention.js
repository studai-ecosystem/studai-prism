// Retention purge for pre-start accommodation requests whose assessment never
// started (PROD-READY Phase 5; risk row from Phase 4, P44).
//
// A request made before the start is linked to its session when the
// assessment starts and is then erased with the session. One whose
// assessment never starts would otherwise stay until account erasure. Its
// needs text may reference disability (ACCOMMODATIONS_POLICY_v1 §3), so it is
// deleted N days after the assignment window ended (or the assignment was
// closed or cancelled) while it is still unlinked (session_id IS NULL).
//
// N = effective retention for the registry entity
// `accommodation_requests_unstarted` (rule + overrides, longest wins),
// falling back to the governed constant
// ACCOMMODATION_REQUEST_UNSTARTED_RETENTION_DAYS (PROVISIONAL, HA-003).
//
// Same discipline as importRowRetention.js: dry-run is the default and
// mutates nothing; a real run needs a dry-run receipt within 24 hours and is
// refused under an entity legal hold; every run leaves a retention_runs
// receipt. Scheduled only by the job runner, and only while
// PRISM_RETENTION_ENFORCEMENT is on (HA-003).
import { randomUUID } from 'node:crypto'
import { isDbConfigured as defaultDbConfigured, query as defaultQuery } from '../../db/pool.js'
import {
  ACCOMMODATION_REQUEST_UNSTARTED_ENTITY, ACCOMMODATION_REQUEST_UNSTARTED_RETENTION_DAYS,
  effectiveRetentionDays as defaultEffectiveDays, holdCovering as defaultHoldCovering,
} from '../../lib/retentionEnforcement.js'

const DAY_MS = 24 * 60 * 60 * 1000
const ELIGIBLE = `FROM assessment_accommodation_requests r JOIN assessment_assignments a ON a.id = r.assignment_id
  WHERE r.session_id IS NULL
    AND ((a.window_end IS NOT NULL AND a.window_end < $1) OR (a.status IN ('CLOSED', 'CANCELLED') AND a.updated_at < $1))`

export async function purgeUnstartedAccommodationRequests({
  dryRun = true,
  now = new Date(),
  days = null,
  ranBy = null,
  query = defaultQuery,
  isDbConfigured = defaultDbConfigured,
  effectiveRetentionDays = defaultEffectiveDays,
  holdCovering = defaultHoldCovering,
} = {}) {
  const entity = ACCOMMODATION_REQUEST_UNSTARTED_ENTITY
  if (!isDbConfigured()) return { ok: true, entity, mode: dryRun ? 'dry_run' : 'enforce', matched: 0, deleted: 0, skipped: 'NO_DATABASE' }
  if (!dryRun) {
    const hold = await holdCovering({ entity })
    if (hold) return { ok: false, error: 'ENTITY_LEGAL_HOLD', holdId: hold.hold_id }
    const recent = await query(
      `SELECT 1 FROM retention_runs WHERE entity = $1 AND mode = 'dry_run' AND created_at > $2 LIMIT 1`,
      [entity, new Date(now.getTime() - DAY_MS).toISOString()],
    )
    if (!recent.rows.length) return { ok: false, error: 'DRY_RUN_REQUIRED' }
  }
  const effective = Number.isFinite(days) && days > 0 ? days : ((await effectiveRetentionDays(entity)) ?? ACCOMMODATION_REQUEST_UNSTARTED_RETENTION_DAYS)
  const cutoff = new Date(now.getTime() - effective * DAY_MS).toISOString()
  const matched = Number((await query(`SELECT count(*)::int AS n ${ELIGIBLE}`, [cutoff])).rows[0].n)
  let deleted = 0
  if (!dryRun && matched) {
    const r = await query(`DELETE FROM assessment_accommodation_requests WHERE id IN (SELECT r.id ${ELIGIBLE})`, [cutoff])
    deleted = r.rowCount
  }
  const receipt = { entity, mode: dryRun ? 'dry_run' : 'enforce', effectiveDays: effective, provisional: true, cutoff, matched, deleted, at: now.toISOString() }
  await query(
    `INSERT INTO retention_runs (run_id, entity, mode, cutoff, matched, deleted, receipt, ran_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), entity, receipt.mode, cutoff, matched, deleted, JSON.stringify(receipt), ranBy],
  )
  return { ok: true, ...receipt }
}
