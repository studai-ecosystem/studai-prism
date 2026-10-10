// Account erasure cascade (PROD-READY Phase 2, SECURITY_REVIEW S8).
//
// One service erases a person everywhere: every assessment session they own
// (v1 store, telemetry/research tables, the Campus/V3 store) and every
// account-keyed campus row (memberships, invites, consents, entitlements,
// share grants, roster rows, preferences, notifications, import rows,
// practice work, plans, preparation, ...). What happens to each column is
// declared in personalDataRegistry.js; append-only ledgers and audit trails
// are pseudonymised (stable `erased:<hex>` actor) through the narrowly scoped
// 0056 erasure guard, never deleted.
//
// Callers:
//   * DELETE /api/assessment/candidate-data (self-service) — the handler in
//     candidateErasureRoute.js is mounted in server/app.js in front of the
//     frozen legacy router, which is untouched (K103/K104 pattern);
//   * the admin privacy workflow (lib/privacyPlanner.js executeErasure).
//
// The v1 store, telemetry and campus rows are not one transaction in every
// deployment (the JSON store is a file; per-session erasure commits its
// tombstone first by design), so a run is a sequence of idempotent steps
// recorded in the erasure ledger (privacy_erasure_runs / _steps, 0056):
//   discover → one step per session → campus_user (ONE transaction) →
//   legacy_user → account (admin scope only) → COMPLETED.
// A failure leaves the run FAILED with the steps already done; rerunning the
// same erasure resumes it (done steps are skipped, every step is idempotent
// anyway). The ledger holds a keyed one-way subject reference, never the
// account id or email; the session work list it needs to resume is cleared
// when the run completes. Without a database (development/test) the ledger
// lives in process memory and the campus memory store is erased in place.
import { createHash } from 'node:crypto'
import { isDbConfigured as defaultDbConfigured, query as defaultQuery, getPool as defaultGetPool } from '../../db/pool.js'
import { withTransaction } from '../campusStore/pgUtil.js'
import * as defaultStore from '../../lib/store.js'
import { eraseTelemetry as defaultEraseTelemetry } from '../../lib/telemetry.js'
import {
  eraseCampusSessionData as defaultEraseCampusSession, CAMPUS_CASCADE, ERASED_TEXT, pseudonymFor, subjectRef, sessionRef,
  tableExists, columnExists, enableErasureWrites, sessionPseudonymFor, sessionPseudonymSalt,
} from '../../lib/campusErasure.js'
import { sessionCache as defaultSessionCache } from '../../lib/sessionCache.js'
import { createActorHasher } from '../telemetry/events.js'
import { markMemorySessionErased } from '../assessments/publicationFence.js'

export { pseudonymFor, subjectRef, ERASED_TEXT, sessionPseudonymFor }

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''))
const sessionStepKey = (sid) => `session:${createHash('sha256').update(`erasure-step:${sid}`).digest('hex').slice(0, 16)}`
const rowCount = (r) => r?.rowCount ?? 0

// Telemetry/research tables erased per session, mirrored from
// lib/telemetry.js eraseTelemetry (privacyPlanner keeps the lockstep test).
// The self-service path used only the flag-gated eraseTelemetry; the cascade
// also sweeps unconditionally (historical rows can predate a flag flip).
export const TELEMETRY_SWEEP = Object.freeze([
  ['item_responses', 'session_id'], ['ability_estimates', 'session_id'], ['behavioral_features', 'session_id'],
  ['assessment_timeline', 'session_id'], ['human_ratings', 'session_id'], ['session_transcripts', 'session_id'],
  ['study_sessions', 'session_id'], ['credentials', 'session_id'], ['external_ratings', 'session_id'],
  ['practice_replays', 'source_session_id'], ['teamfit_sessions', 'candidate_session_id'], ['team_members', 'member_session_id'],
  ['invite_redemptions', 'session_id'], ['institution_verifications', 'session_id'], ['ai_usage_events', 'session_id'],
  ['audit_log', 'session_id'],
])

// v1 store tables erased per session (lib/storePg.js eraseSession + JSON twin).
export const STORE_TABLES = Object.freeze([
  'v1_sessions', 'v1_payments', 'v1_reports', 'v1_calibrations', 'v1_consents', 'v1_disputes', 'v1_verifications',
  'v1_accommodations', 'v1_events', 'v1_items', 'v1_device_links', 'v1_payment_redemptions',
])

// ── Account-level statements (ONE PostgreSQL transaction) ────────────────────
// ctx: { uid, pseudo, email (lower-case or null), actorHash (or null), candidateId (or null),
//        sessionIds (the person's sessions), salt (session pseudonym salt) }
const PROFILE_KEYS = ['name', 'email', 'college', 'year', 'userEmail', 'candidateEmail', 'displayName']
const staffActor = (table, column) => [table, (run, c) => run(`UPDATE ${table} SET ${column} = $2 WHERE ${column} = $1`, [c.uid, c.pseudo])]

