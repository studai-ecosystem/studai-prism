// Owner checks for the frozen legacy assessment router (PROD-READY Phase 1S,
// audit 2026-10-10, SECURITY_REVIEW addendum N1/N6). The router
// (`routes/assessment.js`) is frozen, so — like K103/K104 — these middlewares
// are mounted in `server/app.js` in front of it and the router is untouched.
//
//  - createLegacyErasureGuard: `DELETE /api/assessment/data/:sessionId` erases
//    a candidate's session, report and payment record. Session ids appear in
//    public report links, so only the signed-in owner may erase. Signed out,
//    another account, an ownerless session and an unknown id all get the same
//    404, so the response never reveals whether the session exists (K103).
//  - createLegacyOwnerBinding: the session-keyed WRITE routes (consent,
//    identity check, accommodation, human review, work materials). When the
//    session has a recorded owner, only that signed-in owner passes (404
//    otherwise). Sessions without an owner exist only on the anonymous
//    development path (`/start` outside production); those keep the router's
//    own checks, exactly as the router's `/event` route does (audit C9).
//  - createRevokedTokenGate: the frozen router decodes bearer tokens without
//    checking the token version or account state. A token that was revoked
//    (password change, admin revocation) or belongs to a suspended account is
//    refused before the router runs. A validly signed token whose account
//    record is absent passes as before (the router's own tests and the
//    anonymous development path rely on it; a deleted account's sessions are
//    erased with it, so it reaches nothing).
//  - createTranscribeGuard: `/transcribe` (paid speech-to-text) needs an
//    existing session; an owned session needs its signed-in owner. Only
//    audio uploads are accepted.
import { authenticate as defaultAuthenticate } from '../domain/auth/requireUser.js'
import logger from './logger.js'
import { erasureKeyStatus } from './erasureKey.js'

// { exists, owner } for a legacy session id: the owner recorded on the live
// session, the entitlement (payment / invite / dev session) or the issued report.
export function legacySessionOwnerFrom({ getSession, getEntitlement, getReport }) {
  return async (sessionId) => {
    if (!sessionId) return { exists: false, owner: null }
    const [session, entitlement, report] = await Promise.all([
      getSession(sessionId), getEntitlement(sessionId), getReport(sessionId),
    ])
    const owner = session?.userId || entitlement?.userId || report?.userId || null
    return { exists: Boolean(session || entitlement || report), owner: owner ? String(owner) : null }
  }
}

function sessionIdOf(req) {
  const raw = req.params?.sessionId ?? req.body?.sessionId ?? ''
  return typeof raw === 'string' ? raw : String(raw)
}

const notFound = (res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' })
const failed = (req, res, msg, err) => {
  logger.captureException(err, { msg, requestId: req.requestId })
  return res.status(500).json({ error: 'Internal server error' })
}

export function createLegacyErasureGuard({ authenticate = defaultAuthenticate, lookup }) {
  return async function legacyErasureGuard(req, res, next) {
    try {
      const { user } = await authenticate(req)
      if (!user) return notFound(res)
      const { owner } = await lookup(sessionIdOf(req))
      if (!owner || owner !== String(user.id)) return notFound(res)
      // PROD-READY Phase 3: production without the erasure pseudonym key
      // refuses before the router erases anything (503, retryable).
      if (!erasureKeyStatus().ok) return res.status(503).json({ error: 'Erasure is temporarily unavailable. Nothing was deleted; please try again later.', code: 'ERASURE_NOT_CONFIGURED' })
      return next()
    } catch (err) {
      return failed(req, res, 'legacy_erasure_guard_failed', err)
    }
  }
}

export function createLegacyOwnerBinding({ authenticate = defaultAuthenticate, lookup }) {
  return async function legacyOwnerBinding(req, res, next) {
    const sessionId = sessionIdOf(req)
    if (!sessionId) return next() // the router answers 400 for a missing id
    try {
      const { owner } = await lookup(sessionId)
      if (!owner) return next()
      const { user } = await authenticate(req)
      if (!user || String(user.id) !== owner) return notFound(res)
      return next()
    } catch (err) {
      return failed(req, res, 'legacy_owner_binding_failed', err)
    }
  }
}

function hasBearer(req) {
  const header = req.get?.('authorization') || req.headers?.authorization || ''
  return header.startsWith('Bearer ')
}

export function createRevokedTokenGate({ authenticate = defaultAuthenticate } = {}) {
  return async function revokedTokenGate(req, res, next) {
    if (!hasBearer(req)) return next()
    try {
      const { user, reason } = await authenticate(req)
      if (user) return next()
      if (reason === 'suspended') return res.status(403).json({ error: 'This account is suspended.', code: 'ACCOUNT_SUSPENDED' })
      if (reason === 'revoked') {
        return res.status(401).json({ error: 'Your sign-in has ended. Please sign in again.', code: 'SESSION_REVOKED' })
      }
      // An unverifiable token ('invalid': bad signature or expired) is what
      // the router already treats as anonymous; the owner checks above handle it.
      return next()
    } catch (err) {
      return failed(req, res, 'revoked_token_gate_failed', err)
    }
  }
}

export function isAudioUpload(file) {
  return typeof file?.mimetype === 'string' && /^audio\/[a-z0-9.+-]+$/i.test(file.mimetype.split(';')[0].trim())
}

// Runs after the upload was parsed (req.file / req.body are set).
export function createTranscribeGuard({ authenticate = defaultAuthenticate, lookup, production = () => process.env.NODE_ENV === 'production' }) {
  return async function transcribeGuard(req, res, next) {
    try {
      const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : ''
      const { exists, owner } = await lookup(sessionId)
      if (!exists) return notFound(res)
      if (owner || production()) {
        const { user } = await authenticate(req)
        if (!user || !owner || String(user.id) !== owner) return notFound(res)
      }
      return next()
    } catch (err) {
      return failed(req, res, 'transcribe_guard_failed', err)
    }
  }
}
