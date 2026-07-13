// Privacy request planner & executor (Control Centre Phase 6, plan §21).
//
// Erasure is a two-phase, dual-approved operation:
//   1. buildErasurePlan()   — DRY RUN: counts everything that WOULD be
//      deleted (store buckets + every telemetry/research table the cascade
//      covers), what would be revoked/destroyed (credentials), and what is
//      PRESERVED (admin audit trail, append-only study aggregates, export
//      ledger). Mutates nothing.
//   2. executeErasure()     — runs the REAL cascade (store eraseSession +
//      telemetry eraseTelemetry — the same code paths the candidate
//      self-service right uses) and, for candidate-scope requests, deletes
//      the account record. Returns the receipt.
//
// buildAccessPackage() assembles a candidate's own data for access/export
// requests (their data, unmasked — it is theirs).

import { query, isDbConfigured } from '../db/pool.js'
import {
  getSessionIdsByUser, getSession, getReport, getEntitlement, getConsent,
  getVerification, getDispute, getEvents, getItemsBySession, eraseSession,
} from './store.js'
import { findUserByEmail, findUserById, deleteUser, publicUser } from './db.js'
import { eraseTelemetry } from './telemetry.js'

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
      'The erasure uses the same cascade as the candidate self-service right (store eraseSession + telemetry eraseTelemetry).',
    ],
  }
}

// ── Execution (the real cascade) ─────────────────────────────────────────────
// eraseTelemetry is gated on PRISM_V2_TELEMETRY (a flag-off deployment writes
// no telemetry, so the self-service path has nothing to erase). An ADMIN
// erasure must be reliable regardless of flag state — historical rows may
// predate a flag flip — so after the shared cascade we sweep the same table
// list directly, gated only on the database being configured.
async function eraseTelemetryUnconditionally(sessionId) {
  if (!isDbConfigured() || !isUuid(sessionId)) return {}
  const counts = {}
  const votes = await query(
    `DELETE FROM judge_votes WHERE response_id IN
       (SELECT response_id FROM item_responses WHERE session_id = $1)`,
    [sessionId],
  ).catch(() => null)
  counts.judge_votes = votes?.rowCount ?? 0
  for (const [table, col] of TELEMETRY_CASCADE) {
    const r = await query(`DELETE FROM ${table} WHERE ${col} = $1`, [sessionId]).catch(() => null)
    counts[table] = r?.rowCount ?? 0
  }
  return counts
}

export async function executeErasure(request) {
  const user = await resolveCandidate({
    candidateUserId: request.candidate_user_id, candidateEmail: request.candidate_email,
  })
  const sessionIds = await resolveSessionIds(request)
  const receipt = {
    executedAt: new Date().toISOString(),
    scope: request.scope,
    sessions: [],
    accountDeleted: false,
  }
  for (const sid of sessionIds) {
    const storeRemoved = await eraseSession(sid)
    // Shared cascade first (keeps behavior identical to the candidate
    // self-service right), then the unconditional sweep for flag-off gaps.
    const viaFlag = await eraseTelemetry(sid)
    const swept = await eraseTelemetryUnconditionally(sid)
    const telemetry = {}
    for (const k of new Set([...Object.keys(viaFlag), ...Object.keys(swept)])) {
      telemetry[k] = (viaFlag[k] || 0) + (swept[k] || 0)
    }
    receipt.sessions.push({ sessionId: sid, storeRemoved, telemetry })
  }
  if (request.scope === 'candidate' && user) {
    await deleteUser(user.id)
    receipt.accountDeleted = true
  }
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
