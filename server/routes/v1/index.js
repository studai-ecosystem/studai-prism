// /api/v1 — versioned API (architecture contract §2–§3). Every sub-router is
// thin; domain services are injected so tests can swap repositories.
import { Router } from 'express'
import logger from '../../lib/logger.js'
import { requestId } from '../../domain/http/requestId.js'
import { ok, notFound, createErrorHandler } from '../../domain/http/errors.js'
import { requireUser as defaultRequireUser } from '../../domain/auth/requireUser.js'
import { createDefaultCampusContext } from '../../domain/campusStore/defaultContext.js'
import { createMeRouter } from './me.js'
import { createWorkspacesRouter } from './workspaces.js'
import { createOrganizationsRouter } from './organizations.js'
import { createOrgInvitesRouter } from './orgInvites.js'
import { createEntitlementsRouter } from './entitlements.js'
import { createStudentRouter } from './student.js'
import { createTelemetryRouter } from './telemetry.js'
import { createAssessmentSessionsRouter } from './assessmentSessions.js'

export function createV1Router(deps = {}) {
  const requireUser = deps.requireUser || defaultRequireUser
  const campus = deps.campus || createDefaultCampusContext()
  const router = Router()

  router.use(requestId)
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/health', (_req, res) => ok(res, { status: 'ok' }))
  router.use(createMeRouter({ requireUser, campus }))
  router.use(createWorkspacesRouter({ requireUser, campus }))
  router.use(createEntitlementsRouter({ requireUser, campus }))
  router.use(createOrganizationsRouter({ requireUser, campus }))
  router.use(createOrgInvitesRouter({ requireUser, campus }))
  router.use(createStudentRouter({ requireUser, campus }))
  router.use(createTelemetryRouter({ requireUser, campus }))
  router.use(createAssessmentSessionsRouter({ requireUser, campus }))

  router.use(notFound)
  router.use(createErrorHandler(logger))
  return router
}

export const v1ErrorHandler = createErrorHandler(logger)
