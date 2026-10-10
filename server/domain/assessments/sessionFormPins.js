// PROD-READY Phase 3: record the assessment form of sessions created before
// the store recorded it at creation (v1_sessions.assessment_form_id, 0057).
// Migration 0057 already backfilled from evidence units; this pass covers the
// rest with the catalog as it is TODAY — run it before any scenario-bank
// version bump, so the bump cannot remap those sessions afterwards. Values
// are only ever written where the column is NULL (never changed).
import { query } from '../../db/pool.js'
import { buildCatalog, formForSession } from './catalog.js'

const EVIDENCE_BACKFILL = `
  UPDATE v1_sessions s SET assessment_form_id = u.form_id
    FROM (SELECT session_id, min(assessment_form_id) AS form_id FROM behavioral_evidence_units
           WHERE assessment_form_id IS NOT NULL GROUP BY session_id
          HAVING count(DISTINCT assessment_form_id) = 1) u
   WHERE s.session_id = u.session_id AND s.assessment_form_id IS NULL`

export async function pinSessionForms({ dryRun = true, scenarioSource, run = query, batch = 500 } = {}) {
  if (typeof scenarioSource !== 'function') throw new Error('scenarioSource is required')
  const catalog = buildCatalog(await scenarioSource())
  const report = { dryRun, catalogVersion: catalog.version, fromEvidence: 0, fromCatalog: 0, unresolved: 0, byForm: {} }
  if (dryRun) {
    const { rows } = await run(`SELECT count(*)::int AS n FROM v1_sessions s WHERE s.assessment_form_id IS NULL AND EXISTS (
      SELECT 1 FROM behavioral_evidence_units u WHERE u.session_id = s.session_id AND u.assessment_form_id IS NOT NULL)`)
    report.fromEvidenceCandidates = rows[0].n
  } else {
    report.fromEvidence = (await run(EVIDENCE_BACKFILL)).rowCount
  }
  let after = ''
  for (;;) {
    const { rows } = await run(
      `SELECT session_id, scenario_id FROM v1_sessions WHERE assessment_form_id IS NULL AND session_id > $1 ORDER BY session_id LIMIT $2`,
      [after, batch],
    )
    if (!rows.length) break
    after = rows[rows.length - 1].session_id
    for (const row of rows) {
      const form = formForSession(catalog, row.scenario_id)
      if (!form) { report.unresolved += 1; continue }
      report.byForm[form.id] = (report.byForm[form.id] || 0) + 1
      report.fromCatalog += 1
      if (!dryRun) {
        await run('UPDATE v1_sessions SET assessment_form_id = $2 WHERE session_id = $1 AND assessment_form_id IS NULL', [row.session_id, form.id])
      }
    }
  }
  return report
}
