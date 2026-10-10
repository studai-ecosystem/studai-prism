// Privacy request planner & executor (Control Centre Phase 6, plan §21).
//
// Erasure is a two-phase, dual-approved operation:
//   1. buildErasurePlan()   — DRY RUN: counts everything that WOULD be
//      deleted (store buckets + every telemetry/research table the cascade
//      covers), what would be revoked/destroyed (credentials), and what is
//      PRESERVED (admin audit trail, append-only study aggregates, export
//      ledger). Mutates nothing.
//   2. executeErasure()     — runs the REAL cascade (the account erasure
//      cascade, server/domain/privacy/erasureCascade.js — the same service the
//      candidate self-service right uses) and, for candidate-scope requests,
//      deletes the account record. Returns the receipt.
//
// buildAccessPackage() assembles a candidate's own data for access/export
// requests (their data, unmasked — it is theirs).

import { query, isDbConfigured } from '../db/pool.js'
import {
  getSessionIdsByUser, getSession, getReport, getEntitlement, getConsent,
  getVerification, getDispute, getEvents, getItemsBySession,
} from './store.js'
import { findUserByEmail, findUserById, deleteUser, publicUser } from './db.js'

// Telemetry tables the cascade touches, with their session column — mirrors
// lib/telemetry.js eraseTelemetry exactly (kept in lockstep by the Phase 6 test).
export const TELEMETRY_CASCADE = [
  ['item_responses', 'session_id'],
  ['ability_estimates', 'session_id'],
  ['behavioral_features', 'session_id'],
  ['assessment_timeline', 'session_id'],
  ['human_ratings', 'session_id'],
  ['session_transcripts', 'session_id'],
  ['study_sessions', 'session_id'],
  ['credentials', 'session_id'],
  ['external_ratings', 'session_id'],
  ['practice_replays', 'source_session_id'],
  ['teamfit_sessions', 'candidate_session_id'],
  ['team_members', 'member_session_id'],
  ['invite_redemptions', 'session_id'],
  ['institution_verifications', 'session_id'],
  ['ai_usage_events', 'session_id'],
  ['audit_log', 'session_id'],
]

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s))

export async function resolveCandidate({ candidateUserId, candidateEmail }) {
  if (candidateUserId) return findUserById(candidateUserId)
  if (candidateEmail) return findUserByEmail(candidateEmail)
  return null
}

export async function resolveSessionIds(request) {
  if (request.scope === 'session') return request.session_id ? [request.session_id] : []
  const user = await resolveCandidate({
    candidateUserId: request.candidate_user_id, candidateEmail: request.candidate_email,
  })
  if (!user) return []
  return getSessionIdsByUser(user.id)
}

async function telemetryCounts(sessionId) {
  if (!isDbConfigured() || !isUuid(sessionId)) return {}
  const counts = {}
  const votes = await query(
    `SELECT COUNT(*) FROM judge_votes WHERE response_id IN
       (SELECT response_id FROM item_responses WHERE session_id = $1)`,
    [sessionId],
  ).catch(() => null)
  counts.judge_votes = Number(votes?.rows?.[0]?.count || 0)
  for (const [table, col] of TELEMETRY_CASCADE) {
    const r = await query(`SELECT COUNT(*) FROM ${table} WHERE ${col} = $1`, [sessionId]).catch(() => null)
    counts[table] = Number(r?.rows?.[0]?.count || 0)
  }
  return counts
}

