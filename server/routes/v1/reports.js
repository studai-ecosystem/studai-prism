// /api/v1 Student Report V3 + student sharing (spec §14, §36.3; C6.02–C6.04).
// Dark unless PRISM_APP_SHELL_V3 and PRISM_STUDENT_REPORT_V3 are on.
//   GET    /assessment-sessions/:sessionId/report   the owner, in the session's workspace
//   GET    /assessment-sessions/:sessionId/report/versions         owner: version history
//   POST   /assessment-sessions/:sessionId/report/review-request   owner: ask for a human review
//   POST   /me/share-grants                          owner creates a link or organization share
//   DELETE /me/share-grants/:id                      owner revokes (same as POST …/revoke)
//   GET    /shared/:token                            public, rate-limited, selective disclosure
// Organization readers use GET /organizations/:orgId/sessions/:sessionId/report
// (organizations router), authorized by sponsorship or a student share grant.
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag } from '../../domain/flags/index.js'
import { studentScoped } from './studentScope.js'
import { MAX_SHARE_DAYS, REVIEW_REASON_MAX, REVIEW_REASON_MIN } from '../../domain/reports/v3/service.js'
import { REVIEW_CATEGORIES } from '../../domain/reports/v3/repository.js'
import { readReportVersion } from '../../domain/http/reportVersion.js'

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/

const ReviewRequest = z.object({
  version: z.number().int().min(1).optional(),
  category: z.enum(REVIEW_CATEGORIES).optional(),
  momentId: z.string().min(1).max(128).optional().nullable(),
  reason: z.string().trim().min(REVIEW_REASON_MIN).max(REVIEW_REASON_MAX),
}).strict()

const CreateShare = z.discriminatedUnion('recipientType', [
  z.object({
    recipientType: z.literal('LINK'),
    sessionId: z.string().regex(SESSION_ID),
    disclosureLevel: z.enum(['SUMMARY', 'FULL']),
    expiresInDays: z.number().int().min(1).max(MAX_SHARE_DAYS),
  }).strict(),
  z.object({
    recipientType: z.literal('ORGANIZATION'),
    recipientOrganizationId: z.string().regex(UUID),
    sessionId: z.string().regex(SESSION_ID),
    disclosureLevel: z.enum(['SUMMARY', 'FULL']),
    expiresInDays: z.number().int().min(1).max(MAX_SHARE_DAYS),
  }).strict(),
])

export function createReportsRouter({ requireUser, campus, clock = () => new Date() }) {
  const router = Router()
  const flags = [requireFlag('PRISM_APP_SHELL_V3'), requireFlag('PRISM_STUDENT_REPORT_V3')]
  const scoped = [...flags, ...studentScoped({ requireUser, campus })]
  const available = (_req, _res, next) => (campus.storeAvailable()
    ? next()
    : next(new ApiError('CAMPUS_STORE_UNAVAILABLE', 'Reports are temporarily unavailable.')))
  const sharedLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a few minutes.', requestId: req.requestId || null } }),
  })

  router.get('/assessment-sessions/:sessionId/report', ...scoped, available, asyncHandler(async (req, res) => {
    if (!SESSION_ID.test(req.params.sessionId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await campus.reports.forOwner({ user: req.user, workspace: req.workspace, sessionId: req.params.sessionId, requestId: req.requestId, reportVersion: readReportVersion(req.query) }))
  }))

  // P5.1: the owner's version history (no report bodies, nothing rebuilt).
  router.get('/assessment-sessions/:sessionId/report/versions', ...scoped, available, asyncHandler(async (req, res) => {
    if (!SESSION_ID.test(req.params.sessionId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await campus.reports.listVersions({ user: req.user, workspace: req.workspace, sessionId: req.params.sessionId }))
  }))

  // P5.7: the owner asks a person to review a published version.
  router.post('/assessment-sessions/:sessionId/report/review-request', ...scoped, available, asyncHandler(async (req, res) => {
    if (!SESSION_ID.test(req.params.sessionId)) throw new ApiError('NOT_FOUND', 'Not found')
    const parsed = ReviewRequest.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Describe what you would like reviewed in a few sentences.')
    const out = await campus.reports.requestReview({ user: req.user, workspace: req.workspace, sessionId: req.params.sessionId, requestId: req.requestId, ...parsed.data })
    return ok(res, out, 201)
  }))

  router.post('/me/share-grants', ...scoped, available, asyncHandler(async (req, res) => {
    const parsed = CreateShare.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', `Choose what to share, who can see it and an expiry of up to ${MAX_SHARE_DAYS} days.`)
    const out = await campus.reports.createShare({ user: req.user, workspace: req.workspace, requestId: req.requestId, ...parsed.data })
    return ok(res, out, 201)
  }))

  router.delete('/me/share-grants/:id', ...flags, requireUser, available, asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    const revoked = await campus.store.sharing.revokeShareGrant(req.params.id, req.user.id, clock().toISOString())
    if (!revoked) throw new ApiError('NOT_FOUND', 'Not found')
    campus.audit('share_grant.revoked', null, {
      shareGrantId: revoked.id, recipientType: revoked.recipientType, organizationId: revoked.recipientOrganizationId || null, requestId: req.requestId,
    })
    return ok(res, { id: revoked.id, revokedAt: revoked.revokedAt, status: 'REVOKED' })
  }))

  // Public: anyone holding the link. The token is never logged or echoed.
  router.get('/shared/:token', ...flags, sharedLimiter, available, asyncHandler(async (req, res) => {
    if (!TOKEN.test(req.params.token)) throw new ApiError('NOT_FOUND', 'This link is not valid or has expired.')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    return ok(res, await campus.reports.forShare({ req, token: req.params.token, reportVersion: readReportVersion(req.query) }))
  }))

  return router
}