export const USER_STATEMENTS = Object.freeze([
  ['cohort_members', async (run, c) => ({ rowCount: rowCount(await run('DELETE FROM cohort_members WHERE user_id = $1', [c.uid]))
    + rowCount(await run('UPDATE cohort_members SET added_by = $2 WHERE added_by = $1', [c.uid, c.pseudo])) })],
  staffActor('cohorts', 'owner_user_id'),
  ['intervention_memberships', (run, c) => run('DELETE FROM intervention_memberships WHERE user_id = $1', [c.uid])],
  ['organization_memberships', async (run, c) => ({ rowCount: rowCount(await run('DELETE FROM organization_memberships WHERE user_id = $1', [c.uid]))
    + rowCount(await run('UPDATE organization_memberships SET invited_by = $2 WHERE invited_by = $1', [c.uid, c.pseudo])) })],
  ['workspaces', (run, c) => run('DELETE FROM workspaces WHERE owner_user_id = $1', [c.uid])],
  ['organization_invites', async (run, c) => ({ rowCount: rowCount(await run(
    'DELETE FROM organization_invites WHERE accepted_by = $1 OR ($2::text IS NOT NULL AND lower(email) = $2)', [c.uid, c.email],
  )) + rowCount(await run('UPDATE organization_invites SET invited_by = $2 WHERE invited_by = $1', [c.uid, c.pseudo])) })],
  ['assessment_assignment_targets', (run, c) => run(`DELETE FROM assessment_assignment_targets WHERE target_type = 'USER' AND target_id = $1`, [c.uid])],
  ['assessment_assignment_students', async (run, c) => {
    const personal = await run(
      `SELECT a.id FROM assessment_assignments a JOIN assessment_assignment_students s ON s.assignment_id = a.id
        WHERE s.user_id = $1 AND a.sponsor_type = 'PERSONAL'`, [c.uid],
    )
    const removed = await run('DELETE FROM assessment_assignment_students WHERE user_id = $1', [c.uid])
    const ids = (personal.rows || []).map((r) => r.id)
    let dropped = 0
    if (ids.length) {
      dropped = rowCount(await run(
        `DELETE FROM assessment_assignments a WHERE a.id = ANY($1::text[]) AND a.sponsor_type = 'PERSONAL'
          AND NOT EXISTS (SELECT 1 FROM assessment_assignment_students s WHERE s.assignment_id = a.id)`, [ids],
      ))
    }
    return { rowCount: rowCount(removed) + dropped }
  }],
  staffActor('assessment_assignments', 'created_by'),
  ['consent_records', (run, c) => run('DELETE FROM consent_records WHERE user_id = $1', [c.uid])],
  ['share_grants', (run, c) => run('DELETE FROM share_grants WHERE owner_user_id = $1', [c.uid])],
  ['assessment_session_scopes', async (run, c) => ({ rowCount: rowCount(await run('DELETE FROM assessment_session_scopes WHERE owner_user_id = $1', [c.uid]))
    + rowCount(await run('UPDATE assessment_session_scopes SET created_by = $2 WHERE created_by = $1', [c.uid, c.pseudo])) })],
  // Append-only seat ledger: the event stays (billing evidence), the person goes.
  ['entitlement_consumptions', (run, c) => run(
    `UPDATE entitlement_consumptions SET user_id = $2, idempotency_key = 'erased:' || md5(idempotency_key) WHERE user_id = $1`, [c.uid, c.pseudo],
  )],
  ['entitlements', async (run, c) => {
    const hasContracts = await tableExists('campus_contracts', run)
    const deleted = await run(
      `DELETE FROM entitlements e WHERE e.user_id = $1
         AND NOT EXISTS (SELECT 1 FROM entitlement_consumptions x WHERE x.entitlement_id = e.id)
         ${hasContracts ? 'AND NOT EXISTS (SELECT 1 FROM campus_contracts k WHERE k.entitlement_id = e.id)' : ''}`, [c.uid],
    )
    const kept = await run(
      `UPDATE entitlements SET user_id = $2, updated_at = now(),
              status = CASE WHEN status IN ('ACTIVE', 'SUSPENDED') THEN 'REVOKED' ELSE status END
        WHERE user_id = $1`, [c.uid, c.pseudo],
    )
    return { rowCount: rowCount(deleted) + rowCount(kept) }
  }],
  ['data_access_audit_events', (run, c) => run(
    `UPDATE data_access_audit_events
        SET actor_user_id = CASE WHEN actor_user_id = $1 THEN $2 ELSE actor_user_id END,
            subject_user_id = CASE WHEN subject_user_id = $1 THEN $2 ELSE subject_user_id END,
            resource_id = CASE WHEN resource_id = $1 THEN $2
                               WHEN resource_id = ANY($3::text[]) THEN 'erased:s' || substr(md5($4 || resource_id), 1, 24)
                               ELSE resource_id END
      WHERE actor_user_id = $1 OR subject_user_id = $1 OR resource_id = $1 OR resource_id = ANY($3::text[])`, [c.uid, c.pseudo, c.sessionIds, c.salt],
  )],
  ['organization_audit_events', (run, c) => run(
    `UPDATE organization_audit_events
        SET actor_user_id = CASE WHEN actor_user_id = $1 THEN $2 ELSE actor_user_id END,
            target_id = CASE WHEN target_id = $1 THEN $2 ELSE target_id END
      WHERE actor_user_id = $1 OR target_id = $1`, [c.uid, c.pseudo],
  )],
  ['admin_audit_events', async (run, c) => ({ rowCount: rowCount(await run(
    `UPDATE admin_audit_events
        SET entity_id = $2,
            before = CASE WHEN before IS NULL THEN NULL ELSE (before - $3::text[]) || '{"erased": true}'::jsonb END,
            after = CASE WHEN after IS NULL THEN NULL ELSE (after - $3::text[]) || '{"erased": true}'::jsonb END
      WHERE entity_type = 'user' AND entity_id = $1`, [c.uid, c.pseudo, PROFILE_KEYS],
  )) + rowCount(await run(
    // Admin actions on one of the person's sessions: the event stays, the
    // session id becomes a pseudonym and its before/after values (scores,
    // report fields) are dropped.
    `UPDATE admin_audit_events
        SET entity_id = 'erased:s' || substr(md5($2 || entity_id), 1, 24),
            before = CASE WHEN before IS NULL THEN NULL ELSE '{"erased": true}'::jsonb END,
            after = CASE WHEN after IS NULL THEN NULL ELSE '{"erased": true}'::jsonb END
      WHERE entity_id = ANY($1::text[])`, [c.sessionIds, c.salt],
  )) })],
  ['admin_notes', (run, c) => run(`DELETE FROM admin_notes WHERE entity_type = 'user' AND entity_id = $1`, [c.uid])],
  ['user_preferences', (run, c) => run('DELETE FROM user_preferences WHERE user_id = $1', [c.uid])],
  ['product_events', (run, c) => (c.actorHash ? run('UPDATE product_events SET actor_hash = NULL WHERE actor_hash = $1', [c.actorHash]) : { rowCount: 0 })],
  ['assessment_artifact_versions', (run, c) => run('DELETE FROM assessment_artifact_versions WHERE saved_by = $1', [c.uid])],
  ['notifications', (run, c) => run('DELETE FROM notifications WHERE user_id = $1', [c.uid])],
  ['student_import_rows', (run, c) => (c.email ? run(
    `UPDATE student_import_rows SET raw = '{"erased": true}'::jsonb, normalized = NULL
      WHERE lower(raw ->> 'email') = $1 OR lower(normalized ->> 'email') = $1`, [c.email],
  ) : { rowCount: 0 })],
  staffActor('student_import_jobs', 'uploaded_by'),
  staffActor('campus_programs', 'created_by'),
  staffActor('org_onboarding_progress', 'updated_by'),
  staffActor('interventions', 'created_by'),
  staffActor('reassessment_cycles', 'created_by'),
  staffActor('organization_analytics_settings', 'updated_by'),
  ['campus_contracts', async (run, c) => {
    let n = 0
    for (const col of ['created_by', 'activated_by', 'ended_by']) n += rowCount(await run(`UPDATE campus_contracts SET ${col} = $2 WHERE ${col} = $1`, [c.uid, c.pseudo]))
    return { rowCount: n }
  }],
  staffActor('campus_contract_pricing', 'approved_by'),
  staffActor('invoice_exports', 'created_by'),
  staffActor('assessment_form_equivalence', 'decided_by'),
  staffActor('assessment_form_equivalence_decisions', 'decided_by'),
  staffActor('evidence_rating_items', 'enqueued_by'),
  staffActor('report_review_decisions', 'reviewer_id'),
  ['mission_attempts', (run, c) => run('DELETE FROM mission_attempts WHERE user_id = $1', [c.uid])],
  ['practice_evidence_units', (run, c) => run('DELETE FROM practice_evidence_units WHERE user_id = $1', [c.uid])],
  ['development_plans', (run, c) => run('DELETE FROM development_plans WHERE user_id = $1', [c.uid])],
  ['capability_growth_snapshots', (run, c) => run('DELETE FROM capability_growth_snapshots WHERE user_id = $1', [c.uid])],
  ['practice_allowances', (run, c) => run('DELETE FROM practice_allowances WHERE user_id = $1', [c.uid])],
  ['report_review_requests', async (run, c) => {
    const scrubbed = await run(
      'UPDATE report_review_decisions SET reason = $2 WHERE reason <> $2 AND review_id IN (SELECT id FROM report_review_requests WHERE user_id = $1)', [c.uid, ERASED_TEXT],
    )
    const deleted = await run(
      'DELETE FROM report_review_requests q WHERE user_id = $1 AND NOT EXISTS (SELECT 1 FROM report_review_decisions d WHERE d.review_id = q.id)', [c.uid],
    )
    const kept = await run('UPDATE report_review_requests SET user_id = $2, reason = $3, moment_id = NULL WHERE user_id = $1', [c.uid, c.pseudo, ERASED_TEXT])
    return { rowCount: rowCount(scrubbed) + rowCount(deleted) + rowCount(kept) }
  }],
  // PROD-READY Phase 4 (0058): pre-start accommodation requests (needs text).
  ['assessment_accommodation_requests', (run, c) => run('DELETE FROM assessment_accommodation_requests WHERE user_id = $1', [c.uid])],
  ['preparation_turns', (run, c) => run('DELETE FROM preparation_turns WHERE attempt_id IN (SELECT id FROM preparation_attempts WHERE user_id = $1)', [c.uid])],
  ['preparation_attempts', (run, c) => run('DELETE FROM preparation_attempts WHERE user_id = $1', [c.uid])],
  ['action_cards', (run, c) => run('DELETE FROM action_cards WHERE user_id = $1', [c.uid])],
  ['application_checkins', (run, c) => run('DELETE FROM application_checkins WHERE user_id = $1', [c.uid])],
  // Finance record retained under policy (0048): pseudonymised, never deleted.
  ['product_grants', (run, c) => run('UPDATE product_grants SET user_id = $2 WHERE user_id = $1', [c.uid, c.pseudo])],
  ['preview_attempts', (run, c) => run('DELETE FROM preview_attempts WHERE claimed_user_id = $1', [c.uid])],
  ['invite_redemptions', (run, c) => run(
    'DELETE FROM invite_redemptions WHERE user_id = $1 OR ($2::text IS NOT NULL AND lower(user_email) = $2)', [c.uid, c.email],
  )],
  // The 0019 candidate_id shape exists only on a database created without 0002 (see the registry).
  ['candidate_demographics', async (run, c) => (c.candidateId && await columnExists('candidate_demographics', 'candidate_id', run) ? run('DELETE FROM candidate_demographics WHERE candidate_id = $1', [c.candidateId]) : { rowCount: 0 })],
  ['assessment_timeline', (run, c) => (isUuid(c.candidateId) ? run('DELETE FROM assessment_timeline WHERE candidate_id = $1::uuid', [c.candidateId]) : { rowCount: 0 })],
  ['credentials', (run, c) => (isUuid(c.candidateId) ? run('DELETE FROM credentials WHERE candidate_id = $1::uuid', [c.candidateId]) : { rowCount: 0 })],
  ['candidate_mission_attempts', (run, c) => run(
    'DELETE FROM candidate_mission_attempts WHERE candidate_id = $1 OR ($2::text IS NOT NULL AND candidate_id = $2)', [c.uid, c.candidateId],
  )],
])

