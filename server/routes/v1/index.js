// /api/v1 — versioned API (architecture contract §2–§3). Every sub-router is
// thin; domain services are injected so tests can swap repositories.
import { Router } from 'express'
import logger from '../../lib/logger.js'
import { requestId } from '../../domain/http/requestId.js'
import { ok, notFound, createErrorHandler } from '../../domain/http/errors.js'
import { requireUser as defaultRequireUser } from '../../domain/auth/requireUser.js'
import { createMeRouter } from './me.js'

export function createV1Router(deps = {}) {
  const requireUser = deps.requireUser || defaultRequireUser
  const router = Router()

  router.use(requestId)
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  router.get('/health', (_req, res) => ok(res, { status: 'ok' }))
  router.use(createMeRouter({ requireUser, listWorkspaces: deps.listWorkspaces }))

  router.use(notFound)
  router.use(createErrorHandler(logger))
  return router
}

export const v1ErrorHandler = createErrorHandler(logger)
