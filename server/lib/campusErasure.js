// Erasure cascade for the Campus/V3 store (SECURITY_REVIEW S8; P1.7).
// The v1 store and telemetry cascades never covered the V3 tables that hold the
// candidate's own words: client-event receipts, artifact versions, strict
// evidence units, report versions, share grants and practice attempts. This
// removes them in one sweep and leaves an erasure marker so a late worker can
// never write an erased session back. Pure deletes: no scoring, no retention
// policy change, no account deletion (privacyPlanner owns those decisions).
import { createHash } from 'node:crypto'
import { isDbConfigured, query, getPool } from '../db/pool.js'
import { withTransaction } from '../domain/campusStore/pgUtil.js'
import { lockPublication } from '../domain/assessments/publicationFence.js'

// [table, column]. Dependants first. Every delete tolerates a missing table
// (older schemas). Rating queue items are keyed by the one-way session ref the
// queue itself uses; the append-only ratings become orphans with no excerpt.
export const CAMPUS_CASCADE = Object.freeze([
  ['share_grant_resources', 'resource_id'],
  ['evidence_rating_items', 'session_ref'],
  ['behavioral_evidence_units', 'session_id'],
  ['assessment_client_events', 'session_id'],
  ['assessment_artifact_versions', 'session_id'],
  ['assessment_candidate_actions', 'session_id'],
  ['assessment_jobs', 'session_id'],
  ['student_report_versions', 'session_id'],
  ['assessment_session_scopes', 'session_id'],
])

const sessionRef = (sessionId) => createHash('sha256')
  .update(`session:${process.env.PRISM_RATING_REF_SALT || 'prism-rating-v1'}:${sessionId}`).digest('hex')

async function tableExists(name, run = query) {
  const r = await run('SELECT to_regclass($1) AS t', [`public.${name}`])
  return Boolean(r?.rows?.[0]?.t)
}

export async function eraseCampusSessionData(sessionId) {
  const counts = {}
  if (!isDbConfigured() || !sessionId) return counts
  // Commit the tombstone first. Even a subsequent deletion failure must not
  // leave a window in which an already computed worker result can reappear.
  await withTransaction(getPool, async (client) => {
    await lockPublication(client, sessionId)
    await client.query('INSERT INTO assessment_erasure_markers (session_id) VALUES ($1) ON CONFLICT (session_id) DO NOTHING', [sessionId])
  })
  counts.erasure_marker = 1
  return withTransaction(getPool, async (client) => {
        await lockPublication(client, sessionId)
        const run = client.query.bind(client)
        for (const [table, col] of CAMPUS_CASCADE) {
          if (!(await tableExists(table, run))) continue
          let sql = `DELETE FROM ${table} WHERE ${col} = $1`
          let param = sessionId
          if (table === 'evidence_rating_items') {
            // Ratings are append-only; detach them first so the FK permits the delete.
            if (await tableExists('evidence_unit_ratings', run)) await run(`DELETE FROM evidence_unit_ratings WHERE item_id IN (SELECT id FROM evidence_rating_items WHERE session_ref = $1)`, [sessionRef(sessionId)])
            param = sessionRef(sessionId)
          }
          if (table === 'share_grant_resources') {
            sql = `DELETE FROM share_grant_resources WHERE resource_type = 'ASSESSMENT_REPORT' AND resource_id = $1`
          }
          const r = await run(sql, [param])
          counts[table] = r.rowCount
        }
        // Grants left without any resource are revoked outright (nothing to share).
        if (await tableExists('share_grants', run) && await tableExists('share_grant_resources', run)) {
          const r = await run(
            `UPDATE share_grants SET revoked_at = COALESCE(revoked_at, now())
             WHERE revoked_at IS NULL AND id NOT IN (SELECT share_grant_id FROM share_grant_resources)`,
          )
          counts.share_grants_revoked = r.rowCount
        }
        return counts
  })
}

export async function isErased(sessionId) {
  if (!isDbConfigured() || !sessionId) return false
  const r = await query('SELECT 1 FROM assessment_erasure_markers WHERE session_id = $1', [sessionId])
  return Boolean(r?.rows?.length)
}