// Every table the cascade writes to (session steps, account statements, the
// v1 store and telemetry). The registry coverage test checks it.
export const CASCADE_COVERAGE = Object.freeze(new Set([
  ...STORE_TABLES, 'judge_votes', ...TELEMETRY_SWEEP.map(([t]) => t), ...CAMPUS_CASCADE.map(([t]) => t),
  'share_grants', ...USER_STATEMENTS.map(([t]) => t),
]))

// ── Campus memory store (no database: unit tests, development) ──────────────
function dropFrom(list, pred) {
  if (!Array.isArray(list)) return 0
  let n = 0
  for (let i = list.length - 1; i >= 0; i -= 1) if (pred(list[i])) { list.splice(i, 1); n += 1 }
  return n
}
function dropMap(map, pred) {
  if (!(map instanceof Map)) return 0
  let n = 0
  for (const [k, v] of [...map.entries()]) if (pred(v, k)) { map.delete(k); n += 1 }
  return n
}
// Append-only memory rows are frozen: replace the row, never mutate it.
function rewrite(list, pred, patch) {
  if (!Array.isArray(list)) return 0
  let n = 0
  for (let i = 0; i < list.length; i += 1) {
    if (pred(list[i])) {
      const next = { ...list[i], ...patch(list[i]) }
      list[i] = Object.isFrozen(list[i]) ? Object.freeze(next) : next
      n += 1
    }
  }
  return n
}
function patchMap(map, pred, patch) {
  if (!(map instanceof Map)) return 0
  let n = 0
  for (const [k, v] of map.entries()) if (pred(v)) { map.set(k, { ...v, ...patch(v) }); n += 1 }
  return n
}

