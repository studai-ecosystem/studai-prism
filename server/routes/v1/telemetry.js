// POST /api/v1/telemetry — product events (spec §46; C4.13). Unknown events
// are rejected; props outside the allow-list are dropped server-side (the
// client filters too). Stored pseudonymously; never blocks the UI.
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag } from '../../domain/flags/index.js'

const Event = z.object({
  event: z.string().min(1).max(60),
  props: z.record(z.unknown()).optional(),
  occurredAt: z.string().max(40).optional(),
}).strict()

export function createTelemetryRouter({ requireUser, campus }) {
  const router = Router()
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false })

  router.post('/telemetry', requireFlag('PRISM_APP_SHELL_V3'), limiter, requireUser, campus.resolveWorkspace, asyncHandler(async (req, res) => {
    const parsed = Event.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Event is not valid.')
    const result = await campus.telemetry.record({ user: req.user, workspace: req.workspace, ...parsed.data })
    return ok(res, { accepted: true, stored: result.stored, dropped: result.dropped }, 202)
  }))

  return router
}
