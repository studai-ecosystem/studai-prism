// /api/v1/org-invites/:token — student/staff activation (spec §37.2).
//   GET   public preview: organization, role, what it can and cannot see
//   POST  /accept   signed-in account whose email matches; explicit acknowledgement
//   POST  /decline  signed-in account whose email matches
// Distinct from legacy /api/payment/invite (assessment invites), which is unchanged.
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'

const Accept = z.object({ acknowledged: z.literal(true) }).strict()

export function createOrgInvitesRouter({ requireUser, campus }) {
  const router = Router()
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false })

  router.use('/org-invites', campus.requireCampus, limiter)

  router.get('/org-invites/:token', asyncHandler(async (req, res) => {
    const invite = await campus.invites.getInvite(req.params.token)
    if (!invite) throw new ApiError('NOT_FOUND', 'This invitation is not valid.')
    return ok(res, invite)
  }))

  router.post('/org-invites/:token/accept', requireUser, asyncHandler(async (req, res) => {
    const parsed = Accept.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Please confirm you have read what your institution can and cannot see.')
    const result = await campus.invites.acceptInvite({ token: req.params.token, user: req.user, acknowledged: true })
    return ok(res, result)
  }))

  router.post('/org-invites/:token/decline', requireUser, asyncHandler(async (req, res) => {
    const result = await campus.invites.declineInvite({ token: req.params.token, user: req.user })
    return ok(res, result)
  }))

  return router
}
