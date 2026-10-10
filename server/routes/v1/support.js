// /api/v1 V3 support routes (PROD-READY Phase 4; CAMPUS_FINAL_REPORT §7).
// Dark unless PRISM_APP_SHELL_V3 and PRISM_V3_SUPPORT_ROUTES are on (404
// otherwise, indistinguishable from a missing route). Owner-only: the caller's
// own V3 session or assignment in the active student workspace.
//   GET  /assessment-sessions/:sessionId/human-review            status of the free human review
//   POST /assessment-sessions/:sessionId/human-review            Idempotency-Key; request it (one per assessment)
//   GET  /assessment-assignments/:assignmentId/accommodation     status of the pre-start request
//   POST /assessment-assignments/:assignmentId/accommodation     Idempotency-Key; request / change before the start
//   GET  /assessment-sessions/:sessionId/identity-check          current assurance level and options
//   POST /assessment-sessions/:sessionId/identity-check          Idempotency-Key; Level 1 self-declaration
//   GET  /me/support-requests                                    the caller's reviews and adjustment requests
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag } from '../../domain/flags/index.js'
import { createMemoryIdempotencyStore, idempotent } from '../../domain/http/idempotency.js'
import { studentScoped } from './studentScope.js'
import { REVIEW_REASON_MAX, REVIEW_REASON_MIN, DECLARED_NAME_MAX } from '../../domain/support/service.js'
import { NEEDS_MAX, NEEDS_MIN } from '../../domain/support/accommodationRepository.js'
import logger from '../../lib/logger.js'

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/
const ASSIGNMENT_ID = /^(pa_[0-9a-f]{32}|[0-9a-f-]{36})$/i

const HumanReview = z.object({
  reason: z.string().trim().min(REVIEW_REASON_MIN).max(REVIEW_REASON_MAX),
  version: z.number().int().min(1).optional(),
}).strict()
const Accommodation = z.object({
  needs: z.string().trim().min(NEEDS_MIN).max(NEEDS_MAX),
}).strict()
const IdentityCheck = z.object({
  level: z.enum(['L1', 'L2', 'L3']),
  declaredName: z.string().trim().min(2).max(DECLARED_NAME_MAX).optional(),
  confirm: z.literal(true),
}).strict()

export function createSupportRouter({ requireUser, campus, idempotencyStore = createMemoryIdempotencyStore() }) {
  const router = Router()
  const flags = [requireFlag('PRISM_APP_SHELL_V3'), requireFlag('PRISM_V3_SUPPORT_ROUTES')]
  const available = (_req, _res, next) => (campus.storeAvailable() && campus.support
    ? next()
    : next(new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Support requests are temporarily unavailable.')))
  const scoped = [...flags, ...studentScoped({ requireUser, campus }), available]
  // The existing idempotency middleware replays the first 2xx answer for the
  // same (user, route, key) on this instance; across instances the domain is
  // idempotent itself (one human review per session, one request per
  // assignment, a write-once identity declaration), so a replay elsewhere
  // returns the same record instead of a duplicate.
  const once = idempotent({ store: idempotencyStore, scope: 'v1-support', onStoreError: (err, req) => logger.captureException(err, { msg: 'support_idempotency_store_failed', requestId: req.requestId }) })
  const sessionParam = (req, _res, next) => (SESSION_ID.test(req.params.sessionId) ? next() : next(new ApiError('NOT_FOUND', 'Not found')))
  const assignmentParam = (req, _res, next) => (ASSIGNMENT_ID.test(req.params.assignmentId) ? next() : next(new ApiError('NOT_FOUND', 'Not found')))
  const parse = (schema, body, message) => {
    const parsed = schema.safeParse(body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', message)
    return parsed.data
  }
  const who = (req) => ({ user: req.user, workspace: req.workspace, requestId: req.requestId })

  router.get('/assessment-sessions/:sessionId/human-review', ...scoped, sessionParam, asyncHandler(async (req, res) => (
    ok(res, await campus.support.humanReviewStatus({ ...who(req), sessionId: req.params.sessionId }))
  )))
  router.post('/assessment-sessions/:sessionId/human-review', ...scoped, sessionParam, once, asyncHandler(async (req, res) => {
    const body = parse(HumanReview, req.body, `Tell us in ${REVIEW_REASON_MIN} to ${REVIEW_REASON_MAX} characters what you would like a person to look at.`)
    const out = await campus.support.requestHumanReview({ ...who(req), sessionId: req.params.sessionId, reason: body.reason, version: body.version ?? null })
    return ok(res, out.review, out.created ? 201 : 200)
  }))

  router.get('/assessment-assignments/:assignmentId/accommodation', ...scoped, assignmentParam, asyncHandler(async (req, res) => (
    ok(res, await campus.support.accommodationStatus({ ...who(req), assignmentId: req.params.assignmentId }))
  )))
  router.post('/assessment-assignments/:assignmentId/accommodation', ...scoped, assignmentParam, once, asyncHandler(async (req, res) => {
    const body = parse(Accommodation, req.body, `Describe what you need in ${NEEDS_MIN} to ${NEEDS_MAX} characters.`)
    const out = await campus.support.requestAccommodation({ ...who(req), assignmentId: req.params.assignmentId, needs: body.needs })
    return ok(res, out.accommodation, out.created ? 201 : 200)
  }))

  router.get('/assessment-sessions/:sessionId/identity-check', ...scoped, sessionParam, asyncHandler(async (req, res) => (
    ok(res, await campus.support.identityStatus({ ...who(req), sessionId: req.params.sessionId }))
  )))
  router.post('/assessment-sessions/:sessionId/identity-check', ...scoped, sessionParam, once, asyncHandler(async (req, res) => {
    const body = parse(IdentityCheck, req.body, 'Choose a level, confirm the statement and enter your full name.')
    const out = await campus.support.declareIdentity({ ...who(req), sessionId: req.params.sessionId, level: body.level, declaredName: body.declaredName })
    return ok(res, out.identity, out.created ? 201 : 200)
  }))

  router.get('/me/support-requests', ...scoped, asyncHandler(async (req, res) => (
    ok(res, await campus.support.listForUser(who(req)))
  )))

  return router
}
