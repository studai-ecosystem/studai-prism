// /api/v1 assessment sessions (spec §12, §32; C5.02–C5.06). Dark unless both
// PRISM_APP_SHELL_V3 and PRISM_ASSESSMENT_WORKSPACE_V3 are on.
//   POST  /assessment-assignments/:id/start          Idempotency-Key + consent
//   GET   /assessment-sessions/:sessionId            metadata contract (resume)
//   POST  /assessment-sessions/:sessionId/messages   idempotent by clientEventId
//   PATCH /assessment-sessions/:sessionId/artifacts/:artifactId   If-Match version
//   POST  /assessment-sessions/:sessionId/finish     required-opportunity check
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag } from '../../domain/flags/index.js'
import { studentScoped } from './studentScope.js'
import { playerPath } from '../../domain/assessments/assignmentService.js'

const ASSIGNMENT_ID = /^(pa_[0-9a-f]{32}|[0-9a-f-]{36})$/i
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/
const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{7,79}$/
const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

const Start = z.object({
  consent: z.object({ scopes: z.array(z.string().max(40)).min(1).max(20), consentVersion: z.string().min(1).max(64) }).strict(),
}).strict()
const Message = z.object({ clientEventId: z.string().regex(EVENT_ID), text: z.string().trim().min(1).max(4000) }).strict()
const Artifact = z.object({
  updates: z.record(z.unknown()),
  notes: z.string().max(4000).optional(),
  clientEventId: z.string().regex(EVENT_ID).optional(),
}).strict()
const Finish = z.object({ early: z.boolean().optional() }).strict()

export function createAssessmentSessionsRouter({ requireUser, campus }) {
  const router = Router()
  const gates = [requireFlag('PRISM_APP_SHELL_V3'), requireFlag('PRISM_ASSESSMENT_WORKSPACE_V3'), ...studentScoped({ requireUser, campus })]
  const available = (_req, _res, next) => (campus.sessions
    ? next()
    : next(new ApiError('CAMPUS_STORE_UNAVAILABLE', 'The assessment workspace is temporarily unavailable.')))
  const sessionParam = (req, _res, next) => (SESSION_ID.test(req.params.sessionId) ? next() : next(new ApiError('NOT_FOUND', 'Not found')))
  const ctx = (req) => ({
    user: req.user, workspace: req.workspace, authorization: req.get('authorization'), requestId: req.requestId,
    client: { ip: req.ip || null, userAgent: req.get('user-agent') || null },
  })

  router.post('/assessment-assignments/:id/start', ...gates, available, asyncHandler(async (req, res) => {
    if (!ASSIGNMENT_ID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    const key = req.get('idempotency-key')
    if (!key || key.length > 128) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
    const parsed = Start.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('CONSENT_REQUIRED', 'Please accept every consent item to continue.')
    const out = await campus.sessions.start({ ...ctx(req), assignmentId: req.params.id, idempotencyKey: key, consent: parsed.data.consent })
    return ok(res, { ...out, to: playerPath(out.sessionId, req.workspace.type === 'CAMPUS_STUDENT' ? req.workspace.id : null) }, out.resumed ? 200 : 201)
  }))

  router.get('/assessment-sessions/:sessionId', ...gates, available, sessionParam, asyncHandler(async (req, res) => {
    return ok(res, await campus.sessions.get({ ...ctx(req), sessionId: req.params.sessionId }))
  }))

  router.post('/assessment-sessions/:sessionId/messages', ...gates, available, sessionParam, asyncHandler(async (req, res) => {
    const parsed = Message.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Your answer could not be read. Please try again.')
    const out = await campus.sessions.sendMessage({ ...ctx(req), sessionId: req.params.sessionId, ...parsed.data })
    return ok(res, out, out.replayed ? 200 : 201)
  }))

  router.patch('/assessment-sessions/:sessionId/artifacts/:artifactId', ...gates, available, sessionParam, asyncHandler(async (req, res) => {
    if (!ARTIFACT_ID.test(req.params.artifactId)) throw new ApiError('NOT_FOUND', 'Not found')
    const raw = req.get('if-match')
    const ifMatch = raw != null && /^\d{1,9}$/.test(String(raw).replace(/"/g, '')) ? Number(String(raw).replace(/"/g, '')) : null
    if (ifMatch === null) throw new ApiError('IF_MATCH_REQUIRED', 'Send the version you are changing (If-Match).')
    const parsed = Artifact.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Your changes could not be read.')
    const out = await campus.sessions.saveArtifact({ ...ctx(req), sessionId: req.params.sessionId, artifactId: req.params.artifactId, ifMatch, ...parsed.data })
    res.setHeader('ETag', `"${out.version}"`)
    return ok(res, out)
  }))

  router.post('/assessment-sessions/:sessionId/finish', ...gates, available, sessionParam, asyncHandler(async (req, res) => {
    const parsed = Finish.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Invalid request.')
    const out = await campus.sessions.finish({ ...ctx(req), sessionId: req.params.sessionId, early: Boolean(parsed.data.early) })
    return ok(res, out, out.state === 'SCORING' ? 202 : 200)
  }))

  return router
}