export function eraseSessionFromMemoryDb(db, sessionId) {
  if (!db || !sessionId) return {}
  const sid = String(sessionId)
  const counts = {}
  db.erasureMarkers ||= new Map()
  if (!db.erasureMarkers.has(sid)) db.erasureMarkers.set(sid, { sessionId: sid, erasedAt: db.clock().toISOString() })
  markMemorySessionErased(sid)
  counts.erasure_marker = 1
  counts.share_grant_resources = dropFrom(db.shareGrantResources, (r) => r.resourceType === 'ASSESSMENT_REPORT' && r.resourceId === sid)
  const ref = sessionRef(sid)
  const rated = new Set((db.unitRatings || []).map((r) => r.itemId))
  counts.evidence_rating_items = dropMap(db.ratingItems, (i) => i.sessionRef === ref && !rated.has(i.id))
    + patchMap(db.ratingItems, (i) => i.sessionRef === ref, () => ({ excerpt: ERASED_TEXT, sessionRef: createHash('sha256').update(`detached:${Math.random()}:${Date.now()}`).digest('hex'), evidenceRef: createHash('sha256').update(`detached-e:${Math.random()}:${Date.now()}`).digest('hex'), sourceMethod: null }))
  counts.assessment_client_events = dropMap(db.clientEvents, (r) => r.sessionId === sid)
  counts.assessment_artifact_versions = dropFrom(db.artifactVersions, (r) => r.sessionId === sid)
  counts.assessment_candidate_actions = dropMap(db.candidateActions, (r) => r.sessionId === sid)
  counts.assessment_jobs = dropMap(db.assessmentJobs, (r) => r.sessionId === sid)
  const requestIds = new Set((db.reportReviewRequests || []).filter((r) => r.sessionId === sid).map((r) => r.id))
  counts.report_review_decisions = rewrite(db.reportReviewDecisions, (d) => requestIds.has(d.reviewId) && d.reason !== ERASED_TEXT, () => ({ reason: ERASED_TEXT }))
  const decided = new Set((db.reportReviewDecisions || []).map((d) => d.reviewId))
  counts.report_review_requests = dropFrom(db.reportReviewRequests, (r) => r.sessionId === sid && !decided.has(r.id))
    + rewrite(db.reportReviewRequests, (r) => r.sessionId === sid && r.reason !== ERASED_TEXT, (r) => ({ userId: String(r.userId).startsWith('erased:') ? r.userId : pseudonymFor(r.userId), reason: ERASED_TEXT, momentId: null }))
  const keptVersions = new Set((db.reportReviewRequests || []).filter((r) => r.sessionId === sid).map((r) => r.version))
  counts.student_report_versions = dropFrom(db.reportVersions, (v) => v.sessionId === sid && !keptVersions.has(v.version))
    + rewrite(db.reportVersions, (v) => v.sessionId === sid && !String(v.contentHash).startsWith('erased'), (v) => ({ report: { erased: true }, contentHash: `erased:v${v.version}`, evidenceSetHash: null, publicationNote: null }))
  counts.assessment_session_scopes = db.sessionScopes?.delete(sid) ? 1 : 0
  counts.assessment_run_timing = db.runTiming?.delete(sid) ? 1 : 0
  counts.assessment_opportunities = dropMap(db.opportunities, (r) => r.sessionId === sid)
  counts.capability_growth_snapshots = dropFrom(db.growthSnapshots, (s) => s.baselineSessionId === sid || s.reassessmentSessionId === sid)
  const plans = new Set([...(db.developmentPlans?.values() || [])].filter((p) => p.sourceSessionId === sid).map((p) => p.id))
  counts.development_plans = dropMap(db.developmentPlans, (p) => plans.has(p.id))
  dropFrom(db.planItems, (i) => plans.has(i.planId))
  counts.assessment_accommodation_requests = dropMap(db.accommodationRequests, (r) => r.sessionId === sid)
  for (const g of db.shareGrants?.values() || []) {
    if (!g.revokedAt && !(db.shareGrantResources || []).some((r) => r.shareGrantId === g.id)) g.revokedAt = db.clock().toISOString()
  }
  return counts
}

