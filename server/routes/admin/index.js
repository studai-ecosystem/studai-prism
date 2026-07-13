// /api/admin — Super Admin & Product Control Centre router assembly (Phase 1).
//
// Ship-dark contract: the ENTIRE plane 404s unless PRISM_ADMIN_CONSOLE=true
// (same dark-launch convention as replay/teamfit). With the flag on but no
// database, it answers 503 — admin identities are database-backed only.
//
// Request pipeline for protected namespaces:
//   dark gate → DB gate → rate limit → requireAdminAuth (identity + session
//   revocation check) → requireCsrf (mutations) → adminAuditMiddleware
//   (mutation safety net) → namespace router → requirePermission per endpoint.
//
// The legacy x-admin-token planes (/api/pilot, /api/psychometrics, admin
// halves of studies/credentials/teamfit) are UNTOUCHED in Phase 1 and retire
// in Phase 6 of the Control Centre plan.

import { Router } from 'express'
import { isDbConfigured } from '../../db/pool.js'
import { seedRbac } from '../../lib/adminRbac.js'
import { requireAdminAuth, requireCsrf } from '../../lib/adminAuth.js'
import { adminAuditMiddleware } from '../../lib/adminAudit.js'
import { adminAuthLimiter, adminApiLimiter } from '../../lib/security.js'
import logger from '../../lib/logger.js'
import authRouter from './auth.js'
import adminsRouter from './admins.js'
import dashboardRouter from './dashboard.js'
import usersRouter from './users.js'
import sessionsRouter from './sessions.js'
import reportsRouter from './reports.js'
import disputesRouter from './disputes.js'
import paymentsRouter from './payments.js'
import recordsRouter from './records.js'
import searchRouter from './search.js'
import bankRouter from './bank.js'
import calibrationsRouter from './calibrations.js'
import ratersRouter from './raters.js'
import studiesRouter from './studies.js'
import promptsRouter from './prompts.js'
import psychometricsRouter from './psychometrics.js'
import credentialsRouter from './credentials.js'
import replaysRouter from './replays.js'
import teamfitRouter from './teamfit.js'
import exportsRouter from './exports.js'
import contentRouter from './content.js'
import flagsRouter from './flags.js'
import systemRouter from './system.js'
import privacyRouter from './privacy.js'
import auditRouter from './audit.js'

const router = Router()

export function isAdminConsoleEnabled() {
  return process.env.PRISM_ADMIN_CONSOLE === 'true'
}

// Idempotent RBAC catalogue seed, once per boot (studies boot-seed pattern).
let seeded = false
async function ensureSeeded() {
  if (seeded) return
  seeded = true
  try {
    await seedRbac()
    logger.info('admin_rbac_seeded')
  } catch (err) {
    seeded = false // retry on next request — table may not exist until migrate runs
    logger.captureException(err, { msg: 'admin_rbac_seed_failed' })
  }
}

router.use(async (req, res, next) => {
  if (!isAdminConsoleEnabled()) return res.status(404).json({ error: 'Not found' })
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'admin console requires a configured database', code: 'NO_DB' })
  }
  await ensureSeeded()
  next()
})

// Credential-bearing endpoints get the strict brute-force limiter (5/min/IP).
// Session-management endpoints (refresh/logout/me/sessions) authenticate with
// a 48-byte random cookie or an access token — not guessable credentials — and
// fire on every page load, so they ride the broader console limiter instead.
router.use(['/auth/login', '/auth/mfa', '/auth/break-glass', '/auth/password'], adminAuthLimiter)
router.use('/auth', adminApiLimiter, authRouter)

// Everything else: authenticated + CSRF-checked + audited. A bootstrap/reset
// password MUST be changed before any other administration is possible.
router.use(adminApiLimiter, requireAdminAuth, requireCsrf, adminAuditMiddleware)
router.use((req, res, next) => {
  if (req.admin?.mustChangePassword) {
    return res.status(403).json({
      error: 'Password change required before using the console.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    })
  }
  next()
})
router.use('/admins', adminsRouter)
router.use('/dashboard', dashboardRouter)
// Phase 2 — core product administration.
router.use('/users', usersRouter)
router.use('/sessions', sessionsRouter)
router.use('/reports', reportsRouter)
router.use('/disputes', disputesRouter)
router.use('/payments', paymentsRouter)
router.use('/records', recordsRouter)
router.use('/search', searchRouter)
// Phase 3 — scientific administration.
router.use('/bank', bankRouter)
router.use('/calibrations', calibrationsRouter)
router.use('/raters', ratersRouter)
router.use('/studies', studiesRouter)
router.use('/prompts', promptsRouter)
router.use('/psychometrics', psychometricsRouter)
// Phase 4 — credentials & advanced product administration.
router.use('/credentials', credentialsRouter)
router.use('/replays', replaysRouter)
router.use('/teamfit', teamfitRouter)
router.use('/exports', exportsRouter)
// Phase 5 — CMS & system administration.
router.use('/content', contentRouter)
router.use('/flags', flagsRouter)
router.use('/system', systemRouter)
// Phase 6 — privacy & enterprise governance.
router.use('/privacy', privacyRouter)
router.use('/audit', auditRouter)

export default router
