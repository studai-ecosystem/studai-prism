// Retention purge for student_import_rows.raw (PROD-READY Phase 2, S8).
//
// A CSV import keeps the uploaded cells (emails, names, roll numbers) in
// student_import_rows.raw / .normalized so staff can preview and commit it.
// Once the job is COMMITTED (or CANCELLED) the cells are no longer read
// (a committed job replays from its commit key), so N days later they are
// cleared: raw becomes {"purged": true}, normalized NULL. Row numbers, the
// action, validation codes and outcomes stay (the job's audit counts).
//
// N = effective retention for the registry entity `student_import_rows_raw`
// (rule + contract overrides, longest wins), falling back to the governed
// constant IMPORT_ROW_RAW_RETENTION_DAYS (PROVISIONAL, HA-003).
//
// Same discipline as lib/retentionEnforcement.js: dry-run is the default and
// mutates nothing; a real run needs a dry-run receipt for the entity within
// 24 hours and is refused under an entity legal hold; every run leaves a
// retention_runs receipt. PROD-READY Phase 5 schedules it on the job runner
// (job `retention.import_rows`: a dry run, then the real run) only while
// PRISM_RETENTION_ENFORCEMENT is on (HA-003). The operator script is
// server/db/purgeImportRows.js.
import { randomUUID } from 'node:crypto'
import { isDbConfigured as defaultDbConfigured, query as defaultQuery } from '../../db/pool.js'
import {
  IMPORT_ROW_RAW_ENTITY, IMPORT_ROW_RAW_RETENTION_DAYS, effectiveRetentionDays as defaultEffectiveDays, holdCovering as defaultHoldCovering,
} from '../../lib/retentionEnforcement.js'

const DAY_MS = 24 * 60 * 60 * 1000
const ELIGIBLE = `FROM student_import_rows r JOIN student_import_jobs j ON j.id = r.job_id
  WHERE ((j.status = 'COMMITTED' AND j.committed_at < $1) OR (j.status = 'CANCELLED' AND j.created_at < $1))
    AND NOT (r.raw ? 'purged') AND NOT (r.raw ? 'erased')`

export async function purgeImportRowRaw({
  dryRun = true,
  now = new Date(),
  days = null,
  ranBy = null,
  query = defaultQuery,
  isDbConfigured = defaultDbConfigured,
  effectiveRetentionDays = defaultEffectiveDays,
  holdCovering = defaultHoldCovering,
} = {}) {
  // Import jobs exist only in the campus PostgreSQL store.
  if (!isDbConfigured()) return { ok: true, entity: IMPORT_ROW_RAW_ENTITY, mode: dryRun ? 'dry_run' : 'enforce', matched: 0, cleared: 0, skipped: 'NO_DATABASE' }
  if (!dryRun) {
    const hold = await holdCovering({ entity: IMPORT_ROW_RAW_ENTITY })
    if (hold) return { ok: false, error: 'ENTITY_LEGAL_HOLD', holdId: hold.hold_id }
    const recent = await query(
      `SELECT 1 FROM retention_runs WHERE entity = $1 AND mode = 'dry_run' AND created_at > $2 LIMIT 1`,
      [IMPORT_ROW_RAW_ENTITY, new Date(now.getTime() - DAY_MS).toISOString()],
    )
    if (!recent.rows.length) return { ok: false, error: 'DRY_RUN_REQUIRED' }
  }
  const effective = Number.isFinite(days) && days > 0 ? days : ((await effectiveRetentionDays(IMPORT_ROW_RAW_ENTITY)) ?? IMPORT_ROW_RAW_RETENTION_DAYS)
  const cutoff = new Date(now.getTime() - effective * DAY_MS).toISOString()
  const matched = Number((await query(`SELECT count(*)::int AS n ${ELIGIBLE}`, [cutoff])).rows[0].n)
  let cleared = 0
  if (!dryRun && matched) {
    const r = await query(
      `UPDATE student_import_rows SET raw = '{"purged": true}'::jsonb, normalized = NULL
        WHERE (job_id, row_number) IN (SELECT r.job_id, r.row_number ${ELIGIBLE})`,
      [cutoff],
    )
    cleared = r.rowCount
  }
  const receipt = { entity: IMPORT_ROW_RAW_ENTITY, mode: dryRun ? 'dry_run' : 'enforce', effectiveDays: effective, provisional: true, cutoff, matched, cleared, at: now.toISOString() }
  await query(
    `INSERT INTO retention_runs (run_id, entity, mode, cutoff, matched, deleted, receipt, ran_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), IMPORT_ROW_RAW_ENTITY, receipt.mode, cutoff, matched, cleared, JSON.stringify(receipt), ranBy],
  )
  return { ok: true, ...receipt }
}
