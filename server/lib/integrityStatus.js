// Charter §10/§14 — neutral integrity status (Phase 3).
//
// The ONLY integrity information any buyer, institution, share-token or
// verification surface may carry is one of three neutral statuses
// (INTEGRITY_STATUSES in sharedConstants). Raw integrity events, webcam/gaze
// telemetry, typing cadence and focus-loss logs NEVER leave the platform.
// Integrity signals never change capability scores — they can only route a
// session to human review (§14).

import { query, isDbConfigured } from '../db/pool.js'
import { INTEGRITY_STATUSES } from './sharedConstants.js'

// Live invalidation check (admin_session_states.invalid, set by the audited
// sessions:invalidate workflow). Without a DB no invalidation record can exist.
export async function sessionInvalidated(sessionId) {
  if (!isDbConfigured()) return false
  const r = await query(
    'SELECT invalid FROM admin_session_states WHERE session_id = $1',
    [sessionId],
  ).catch(() => null)
  return Boolean(r?.rows?.[0]?.invalid)
}

// Pure tri-status decision — unit-testable without a DB.
export function integrityStatusFor({ invalidated = false, flaggedForReview = false, reviewStatus = null } = {}) {
  if (invalidated) return INTEGRITY_STATUSES.invalidated
  if (flaggedForReview || reviewStatus === 'in_review' || reviewStatus === 'human_review_pending') {
    return INTEGRITY_STATUSES.review
  }
  return INTEGRITY_STATUSES.met
}

// The status for a session, from its (bundle- or report-shaped) record.
export async function integrityStatusForSession(sessionId, record = {}) {
  const invalidated = await sessionInvalidated(sessionId)
  return integrityStatusFor({
    invalidated,
    flaggedForReview: Boolean(record?.reliability?.flaggedForReview),
    reviewStatus: record?.reviewStatus || record?.review?.status || null,
  })
}