export function eraseUserFromMemoryDb(db, c) {
  if (!db || !c?.uid) return {}
  const { uid, pseudo, email } = c
  const counts = {}
  const at = () => db.clock().toISOString()
  counts.cohort_members = dropMap(db.cohortMembers, (m) => m.userId === uid) + patchMap(db.cohortMembers, (m) => m.addedBy === uid, () => ({ addedBy: pseudo }))
  counts.cohorts = patchMap(db.cohorts, (r) => r.ownerUserId === uid, () => ({ ownerUserId: pseudo }))
  counts.intervention_memberships = dropMap(db.interventionMembers, (m) => m.userId === uid)
  counts.organization_memberships = dropMap(db.memberships, (m) => m.userId === uid) + patchMap(db.memberships, (m) => m.invitedBy === uid, () => ({ invitedBy: pseudo }))
  counts.workspaces = dropMap(db.workspaces, (w) => w.ownerUserId === uid)
  counts.organization_invites = dropMap(db.invites, (i) => i.acceptedBy === uid || (email && String(i.email).toLowerCase() === email))
    + patchMap(db.invites, (i) => i.invitedBy === uid, () => ({ invitedBy: pseudo }))
  counts.assessment_assignment_targets = dropFrom(db.assignmentTargets, (t) => t.targetType === 'USER' && t.targetId === uid)
  const mine = [...(db.assignmentStudents?.values() || [])].filter((s) => s.userId === uid).map((s) => s.assignmentId)
  counts.assessment_assignment_students = dropMap(db.assignmentStudents, (s) => s.userId === uid)
  for (const id of mine) {
    const a = db.assignments?.get(id)
    if (a?.sponsorType === 'PERSONAL' && ![...db.assignmentStudents.values()].some((s) => s.assignmentId === id)) db.assignments.delete(id)
  }
  counts.assessment_assignments = patchMap(db.assignments, (a) => a.createdBy === uid, () => ({ createdBy: pseudo }))
  counts.consent_records = dropFrom(db.consents, (r) => r.userId === uid)
  const grants = new Set([...(db.shareGrants?.values() || [])].filter((g) => g.ownerUserId === uid).map((g) => g.id))
  counts.share_grants = dropMap(db.shareGrants, (g) => grants.has(g.id))
  dropFrom(db.shareGrantResources, (r) => grants.has(r.shareGrantId))
  counts.assessment_session_scopes = dropMap(db.sessionScopes, (s) => s.ownerUserId === uid) + patchMap(db.sessionScopes, (s) => s.createdBy === uid, () => ({ createdBy: pseudo }))
  counts.entitlement_consumptions = rewrite(db.consumptions, (x) => x.userId === uid, (x) => ({ userId: pseudo, idempotencyKey: `erased:${createHash('md5').update(String(x.idempotencyKey)).digest('hex')}` }))
  const ledgered = new Set((db.consumptions || []).map((x) => x.entitlementId))
  counts.entitlements = dropMap(db.entitlements, (e) => e.userId === uid && !ledgered.has(e.id))
    + patchMap(db.entitlements, (e) => e.userId === uid, (e) => ({ userId: pseudo, status: ['ACTIVE', 'SUSPENDED'].includes(e.status) ? 'REVOKED' : e.status, updatedAt: at() }))
  const sessions = new Set(c.sessionIds || [])
  counts.data_access_audit_events = rewrite(db.dataAccessEvents, (e) => e.actorUserId === uid || e.subjectUserId === uid || e.resourceId === uid || sessions.has(e.resourceId), (e) => ({
    actorUserId: e.actorUserId === uid ? pseudo : e.actorUserId,
    subjectUserId: e.subjectUserId === uid ? pseudo : e.subjectUserId,
    resourceId: e.resourceId === uid ? pseudo : (sessions.has(e.resourceId) ? sessionPseudonymFor(e.resourceId) : e.resourceId),
  }))
  counts.organization_audit_events = rewrite(db.orgAudit, (e) => e.actorUserId === uid || e.targetId === uid, (e) => ({
    actorUserId: e.actorUserId === uid ? pseudo : e.actorUserId, targetId: e.targetId === uid ? pseudo : e.targetId,
  }))
  counts.user_preferences = db.preferences?.delete(uid) ? 1 : 0
  counts.product_events = c.actorHash ? rewrite(db.productEvents, (e) => e.actorHash === c.actorHash, () => ({ actorHash: null })) : 0
  counts.assessment_artifact_versions = dropFrom(db.artifactVersions, (v) => v.savedBy === uid)
  counts.notifications = dropFrom(db.notifications, (n) => n.userId === uid)
  counts.student_import_rows = email ? rewrite(db.importRows, (r) => String(r.raw?.email || '').toLowerCase() === email || String(r.normalized?.email || '').toLowerCase() === email, () => ({ raw: { erased: true }, normalized: null })) : 0
  for (const [map, field] of [[db.importJobs, 'uploadedBy'], [db.programs, 'createdBy'], [db.onboarding, 'updatedBy'], [db.interventions, 'createdBy'], [db.reassessmentCycles, 'createdBy'], [db.analyticsSettings, 'updatedBy'], [db.contracts, 'createdBy'], [db.contracts, 'activatedBy'], [db.contracts, 'endedBy'], [db.contractPricing, 'approvedBy'], [db.formEquivalence, 'decidedBy'], [db.ratingItems, 'enqueuedBy']]) {
    patchMap(map, (r) => r?.[field] === uid, () => ({ [field]: pseudo }))
  }
  rewrite(db.invoiceExports, (r) => r.createdBy === uid, () => ({ createdBy: pseudo }))
  rewrite(db.equivalenceDecisions, (r) => r.decidedBy === uid, () => ({ decidedBy: pseudo }))
  rewrite(db.reportReviewDecisions, (r) => r.reviewerId === uid, () => ({ reviewerId: pseudo }))
  const attempts = new Set([...(db.missionAttempts?.values() || [])].filter((a) => a.userId === uid).map((a) => a.id))
  counts.mission_attempts = dropMap(db.missionAttempts, (a) => attempts.has(a.id))
  counts.practice_evidence_units = dropFrom(db.practiceUnits, (u) => u.userId === uid || attempts.has(u.attemptId))
  const plans = new Set([...(db.developmentPlans?.values() || [])].filter((p) => p.userId === uid).map((p) => p.id))
  counts.development_plans = dropMap(db.developmentPlans, (p) => plans.has(p.id))
  dropFrom(db.planItems, (i) => plans.has(i.planId))
  counts.capability_growth_snapshots = dropFrom(db.growthSnapshots, (s) => s.userId === uid)
  counts.practice_allowances = dropMap(db.practiceAllowances, (r) => r.userId === uid)
  const requestIds = new Set((db.reportReviewRequests || []).filter((r) => r.userId === uid).map((r) => r.id))
  rewrite(db.reportReviewDecisions, (d) => requestIds.has(d.reviewId) && d.reason !== ERASED_TEXT, () => ({ reason: ERASED_TEXT }))
  const decided = new Set((db.reportReviewDecisions || []).map((d) => d.reviewId))
  counts.report_review_requests = dropFrom(db.reportReviewRequests, (r) => r.userId === uid && !decided.has(r.id))
    + rewrite(db.reportReviewRequests, (r) => r.userId === uid, () => ({ userId: pseudo, reason: ERASED_TEXT, momentId: null }))
  counts.assessment_accommodation_requests = dropMap(db.accommodationRequests, (r) => r.userId === uid)
  const prep = new Set([...(db.preparationAttempts?.values() || [])].filter((a) => a.userId === uid).map((a) => a.id))
  counts.preparation_attempts = dropMap(db.preparationAttempts, (a) => prep.has(a.id))
  dropFrom(db.preparationTurns, (t) => prep.has(t.attemptId))
  counts.action_cards = dropMap(db.actionCards, (a) => a.userId === uid || prep.has(a.attemptId))
  counts.application_checkins = dropFrom(db.applicationCheckins, (r) => r.userId === uid)
  counts.product_grants = patchMap(db.productGrants, (g) => g.userId === uid, () => ({ userId: pseudo }))
  counts.preview_attempts = dropMap(db.previewAttempts, (p) => p.claimedUserId === uid)
  return counts
}

