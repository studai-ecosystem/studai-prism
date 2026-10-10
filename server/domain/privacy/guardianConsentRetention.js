// Retention purge for under-18 guardian consent requests that were never
// verified (PROD-READY Phase 8; path dark behind PRISM_UNDER18_PATH).
//
// A request holds the guardian's email address. When it is never verified —
// DECLINED, EXPIRED, or still PENDING after its link expired — it is deleted
// N days after it ended. VERIFIED and WITHDRAWN records are the consent
// record of the learner's account and are deleted with the account.
//
// N = effective retention for the registry entity
// `guardian_consents_unverified` (rule + overrides, longest wins), falling
// back to GUARDIAN_CONSENT_UNVERIFIED_RETENTION_DAYS (PROVISIONAL, HA-003).
// Same discipline as accommodationRequestRetention.js: dry-run by default, a
// real run needs a dry-run receipt within 24 hours, refused under an entity
// legal hold, a retention_runs receipt every time; scheduled by the job
// runner only while PRISM_RETENTION_ENFORCEMENT is on.
import { randomUUID } from 'node:crypto'
import { isDbConfigured as defaultDbConfigured, query as defaultQuery } from '../../db/pool.js'
import {
  GUARDIAN_CONSENT_UNVERIFIED_ENTITY, GUARDIAN_CONSENT_UNVERIFIED_RETENTION_DAYS,
  effectiveRetentionDays as defaultEffectiveDays, holdCovering as defaultHoldCovering,
} from '../../lib/retentionEnforcement.js'

const DAY_MS = 24 * 60 * 60 * 1000
// $1 = cutoff. Ended = decided_at (DECLINED) or expires_at (EXPIRED / lapsed PENDING).
const ELIGIBLE = `FROM guardian_consents g
  WHERE (g.status = 'DECLINED' AND g.decided_at < $1)
     OR (g.status IN ('EXPIRED', 'PENDING') AND g.expires_at < $1)`

export async function purgeUnverifiedGuardianConsents({
  dryRun = true,
  now = new Date(),
  days = null,
  ranBy = null,
  query = defaultQuery,
  isDbConfigured = defaultDbConfigured,
  effectiveRetentionDays = defaultEffectiveDays,
  holdCovering = defaultHoldCovering,
} = {}) {
  const entity = GUARDIAN_CONSENT_UNVERIFIED_ENTITY
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
  const effective = Number.isFinite(days) && days > 0 ? days : ((await effectiveRetentionDays(entity)) ?? GUARDIAN_CONSENT_UNVERIFIED_RETENTION_DAYS)
  const cutoff = new Date(now.getTime() - effective * DAY_MS).toISOString()
  const matched = Number((await query(`SELECT count(*)::int AS n ${ELIGIBLE}`, [cutoff])).rows[0].n)
  let deleted = 0
  if (!dryRun && matched) {
    const r = await query(`DELETE FROM guardian_consents WHERE id IN (SELECT g.id ${ELIGIBLE})`, [cutoff])
    deleted = r.rowCount
  }
  const receipt = { entity, mode: dryRun ? 'dry_run' : 'enforce', effectiveDays: effective, provisional: true, cutoff, matched, deleted, at: now.toISOString() }
  await query(
    `INSERT INTO retention_runs (run_id, entity, mode, cutoff, matched, deleted, receipt, ran_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), entity, receipt.mode, cutoff, matched, deleted, JSON.stringify(receipt), ranBy],
  )
  return { ok: true, ...receipt }
}
