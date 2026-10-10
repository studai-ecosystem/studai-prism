// Erasure pseudonym key status (PROD-READY Phase 3; decision in
// docs/production/PROD_READY_STATE.md). Pseudonyms written into append-only
// audit and billing rows on erasure are HMACs under PRISM_ERASURE_PSEUDONYM_KEY.
//
// Production fails CLOSED without a real key. The development default is
// public (it is in this file), so pseudonyms made with it could be recomputed by anyone holding
// the code and an account id. In production, erasure answers 503
// ERASURE_NOT_CONFIGURED before touching anything, and startup logs
// `erasure_pseudonym_key_missing`; the rest of the service keeps running.
// Development and tests keep the default.
export const DEVELOPMENT_PSEUDONYM_KEY = 'prism-erasure-v1'
export const MIN_PSEUDONYM_KEY_LENGTH = 32
export function erasureKeyStatus(env = process.env) {
  const key = env.PRISM_ERASURE_PSEUDONYM_KEY || ''
  if (env.NODE_ENV !== 'production') return { ok: true, configured: Boolean(key) }
  if (!key) return { ok: false, configured: false, reason: 'MISSING' }
  if (key === DEVELOPMENT_PSEUDONYM_KEY || key.length < MIN_PSEUDONYM_KEY_LENGTH) return { ok: false, configured: true, reason: 'WEAK' }
  return { ok: true, configured: true }
}
export function erasureNotConfiguredError(status = erasureKeyStatus()) {
  const err = new Error(`Erasure is not configured: PRISM_ERASURE_PSEUDONYM_KEY is ${status.reason === 'WEAK' ? 'too weak' : 'missing'} in production.`)
  err.code = 'ERASURE_NOT_CONFIGURED'
  err.status = 503
  err.reason = status.reason || null
  return err
}
export function assertErasureConfigured(env = process.env) {
  const status = erasureKeyStatus(env)
  if (!status.ok) throw erasureNotConfiguredError(status)
}

// Startup warning (index.js): logged once in production when the key is
// missing or weak, so the operator sees it before the first erasure request.
export function warnIfErasureKeyMissing(logger, env = process.env) {
  const status = erasureKeyStatus(env)
  if (status.ok) return false
  logger.warn('erasure_pseudonym_key_missing', {
    reason: status.reason,
    detail: 'PRISM_ERASURE_PSEUDONYM_KEY must be a secret of at least 32 characters in production; until it is set, erasure requests answer 503 ERASURE_NOT_CONFIGURED and nothing is erased.',
  })
  return true
}