// ── Ledger ───────────────────────────────────────────────────────────────────
const safeError = (err) => `${err?.code || 'ERROR'}: ${String(err?.message || '').split('\n')[0].slice(0, 200)}`

function createPgLedger(query) {
  return {
    kind: 'pg',
    async open({ ref, initiatedBy, scope }) {
      const { rows } = await query(
        `INSERT INTO privacy_erasure_runs (subject_ref, initiated_by, scope, status)
         VALUES ($1, $2, $3, 'RUNNING')
         ON CONFLICT (subject_ref) WHERE status <> 'COMPLETED'
         DO UPDATE SET attempts = privacy_erasure_runs.attempts + 1, status = 'RUNNING', updated_at = now(),
                       scope = CASE WHEN EXCLUDED.scope = 'ACCOUNT' THEN 'ACCOUNT' ELSE privacy_erasure_runs.scope END
         RETURNING id, attempts, pending_session_ids`, [ref, initiatedBy, scope],
      )
      return { id: rows[0].id, attempts: rows[0].attempts, pending: rows[0].pending_session_ids || [] }
    },
    async doneSteps(runId) {
      const { rows } = await query(`SELECT step FROM privacy_erasure_steps WHERE run_id = $1 AND status = 'DONE'`, [runId])
      return new Set(rows.map((r) => r.step))
    },
    async setWorkList(runId, ids) {
      await query('UPDATE privacy_erasure_runs SET pending_session_ids = $2, session_count = $3, updated_at = now() WHERE id = $1', [runId, ids, ids.length])
    },
    async step(runId, step, status, count, detail) {
      await query(
        `INSERT INTO privacy_erasure_steps (run_id, step, status, row_count, detail) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (run_id, step) DO UPDATE SET status = EXCLUDED.status, row_count = EXCLUDED.row_count, detail = EXCLUDED.detail, updated_at = now()`,
        [runId, step, status, Math.max(0, count | 0), JSON.stringify(detail || {})],
      )
    },
    async fail(runId, err) {
      await query(`UPDATE privacy_erasure_runs SET status = 'FAILED', last_error = $2, updated_at = now() WHERE id = $1`, [runId, safeError(err)])
    },
    async complete(runId) {
      await query(`UPDATE privacy_erasure_runs SET status = 'COMPLETED', pending_session_ids = NULL, last_error = NULL, completed_at = now(), updated_at = now() WHERE id = $1`, [runId])
    },
  }
}

