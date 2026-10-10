// Erasure cascade for the Campus/V3 store, per assessment session
// (SECURITY_REVIEW S8; P1.7; PROD-READY Phase 2).
// The v1 store and telemetry cascades never covered the V3 tables that hold the
// candidate's own words: client-event receipts, artifact versions, strict
// evidence units, report versions, share grants and practice attempts. This
// removes them in one transaction and leaves an erasure marker so a late
// worker can never write an erased session back.
//
// Phase 2 (registry: server/domain/privacy/personalDataRegistry.js):
//  - rating queue items are DETACHED, not deleted, when they carry ratings
//    (the ratings are append-only with ON DELETE RESTRICT, so the old
//    "delete the ratings first" path could never succeed);
//  - report review requests that carry an append-only reviewer decision keep
//    a pseudonymised row, and the report version they reference is scrubbed
//    instead of deleted (the request's FK would otherwise block the delete);
//  - session-keyed admin records, run timing, opportunities, growth
//    snapshots, development plans and demographics of the session go too.
// Account-level rows (memberships, consents, ...) are erased by
// server/domain/privacy/erasureCascade.js, which calls this per session.
import { createHash, createHmac } from 'node:crypto'
import { isDbConfigured, query, getPool } from '../db/pool.js'
import { withTransaction } from '../domain/campusStore/pgUtil.js'
import { lockPublication } from '../domain/assessments/publicationFence.js'
import { DEVELOPMENT_PSEUDONYM_KEY, assertErasureConfigured } from './erasureKey.js'

// Text written over learner words that must stay in an append-only row.
export const ERASED_TEXT = 'erased: removed on request'

// [table, column] the per-session cascade touches (documentation and the
// coverage test; the statements are below). Dependants first.
export const CAMPUS_CASCADE = Object.freeze([
  ['share_grant_resources', 'resource_id'],
  ['evidence_rating_items', 'session_ref'],
  ['behavioral_evidence_units', 'session_id'],
  ['assessment_client_events', 'session_id'],
  ['assessment_artifact_versions', 'session_id'],
  ['assessment_candidate_actions', 'session_id'],
  ['assessment_jobs', 'session_id'],
  ['report_review_decisions', 'review_id'],
  ['report_review_requests', 'session_id'],
  ['student_report_versions', 'session_id'],
  ['assessment_session_scopes', 'session_id'],
  ['assessment_run_timing', 'session_id'],
  ['assessment_opportunities', 'session_id'],
  ['capability_growth_snapshots', 'baseline_session_id'],
  ['development_plans', 'source_session_id'],
  ['candidate_demographics', 'session_id'],
  ['candidate_mission_attempts', 'session_id'],
  ['admin_session_states', 'session_id'],
  ['admin_dispute_workflow', 'session_id'],
  ['report_versions', 'session_id'],
  ['report_admin_states', 'session_id'],
  ['integrity_reviews', 'session_id'],
  ['admin_notes', 'entity_id'],
])

export const sessionRef = (sessionId) => createHash('sha256')
  .update(`session:${process.env.PRISM_RATING_REF_SALT || 'prism-rating-v1'}:${sessionId}`).digest('hex')

// Stable pseudonym for a person (audit actors, ledger owners). Keyed so the
// mapping cannot be recomputed without the server key.
//
// PROD-READY Phase 3: production fails closed without a real key
// (lib/erasureKey.js).
export { DEVELOPMENT_PSEUDONYM_KEY, MIN_PSEUDONYM_KEY_LENGTH, erasureKeyStatus, erasureNotConfiguredError, assertErasureConfigured } from './erasureKey.js'
const pseudonymKey = () => {
  assertErasureConfigured()
  return process.env.PRISM_ERASURE_PSEUDONYM_KEY || DEVELOPMENT_PSEUDONYM_KEY
}
export const pseudonymFor = (userId) => `erased:${createHmac('sha256', pseudonymKey()).update(`actor:${userId}`).digest('hex').slice(0, 24)}`
export const subjectRef = (userId) => createHmac('sha256', pseudonymKey()).update(`subject:${userId}`).digest('hex')
// Pseudonym for an erased session id where an append-only audit row names it
// (`erased:s<md5(salt || id)>`; the same formula runs in SQL with the salt).
export const sessionPseudonymSalt = () => createHmac('sha256', pseudonymKey()).update('session-salt').digest('hex')
export const sessionPseudonymFor = (sessionId) => `erased:s${createHash('md5').update(`${sessionPseudonymSalt()}${sessionId}`).digest('hex').slice(0, 24)}`

