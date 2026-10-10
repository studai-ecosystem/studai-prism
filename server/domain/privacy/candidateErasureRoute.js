// DELETE /api/assessment/candidate-data — self-service erasure through the
// account erasure cascade (PROD-READY Phase 2, SECURITY_REVIEW S8).
//
// The frozen legacy router answers this route by erasing the caller's v1
// sessions only; campus-era rows (memberships, invites, consents, roster
// rows, preferences, practice work, ...) were left behind. This handler is
// mounted in server/app.js BEFORE the router (K103/K104 pattern) and answers
// the request itself, so the router's handler is no longer reached and the
// router file stays untouched.
//
// Compatibility: same authentication as the router (a validly signed bearer
// token; revoked tokens and suspended accounts are already refused by the
// Phase 1S gate in front of /api/assessment), same 401 text, same success
// shape `{ ok, erasedSessions, results }` plus `erasure: { runId, status }`.
// New: an active legal hold answers 409 LEGAL_HOLD_ACTIVE (charter §16,
// RETENTION_POLICY §3) instead of erasing.
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../../lib/security.js'
import { findUserById as defaultFindUser } from '../../lib/db.js'
import { auditLog as defaultAuditLog } from '../../lib/telemetry.js'
import logger from '../../lib/logger.js'
import { defaultErasureCascade } from './erasureCascade.js'
import { erasureKeyStatus } from '../../lib/erasureKey.js'

// Shared 503 body when production lacks the erasure pseudonym key
// (PROD-READY Phase 3): nothing is erased, the person can retry later.
export const ERASURE_NOT_CONFIGURED_BODY = Object.freeze({
  error: 'Erasure is temporarily unavailable. Nothing was deleted; please try again later or contact support@studaione.com.',
  code: 'ERASURE_NOT_CONFIGURED',
})

function tokenSubject(req) {
  const header = req.headers?.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try {
    const payload = jwt.verify(token, getJwtSecret())
    return payload?.sub ? { id: String(payload.sub), email: payload.email || null } : null
  } catch {
    return null
  }
}

export function createCandidateErasureHandler({
  cascade = null,
  findUser = defaultFindUser,
  auditLog = defaultAuditLog,
} = {}) {
  return async function candidateErasure(req, res) {
    const auth = tokenSubject(req)
    if (!auth) return res.status(401).json({ error: 'Sign in to erase your data.' })
    if (!erasureKeyStatus().ok) {
      logger.error('erasure_refused_not_configured', { requestId: req.requestId || null })
      return res.status(503).json(ERASURE_NOT_CONFIGURED_BODY)
    }
    try {
      const record = await findUser(auth.id).catch(() => null)
      const receipt = await (cascade || defaultErasureCascade()).run({
        userId: auth.id,
        email: record?.email || auth.email,
        candidateId: record?.candidateId || null,
        initiatedBy: 'SELF_SERVICE',
        scope: 'DATA',
      })
      auditLog('candidate_erasure', null, { sessions: receipt.sessionCount, runId: receipt.runId, resumed: receipt.resumed })
      return res.json({
        ok: true,
        erasedSessions: receipt.sessionCount,
        results: receipt.sessions.map(({ sessionId, removed, telemetryRemoved, campusRemoved }) => ({ sessionId, removed, telemetryRemoved, campusRemoved })),
        erasure: { runId: receipt.runId, status: receipt.status, resumed: receipt.resumed },
      })
    } catch (err) {
      if (err?.code === 'ERASURE_NOT_CONFIGURED') return res.status(503).json(ERASURE_NOT_CONFIGURED_BODY)
      if (err?.code === 'LEGAL_HOLD_ACTIVE') {
        return res.status(409).json({ error: 'Your data is under a legal hold and cannot be erased yet. Contact support@studaione.com.', code: 'LEGAL_HOLD_ACTIVE' })
      }
      logger.captureException(err, { msg: 'candidate_data_delete_failed', requestId: req.requestId, erasureRunId: err?.erasureRunId || null })
      return res.status(500).json({ error: 'Failed to erase data' })
    }
  }
}