// Non-production fallback (no database): same semantics, process memory.
export function createMemoryLedger() {
  const runs = new Map()
  let seq = 0
  return {
    kind: 'memory',
    runs,
    async open({ ref, initiatedBy, scope }) {
      const open = [...runs.values()].find((r) => r.subjectRef === ref && r.status !== 'COMPLETED')
      if (open) { open.attempts += 1; open.status = 'RUNNING'; if (scope === 'ACCOUNT') open.scope = 'ACCOUNT'; return { id: open.id, attempts: open.attempts, pending: open.pending || [] } }
      seq += 1
      const run = { id: `memory-run-${seq}`, subjectRef: ref, initiatedBy, scope, status: 'RUNNING', attempts: 1, pending: [], steps: new Map(), lastError: null }
      runs.set(run.id, run)
      return { id: run.id, attempts: 1, pending: [] }
    },
    async doneSteps(runId) { return new Set([...runs.get(runId).steps.entries()].filter(([, s]) => s.status === 'DONE').map(([k]) => k)) },
    async setWorkList(runId, ids) { runs.get(runId).pending = [...ids] },
    async step(runId, step, status, count, detail) { runs.get(runId).steps.set(step, { status, count, detail }) },
    async fail(runId, err) { Object.assign(runs.get(runId), { status: 'FAILED', lastError: safeError(err) }) },
    async complete(runId) { Object.assign(runs.get(runId), { status: 'COMPLETED', pending: null, lastError: null }) },
  }
}
const processLedger = createMemoryLedger()

const sum = (obj) => Object.values(obj || {}).reduce((n, v) => n + (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : 0), 0)

export class ErasureBlockedError extends Error {
  constructor(holdId) {
    super('LEGAL_HOLD_ACTIVE')
    this.code = 'LEGAL_HOLD_ACTIVE'
    this.holdId = holdId
  }
}

