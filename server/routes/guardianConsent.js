// Under-18 guardian-consent routes (PROD-READY Phase 8). DARK: every route
// answers 404 while PRISM_UNDER18_PATH is off (registered OFF; a human
// enables it only after HA-006 and HA-005). Copy is DRAFT.
//
//   Learner (signed in), mounted at /api/auth/guardian-consent:
//     GET  /         status of the latest request (no guardian address returned)
//     POST /resend   { guardianEmail? } a new link; the open one lapses
//   Guardian (the emailed link), mounted at /api/guardian-consent:
//     GET  /:token           what is asked (draft copy) and the state
//     POST /:token           { decision: GRANT | DECLINE }
//     POST /:token/withdraw  withdraw a given consent
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import logger from '../lib/logger.js'
import { getJwtSecret, guardianLinkLimiter } from '../lib/security.js'
import { findUserById, recordAgeDeclaration, clearGuardianAgeDeclaration } from '../lib/db.js'
import { isMailEnabled, sendGuardianConsentEmail } from '../lib/mailer.js'
import { createGuardianConsentRepo } from '../domain/guardian/repository.js'
import { createGuardianConsentService, isUnder18PathEnabled, GuardianConsentError } from '../domain/guardian/service.js'

let defaultService = null
export function defaultGuardianService() {
  if (!defaultService) {
    const base = (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '')
    defaultService = createGuardianConsentService({
      repo: createGuardianConsentRepo(),
      users: { findById: findUserById, recordAgeDeclaration, clearGuardianAgeDeclaration },
      // Without a configured public URL there is no safe absolute link to send.
      sendGuardianEmail: async (msg) => (isMailEnabled() && base ? sendGuardianConsentEmail(msg) : false),
      linkFor: (token) => `${base}/guardian-consent/${encodeURIComponent(token)}`,
    })
  }
  return defaultService
}


const dark = (_req, res, next) => (isUnder18PathEnabled() ? next() : res.status(404).json({ error: 'Not found' }))

function fail(res, err, req, msg) {
  if (err instanceof GuardianConsentError) {
    if (err.status === 404) return res.status(404).json({ error: 'Not found' })
    return res.status(err.status).json({ error: err.message, code: err.code })
  }
  logger.captureException(err, { msg, requestId: req.requestId })
  return res.status(500).json({ error: 'Something went wrong. Please try again.' })
}

async function signedInUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try {
    const payload = jwt.verify(token, getJwtSecret())
    const user = await findUserById(payload.sub)
    if (!user || (payload.tv || 0) !== (user.tokenVersion || 0) || user.accountState === 'suspended') return null
    return user
  } catch {
    return null
  }
}

export function createLearnerGuardianRouter({ service = null } = {}) {
  const router = Router()
  const svc = () => service || defaultGuardianService()
  router.use(dark)
  router.get('/', async (req, res) => {
    try {
      const user = await signedInUser(req)
      if (!user) return res.status(401).json({ error: 'Not authenticated.' })
      res.json({ consent: await svc().statusFor(user) })
    } catch (err) { fail(res, err, req, 'guardian_consent_status_failed') }
  })
  router.post('/resend', async (req, res) => {
    try {
      const user = await signedInUser(req)
      if (!user) return res.status(401).json({ error: 'Not authenticated.' })
      res.json(await svc().resend(user, req.body?.guardianEmail || null))
    } catch (err) { fail(res, err, req, 'guardian_consent_resend_failed') }
  })
  return router
}

export function createGuardianRouter({ service = null } = {}) {
  const router = Router()
  const svc = () => service || defaultGuardianService()
  router.use(dark)
  router.use(guardianLinkLimiter)
  router.get('/:token', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store')
      res.json(await svc().view(req.params.token))
    } catch (err) { fail(res, err, req, 'guardian_consent_view_failed') }
  })
  router.post('/:token', async (req, res) => {
    try {
      res.json({ consent: await svc().decide(req.params.token, String(req.body?.decision || '')) })
    } catch (err) { fail(res, err, req, 'guardian_consent_decide_failed') }
  })
  router.post('/:token/withdraw', async (req, res) => {
    try {
      res.json({ consent: await svc().withdraw(req.params.token) })
    } catch (err) { fail(res, err, req, 'guardian_consent_withdraw_failed') }
  })
  return router
}