// ── Dry run (mutates nothing) ────────────────────────────────────────────────
export async function buildErasurePlan(request) {
  const user = await resolveCandidate({
    candidateUserId: request.candidate_user_id, candidateEmail: request.candidate_email,
  })
  const sessionIds = await resolveSessionIds(request)

  const sessions = []
  for (const sid of sessionIds) {
    const [session, report, entitlement, consent, verification, dispute, events, items] = await Promise.all([
      getSession(sid), getReport(sid), getEntitlement(sid), getConsent(sid),
      getVerification(sid), getDispute(sid), getEvents(sid), getItemsBySession(sid),
    ])
    const telemetry = await telemetryCounts(sid)
    const activeCredentials = Number(telemetry.credentials || 0)
    sessions.push({
      sessionId: sid,
      store: {
        session: Boolean(session), report: Boolean(report), entitlement: Boolean(entitlement),
        consent: Boolean(consent), verification: Boolean(verification), dispute: Boolean(dispute),
        events: events.length, items: items.length,
      },
      telemetry,
      credentialsToDestroy: activeCredentials,
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: request.scope,
    candidate: user ? { id: user.id, email: user.email, name: user.name } : null,
    accountRecordWillBeDeleted: request.scope === 'candidate' && Boolean(user),
    sessions,
    preserved: [
      'admin_audit_events (immutable administrative trail — entity ids remain, content does not)',
      'study_results (append-only pseudonymous aggregates — no per-candidate rows)',
      'admin_exports ledger (who exported what, never the data itself)',
      'privacy_requests receipt (this request row is the compliance record)',
    ],
    notes: [
      'Signed credentials are DESTROYED (deletion is the one mutation the immutability trigger permits, exactly for this right); public verification links die with them.',
      'The erasure uses the same cascade as the candidate self-service right (account erasure cascade: v1 store, telemetry, Campus/V3 and account-level campus rows; append-only ledgers are pseudonymised).',
      'Charter §16: an ACTIVE LEGAL HOLD on any in-scope session or the candidate blocks execution until released.',
      'Charter §15: candidate_demographics rows for the candidate are deleted; anonymized aggregates survive by construction.',
    ],
  }
}

// ── Execution (the real cascade) ─────────────────────────────────────────────
// PROD-READY Phase 2 (S8): execution goes through the account erasure
// cascade (server/domain/privacy/erasureCascade.js) — the same service the
// candidate self-service right uses. It erases every session (v1 store,
// telemetry swept regardless of PRISM_V2_TELEMETRY, Campus/V3 store) and every
// campus-era row of the person, records each step in the erasure ledger, and
// for candidate-scope requests deletes the account record as its last step.
export async function executeErasure(request) {
  const user = await resolveCandidate({
    candidateUserId: request.candidate_user_id, candidateEmail: request.candidate_email,
  })
  const sessionIds = await resolveSessionIds(request)

  // Charter §16: candidate erasure supersedes normal retention EXCEPT a legal
  // hold — an active hold on any in-scope session or the candidate refuses
  // the execution until released (the request stays awaiting).
  const { holdCovering } = await import('./retentionEnforcement.js')
  const hold = await holdCovering({
    sessionIds,
    candidateRefs: [user?.id, user?.candidateId, user?.email].filter(Boolean),
  })
  if (hold) {
    const err = new Error('LEGAL_HOLD_ACTIVE')
    err.code = 'LEGAL_HOLD_ACTIVE'
    err.holdId = hold.hold_id
    throw err
  }

  const receipt = {
    executedAt: new Date().toISOString(),
    scope: request.scope,
    sessions: [],
    accountDeleted: false,
  }
  const { defaultErasureCascade } = await import('../domain/privacy/erasureCascade.js')
  const cascade = defaultErasureCascade()
  const view = (r) => ({ sessionId: r.sessionId, storeRemoved: r.storeRemoved, campus: r.campus, telemetry: r.telemetry })
  if (request.scope === 'candidate' && user) {
    const run = await cascade.run({
      userId: user.id,
      email: user.email,
      candidateId: user.candidateId || null,
      initiatedBy: 'ADMIN_REQUEST',
      scope: 'ACCOUNT',
      // Charter §15: re-identifiable demographic records go through the same
      // candidate-erasure flow (keyed by the pseudonymous candidate_id).
      // Properly anonymized aggregates — calibration parameters, approved
      // aggregate statistics, published findings — survive by construction
      // (they carry no per-candidate rows).
      accountStep: async () => {
        let demographicsDeleted = 0
        if (isDbConfigured() && user.candidateId) {
          const demo = await query(
            'DELETE FROM candidate_demographics WHERE candidate_id = $1', [user.candidateId],
          ).catch(() => null)
          demographicsDeleted = demo?.rowCount ?? 0
        }
        await deleteUser(user.id)
        return { demographicsDeleted }
      },
    })
    receipt.sessions = run.sessions.map(view)
    receipt.campusUser = run.user
    receipt.erasureRunId = run.runId
    receipt.accountDeleted = run.accountDeleted
    if (run.account) receipt.demographicsDeleted = run.account.demographicsDeleted
    return receipt
  }
  for (const sid of sessionIds) receipt.sessions.push(view(await cascade.eraseSessionEverywhere(sid)))
  return receipt
}

// ── Access / export package (the candidate's own data) ──────────────────────
export async function buildAccessPackage(request) {
  const user = await resolveCandidate({
    candidateUserId: request.candidate_user_id, candidateEmail: request.candidate_email,
  })
  const sessionIds = await resolveSessionIds(request)
  const sessions = []
  for (const sid of sessionIds) {
    const [session, report, entitlement, consent, verification, dispute, events] = await Promise.all([
      getSession(sid), getReport(sid), getEntitlement(sid), getConsent(sid),
      getVerification(sid), getDispute(sid), getEvents(sid),
    ])
    sessions.push({ sessionId: sid, session, report, entitlement, consent, verification, dispute, events })
  }
  let timeline = []
  if (isDbConfigured() && user?.candidateId) {
    timeline = await query(
      `SELECT session_id, attempt_no, scenario_key, scale_version, language, is_synthetic, completed_at
         FROM assessment_timeline WHERE candidate_id = $1 ORDER BY completed_at`,
      [user.candidateId],
    ).then((r) => r?.rows || []).catch(() => [])
  }
  return {
    generatedAt: new Date().toISOString(),
    account: user ? { ...publicUser(user), candidateId: user.candidateId || null } : null,
    sessions,
    timeline,
  }
}