export async function tableExists(name, run = query) {
  const r = await run('SELECT to_regclass($1) AS t', [`public.${name}`])
  return Boolean(r?.rows?.[0]?.t)
}

export async function columnExists(table, column, run = query) {
  const r = await run('SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2', [table, column])
  return Boolean(r?.rows?.length)
}

// Allows the 0056 erasure guard to accept pseudonymising UPDATEs on the
// append-only tables for the rest of this transaction only.
export async function enableErasureWrites(run) {
  await run("SELECT set_config('prism.erasure', 'on', true)")
}

const rows = (r) => r?.rowCount ?? 0

// Statements of the per-session transaction, in order. Each returns its row count.
const SESSION_STATEMENTS = [
  ['share_grant_resources', (run, sid) => run(`DELETE FROM share_grant_resources WHERE resource_type = 'ASSESSMENT_REPORT' AND resource_id = $1`, [sid])],
  ['evidence_rating_items', async (run, sid) => {
    const ref = sessionRef(sid)
    const hasRatings = await tableExists('evidence_unit_ratings', run)
    const deleted = await run(
      hasRatings
        ? 'DELETE FROM evidence_rating_items i WHERE session_ref = $1 AND NOT EXISTS (SELECT 1 FROM evidence_unit_ratings r WHERE r.item_id = i.id)'
        : 'DELETE FROM evidence_rating_items WHERE session_ref = $1',
      [ref],
    )
    // Rated items stay as content-free shells: the ratings (append-only,
    // ON DELETE RESTRICT) keep their agreement statistics, nothing points back.
    const detached = await run(
      `UPDATE evidence_rating_items
          SET excerpt = $2,
              session_ref = encode(sha256(convert_to(gen_random_uuid()::text || id::text, 'UTF8')), 'hex'),
              evidence_ref = encode(sha256(convert_to(gen_random_uuid()::text || id::text || 'e', 'UTF8')), 'hex'),
              source_method_json = NULL
        WHERE session_ref = $1`,
      [ref, ERASED_TEXT],
    )
    return { rowCount: rows(deleted) + rows(detached) }
  }],
  ['behavioral_evidence_units', (run, sid) => run('DELETE FROM behavioral_evidence_units WHERE session_id = $1', [sid])],
  ['assessment_client_events', (run, sid) => run('DELETE FROM assessment_client_events WHERE session_id = $1', [sid])],
  ['assessment_artifact_versions', (run, sid) => run('DELETE FROM assessment_artifact_versions WHERE session_id = $1', [sid])],
  ['assessment_candidate_actions', (run, sid) => run('DELETE FROM assessment_candidate_actions WHERE session_id = $1', [sid])],
  ['assessment_jobs', (run, sid) => run('DELETE FROM assessment_jobs WHERE session_id = $1', [sid])],
  ['report_review_decisions', (run, sid) => run(
    'UPDATE report_review_decisions SET reason = $2 WHERE reason <> $2 AND review_id IN (SELECT id FROM report_review_requests WHERE session_id = $1)',
    [sid, ERASED_TEXT],
  )],
  ['report_review_requests', async (run, sid) => {
    const hasDecisions = await tableExists('report_review_decisions', run)
    const deleted = await run(
      hasDecisions
        ? 'DELETE FROM report_review_requests q WHERE session_id = $1 AND NOT EXISTS (SELECT 1 FROM report_review_decisions d WHERE d.review_id = q.id)'
        : 'DELETE FROM report_review_requests WHERE session_id = $1',
      [sid],
    )
    // A request with a reviewer decision stays (the decision history is
    // append-only and references it): the learner is pseudonymised.
    const kept = await run('SELECT DISTINCT user_id FROM report_review_requests WHERE session_id = $1', [sid])
    let scrubbed = 0
    for (const { user_id: owner } of kept.rows || []) {
      const pseudo = String(owner).startsWith('erased:') ? owner : pseudonymFor(owner)
      scrubbed += rows(await run(
        'UPDATE report_review_requests SET user_id = $3, reason = $2, moment_id = NULL WHERE session_id = $1 AND user_id = $4',
        [sid, ERASED_TEXT, pseudo, owner],
      ))
    }
    return { rowCount: rows(deleted) + scrubbed }
  }],
  ['student_report_versions', async (run, sid) => {
    const hasRequests = await tableExists('report_review_requests', run)
    const deleted = await run(
      hasRequests
        ? 'DELETE FROM student_report_versions v WHERE session_id = $1 AND NOT EXISTS (SELECT 1 FROM report_review_requests q WHERE q.session_id = v.session_id AND q.version = v.version)'
        : 'DELETE FROM student_report_versions WHERE session_id = $1',
      [sid],
    )
    // Versions a kept review request points at lose their content (0056 guard).
    const scrubbed = await run(
      `UPDATE student_report_versions
          SET report_json = '{"erased": true}'::jsonb, content_hash = 'erased:v' || version::text,
              evidence_set_hash = NULL, publication_note = NULL
        WHERE session_id = $1 AND content_hash NOT LIKE 'erased%'`,
      [sid],
    )
    return { rowCount: rows(deleted) + rows(scrubbed) }
  }],
  ['assessment_session_scopes', (run, sid) => run('DELETE FROM assessment_session_scopes WHERE session_id = $1', [sid])],
  ['assessment_run_timing', (run, sid) => run('DELETE FROM assessment_run_timing WHERE session_id = $1', [sid])],
  ['assessment_opportunities', (run, sid) => run('DELETE FROM assessment_opportunities WHERE session_id = $1', [sid])],
  ['capability_growth_snapshots', (run, sid) => run('DELETE FROM capability_growth_snapshots WHERE baseline_session_id = $1 OR reassessment_session_id = $1', [sid])],
  ['development_plans', (run, sid) => run('DELETE FROM development_plans WHERE source_session_id = $1', [sid])],
  ['candidate_demographics', async (run, sid) => ((await columnExists('candidate_demographics', 'session_id', run)) ? run('DELETE FROM candidate_demographics WHERE session_id::text = $1', [sid]) : { rowCount: 0 })],
  ['candidate_mission_attempts', (run, sid) => run('DELETE FROM candidate_mission_attempts WHERE session_id = $1', [sid])],
  ['admin_session_states', (run, sid) => run('DELETE FROM admin_session_states WHERE session_id = $1', [sid])],
  ['admin_dispute_workflow', (run, sid) => run('DELETE FROM admin_dispute_workflow WHERE session_id = $1', [sid])],
  ['report_versions', (run, sid) => run('DELETE FROM report_versions WHERE session_id = $1', [sid])],
  ['report_admin_states', (run, sid) => run('DELETE FROM report_admin_states WHERE session_id = $1', [sid])],
  ['integrity_reviews', (run, sid) => run('DELETE FROM integrity_reviews WHERE session_id = $1', [sid])],
  ['admin_notes', (run, sid) => run(`DELETE FROM admin_notes WHERE entity_type = 'session' AND entity_id = $1`, [sid])],
]

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
    await enableErasureWrites(run)
    for (const [table, statement] of SESSION_STATEMENTS) {
      if (!(await tableExists(table, run))) continue
      counts[table] = rows(await statement(run, String(sessionId)))
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