export function createErasureCascade({
  isDbConfigured = defaultDbConfigured,
  query = defaultQuery,
  getPool = defaultGetPool,
  store = defaultStore,
  eraseTelemetry = defaultEraseTelemetry,
  eraseCampusSession = defaultEraseCampusSession,
  sessionCache = defaultSessionCache,
  memoryDb = () => null,
  holdCovering = async (args) => (await import('../../lib/retentionEnforcement.js')).holdCovering(args),
  actorHasher = createActorHasher(),
  ledger = null,
  // Test hook: awaited before each step; a throw simulates a mid-run failure.
  beforeStep = async () => {},
} = {}) {
  const pg = () => Boolean(isDbConfigured())
  const ledgerFor = () => ledger || (pg() ? createPgLedger(query) : processLedger)

  async function sweepTelemetry(sid) {
    if (!pg() || !isUuid(sid)) return {}
    const counts = {}
    const votes = await query('DELETE FROM judge_votes WHERE response_id IN (SELECT response_id FROM item_responses WHERE session_id = $1)', [sid]).catch(() => null)
    counts.judge_votes = rowCount(votes)
    for (const [table, col] of TELEMETRY_SWEEP) {
      const r = await query(`DELETE FROM ${table} WHERE ${col} = $1`, [sid]).catch(() => null)
      counts[table] = rowCount(r)
    }
    return counts
  }

  // Everything one session left behind, in every store. Idempotent.
  async function eraseSessionEverywhere(sessionId) {
    const sid = String(sessionId)
    if (await sessionCache.has(sid)) await sessionCache.delete(sid)
    const storeRemoved = await store.eraseSession(sid)
    const viaFlag = await eraseTelemetry(sid)
    const swept = await sweepTelemetry(sid)
    const telemetry = {}
    for (const k of new Set([...Object.keys(viaFlag || {}), ...Object.keys(swept)])) telemetry[k] = (viaFlag?.[k] || 0) + (swept[k] || 0)
    const campus = pg() ? await eraseCampusSession(sid) : {}
    const mem = memoryDb()
    if (mem) Object.assign(campus, eraseSessionFromMemoryDb(mem, sid))
    return { sessionId: sid, removed: storeRemoved, storeRemoved, telemetryRemoved: telemetry, telemetry, campusRemoved: campus, campus }
  }

  // Read-only: every session id linked to the person in any store.
  async function discoverSessions({ uid }) {
    const ids = new Set((await store.getSessionIdsByUser(uid)) || [])
    for (const e of (await store.listEntitlementsByUser?.(uid).catch(() => [])) || []) if (e?.sessionId) ids.add(String(e.sessionId))
    if (pg()) {
      const sources = [
        ['assessment_session_scopes', 'SELECT session_id AS id FROM assessment_session_scopes WHERE owner_user_id = $1'],
        ['assessment_assignment_students', 'SELECT session_id AS id FROM assessment_assignment_students WHERE user_id = $1 AND session_id IS NOT NULL'],
        ['entitlement_consumptions', 'SELECT session_id AS id FROM entitlement_consumptions WHERE user_id = $1 AND session_id IS NOT NULL'],
        ['development_plans', 'SELECT source_session_id AS id FROM development_plans WHERE user_id = $1'],
        ['capability_growth_snapshots', 'SELECT baseline_session_id AS id FROM capability_growth_snapshots WHERE user_id = $1 UNION SELECT reassessment_session_id FROM capability_growth_snapshots WHERE user_id = $1'],
        ['report_review_requests', 'SELECT session_id AS id FROM report_review_requests WHERE user_id = $1'],
        ['assessment_accommodation_requests', 'SELECT session_id AS id FROM assessment_accommodation_requests WHERE user_id = $1 AND session_id IS NOT NULL'],
        ['invite_redemptions', 'SELECT session_id AS id FROM invite_redemptions WHERE user_id = $1 AND session_id IS NOT NULL'],
        ['v1_payment_redemptions', 'SELECT session_id AS id FROM v1_payment_redemptions WHERE user_id = $1 AND session_id IS NOT NULL'],
      ]
      for (const [table, sql] of sources) {
        if (!(await tableExists(table, query))) continue
        for (const r of (await query(sql, [uid])).rows || []) if (r.id) ids.add(String(r.id))
      }
    }
    const mem = memoryDb()
    if (mem) {
      for (const s of mem.sessionScopes?.values() || []) if (s.ownerUserId === uid) ids.add(String(s.sessionId))
      for (const s of mem.assignmentStudents?.values() || []) if (s.userId === uid && s.sessionId) ids.add(String(s.sessionId))
      for (const x of mem.consumptions || []) if (x.userId === uid && x.sessionId) ids.add(String(x.sessionId))
      for (const r of mem.reportReviewRequests || []) if (r.userId === uid) ids.add(String(r.sessionId))
      for (const r of mem.accommodationRequests?.values() || []) if (r.userId === uid && r.sessionId) ids.add(String(r.sessionId))
    }
    return [...ids].sort()
  }

  async function eraseUserRows(ctx) {
    const counts = {}
    if (pg()) {
      Object.assign(counts, await withTransaction(getPool, async (client) => {
        const run = client.query.bind(client)
        await enableErasureWrites(run)
        const out = {}
        for (const [table, statement] of USER_STATEMENTS) {
          if (!(await tableExists(table, run))) continue
          out[table] = (out[table] || 0) + rowCount(await statement(run, ctx))
        }
        return out
      }))
    }
    const mem = memoryDb()
    if (mem) for (const [k, v] of Object.entries(eraseUserFromMemoryDb(mem, ctx))) counts[k] = (counts[k] || 0) + v
    return counts
  }

  // Erase a person. scope 'DATA' keeps the login account record (self-service
  // "delete my data"); 'ACCOUNT' runs `accountStep` (deletes the account
  // record) as the last ledgered step.
  async function run({ userId, email = null, candidateId = null, initiatedBy = 'SELF_SERVICE', scope = 'DATA', accountStep = null } = {}) {
    if (!userId) throw new Error('userId is required')
    const uid = String(userId)
    const ctx = {
      uid,
      pseudo: pseudonymFor(uid),
      email: email ? String(email).trim().toLowerCase() : null,
      actorHash: actorHasher ? actorHasher(uid) : null,
      candidateId: candidateId ? String(candidateId) : null,
      salt: sessionPseudonymSalt(),
      sessionIds: [],
    }
    const ref = subjectRef(uid)
    const discovered = await discoverSessions(ctx)
    // Charter §16: an active legal hold on the person or any of their
    // sessions blocks erasure (nothing is touched, no run is opened).
    const hold = await holdCovering({ sessionIds: discovered, candidateRefs: [uid, ctx.candidateId, email].filter(Boolean) })
    if (hold) throw new ErasureBlockedError(hold.hold_id || hold.holdId || null)

    const book = ledgerFor()
    const opened = await book.open({ ref, initiatedBy, scope })
    const work = [...new Set([...(opened.pending || []), ...discovered])].sort()
    ctx.sessionIds = work
    await book.setWorkList(opened.id, work)
    const done = await book.doneSteps(opened.id)
    const receipt = { runId: opened.id, subjectRef: ref, ledger: book.kind, attempts: opened.attempts, resumed: opened.attempts > 1, sessionCount: work.length, sessions: [], user: {}, accountDeleted: false, status: 'RUNNING' }
    const step = async (key, fn) => {
      if (done.has(key)) return null
      await beforeStep(key)
      const result = await fn()
      await book.step(opened.id, key, 'DONE', sum(result?.counts ?? result), result?.counts ?? result)
      return result
    }
    try {
      for (const sid of work) {
        const r = await step(sessionStepKey(sid), async () => {
          const out = await eraseSessionEverywhere(sid)
          return { ...out, counts: { store: Number(Boolean(out.storeRemoved)), telemetry: sum(out.telemetry), campus: sum(out.campus) } }
        })
        if (r) receipt.sessions.push({ sessionId: r.sessionId, removed: r.removed, storeRemoved: r.storeRemoved, telemetryRemoved: r.telemetry, telemetry: r.telemetry, campusRemoved: r.campus, campus: r.campus })
      }
      const userCounts = await step('campus_user', () => eraseUserRows(ctx))
      if (userCounts) receipt.user = userCounts
      await step('legacy_user', async () => ({ v1_payment_redemptions: await store.detachPaymentRedemptionsForUser?.(uid) || 0 }))
      if (scope === 'ACCOUNT' && accountStep) {
        const acct = await step('account', async () => {
          const out = await accountStep()
          return { ...(out || {}), account: 1 }
        })
        receipt.accountDeleted = Boolean(acct) || done.has('account')
        if (acct) receipt.account = acct
      }
      await book.complete(opened.id)
      receipt.status = 'COMPLETED'
      return receipt
    } catch (err) {
      await book.fail(opened.id, err).catch(() => {})
      err.erasureRunId = opened.id
      throw err
    }
  }

  return { run, eraseSessionEverywhere, discoverSessions, eraseUserRows, sweepTelemetry }
}

// Default instance used by the app (PostgreSQL when configured).
let defaultCascade = null
export function defaultErasureCascade() {
  defaultCascade ||= createErasureCascade()
  return defaultCascade
}

// Operator/admin reads of the ledger (proof of completion for a subject).
export async function erasureLedgerFor(userId, { query = defaultQuery } = {}) {
  const ref = subjectRef(String(userId))
  const { rows: runs } = await query('SELECT * FROM privacy_erasure_runs WHERE subject_ref = $1 ORDER BY started_at DESC', [ref])
  const out = []
  for (const r of runs) {
    const { rows: steps } = await query('SELECT step, status, row_count, updated_at FROM privacy_erasure_steps WHERE run_id = $1 ORDER BY updated_at', [r.id])
    out.push({ ...r, steps })
  }
  return { subjectRef: ref, runs: out }
}
