// /api/v1/preview — P8.3 free first experience (public, rate-limited by the
// app-level apiLimiter). The scene is briefing + one prompt; the observation
// is a deterministic check of the learner's own words; one retry; linking to
// an account is an explicit claim with the scoped token after sign-in.
//   GET  /preview/scene
//   POST /preview/attempts           { answer }
//   POST /preview/attempts/retry     { previewToken, answer }
//   GET  /preview/attempts/current   ?token= (never a raw report URL: the token is a bearer capability)
//   POST /preview/claim              { previewToken }   (signed in)
//   GET  /me/previews                                    (signed in)
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'

const Answer = z.object({ answer: z.string().min(1).max(1500) }).strict()
const Retry = z.object({ previewToken: z.string().min(10).max(200), answer: z.string().min(1).max(1500) }).strict()
const Claim = z.object({ previewToken: z.string().min(10).max(200) }).strict()

export function createPreviewRouter({ requireUser, campus }) {
  const router = Router()
  const requireStore = (_req, _res, next) => (campus.storeAvailable()
    ? next()
    : next(new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The preview is temporarily unavailable.')))

  router.get('/preview/scene', (_req, res) => ok(res, campus.preview.scene()))

  router.post('/preview/attempts', requireStore, asyncHandler(async (req, res) => {
    const parsed = Answer.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Write a few sentences (up to 1500 characters).')
    return ok(res, await campus.preview.start(parsed.data), 201)
  }))

  router.post('/preview/attempts/retry', requireStore, asyncHandler(async (req, res) => {
    const parsed = Retry.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Write a few sentences (up to 1500 characters).')
    return ok(res, await campus.preview.retry(parsed.data))
  }))

  router.post('/preview/attempts/current', requireStore, asyncHandler(async (req, res) => {
    const parsed = Claim.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'That preview link is not valid.')
    return ok(res, await campus.preview.read(parsed.data))
  }))

  router.post('/preview/claim', requireUser, requireStore, asyncHandler(async (req, res) => {
    const parsed = Claim.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'That preview link is not valid.')
    const result = await campus.preview.claim({ previewToken: parsed.data.previewToken, user: req.user })
    campus.audit('preview.claimed', null, { attemptId: result.attemptId, alreadyClaimed: result.alreadyClaimed, requestId: req.requestId })
    return ok(res, result)
  }))

  router.get('/me/previews', requireUser, requireStore, asyncHandler(async (req, res) => ok(res, { items: await campus.preview.listForUser(req.user) })))

  return router
}
