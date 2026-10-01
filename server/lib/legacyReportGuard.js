// Owner-only access for the legacy report JSON routes (Campus Phase 12,
// C12.04 finding S7). `GET /api/assessment/report/:sessionId/v2` and
// `/employee` are served by the unchanged legacy router, which checks
// nothing: anyone with a session id could read the candidate's name and
// quotes. This guard runs in front of them (mounted in app.js, the legacy
// router is untouched): only the signed-in owner of the session gets
// through. Everyone else — signed out, another account, unknown session —
// gets the same 404, so the response never reveals whether a report exists.
// Staff read reports through the admin console; institutions through the
// sponsor-scoped Report V3 routes.
import { authenticate as defaultAuthenticate } from '../domain/auth/requireUser.js'
import logger from './logger.js'

export function createLegacyReportGuard({ authenticate = defaultAuthenticate, ownerOf }) {
  return async function legacyReportGuard(req, res, next) {
    const notFound = () => res.status(404).json({ error: 'Report not found', code: 'NOT_FOUND' })
    try {
      const { user } = await authenticate(req)
      if (!user) return notFound()
      const owner = await ownerOf(String(req.params.sessionId || ''))
      if (!owner || owner !== user.id) return notFound()
      return next()
    } catch (err) {
      logger.captureException(err, { msg: 'legacy_report_guard_failed', requestId: req.requestId })
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// The owner recorded on the session, or on the issued report.
export function sessionOwnerFrom({ getSession, getReport }) {
  return async (sessionId) => {
    if (!sessionId) return null
    const session = await getSession(sessionId)
    if (session?.userId) return String(session.userId)
    const report = await getReport(sessionId)
    return report?.userId ? String(report.userId) : null
  }
}

// Campus session lock for the other legacy session routes (Campus Phase 12,
// re-review finding S9). The frozen legacy router keys consent, messages,
// scoring, work materials, accommodations, reviews, identity checks and
// erasure on a session id alone. Campus staff legitimately learn the ids of
// sponsored sessions and of sessions a student shared with them, so for those
// ids the legacy HTTP surface is closed here (the router is untouched):
//  - V3 sessions (a V3 start was recorded, or the session is sponsored) are
//    driven only through /api/v1, whose adapter calls the router in-process
//    and never passes this middleware: every legacy HTTP call gets 404. This
//    also closes the `/workspace/:id?legacy=1` escape that would restart a
//    V3 conversation.
//  - Shared legacy sessions: only the signed-in owner passes; others get 404.
// Personal legacy sessions whose id was never disclosed keep today's
// behaviour (their frozen pages call some routes without a token).
export function createCampusSessionLock({ authenticate = defaultAuthenticate, classify }) {
  return async function campusSessionLock(req, res, next) {
    const sessionId = String(req.params?.sessionId || req.body?.sessionId || '')
    if (!sessionId) return next()
    const notFound = () => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
    try {
      const status = await classify(sessionId)
      if (status.v3) return notFound()
      if (status.shared) {
        const { user } = await authenticate(req)
        if (!user || user.id !== status.owner) return notFound()
      }
      return next()
    } catch (err) {
      logger.captureException(err, { msg: 'campus_session_lock_failed', requestId: req.requestId })
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
}

const V3_START_EVENT = 'start'

// `GET /api/assessment/report/:sessionId` (the issued report; the public
// verification view for personal sessions) returns dimension scores, theta,
// coverage and the account id/email. For a session campus staff can know
// (V3/sponsored or shared) it would bypass sponsor scope, disclosure level,
// revocation and the data-access audit, so only the signed-in owner gets it
// (frozen pages send the owner's token); everyone else gets 404. Personal
// sessions that were never disclosed stay public (verification links).
export function createCampusReportGate({ authenticate = defaultAuthenticate, classify, ownerOf }) {
  return async function campusReportGate(req, res, next) {
    const sessionId = String(req.params?.sessionId || '')
    if (!sessionId) return next()
    try {
      const status = await classify(sessionId)
      if (!status.v3 && !status.shared) return next()
      const [{ user }, owner] = await Promise.all([authenticate(req), ownerOf(sessionId)])
      if (!user || !owner || user.id !== owner) return res.status(404).json({ error: 'Report not found' })
      return next()
    } catch (err) {
      logger.captureException(err, { msg: 'campus_report_gate_failed', requestId: req.requestId })
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// Classifies a session id from the campus store. `repos()` is null when no
// campus store is configured: no campus session can exist then.
export function campusSessionStatusFrom({ repos, ownerOf }) {
  return async (sessionId) => {
    const r = repos()
    if (!r) return { v3: false, shared: false, owner: null }
    const [start, scope] = await Promise.all([
      r.sessionIo.getClientEvent(sessionId, V3_START_EVENT),
      r.scopes.getSessionScope(sessionId),
    ])
    if (start || (scope && scope.sponsorType !== 'PERSONAL')) return { v3: true, shared: false, owner: null }
    const owner = await ownerOf(sessionId)
    if (!owner) return { v3: false, shared: false, owner: null }
    const grants = await r.sharing.listShareGrantsForOwner(owner)
    const shared = grants.some((g) => (g.resources || []).some((x) => String(x.resourceId) === sessionId))
    return { v3: false, shared, owner }
  }
}

// Legacy routes that act on a session named in the path or the JSON body.
// Not listed: `/report/:sessionId` (owner-only for campus-known sessions via
// `createCampusReportGate` above, public otherwise),
// `/report/:sessionId/v2|employee` (owner-only guard above), `/send-report`
// and `/event` (owner-checked in the router), `/transcribe` (multipart; no
// session data returned), `/human-rating` (admin-guarded).
export const CAMPUS_LOCKED_BODY_ROUTES = Object.freeze([
  '/api/assessment/start', '/api/assessment/message', '/api/assessment/evaluate',
  '/api/assessment/verify-identity', '/api/assessment/speech', '/api/assessment/consent',
  '/api/assessment/accommodation', '/api/assessment/dispute', '/api/assessment/calibrate',
])
export const CAMPUS_LOCKED_PARAM_ROUTES = Object.freeze([
  '/api/assessment/evaluate-status/:sessionId', '/api/assessment/verify-identity/:sessionId',
  '/api/assessment/artifacts/:sessionId', '/api/assessment/accommodation/:sessionId',
  '/api/assessment/dispute/:sessionId', '/api/assessment/data/:sessionId',
])
