// /api/v1 reassessment + growth, campus side (spec §17, §25, §30.10, §32.2;
// C9.03, C9.05). Dark unless PRISM_GROWTH_ENABLED is on. The student side is
// `GET /api/v1/me/growth` (student router).
//   GET  /organizations/:orgId/reassessments                  reassessments.read
//   POST /organizations/:orgId/reassessments                  reassessments.write
//   GET  /organizations/:orgId/reassessments/:cycleId         reassessments.read
//   POST /organizations/:orgId/reassessments/:cycleId/status  reassessments.write (close/cancel)
//   GET  /organizations/:orgId/analytics/growth[?cycleId=]    analytics.read (comparable only, small groups suppressed)
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag } from '../../domain/flags/index.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ORG_ID = /^[0-9a-f-]{36}$/i
const ASSIGNMENT_ID = /^[A-Za-z0-9_-]{1,80}$/

const CreateCycle = z.object({
  name: z.string().trim().min(1).max(160),
  baselineAssignmentId: z.string().regex(ASSIGNMENT_ID),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  programId: z.string().regex(UUID).nullable().optional(),
  interventionId: z.string().regex(UUID).nullable().optional(),
}).strict()

export function createGrowthRouter({ requireUser, campus }) {
  const router = Router()
  const flag = requireFlag('PRISM_GROWTH_ENABLED')
  const { requireCampus, requireOrgPermission } = campus
  for (const p of ['/organizations/:orgId/reassessments', '/organizations/:orgId/analytics/growth']) {
    router.use(p, (req, _res, next) => (ORG_ID.test(req.params.orgId) ? next() : next(new ApiError('NOT_FOUND', 'Not found'))))
  }
  const gate = (perm) => [flag, requireCampus, requireUser, requireOrgPermission(perm)]
  const svc = () => campus.growth
  const deps = () => ({ admin: campus.admin })
  const cycleId = (req) => { if (!UUID.test(req.params.cycleId)) throw new ApiError('NOT_FOUND', 'Not found'); return req.params.cycleId }

  router.get('/organizations/:orgId/reassessments', ...gate('reassessments.read'), asyncHandler(async (req, res) => (
    ok(res, { items: await svc().listCycles(req.actor, req.params.orgId, deps()) })
  )))
  router.post('/organizations/:orgId/reassessments', ...gate('reassessments.write'), asyncHandler(async (req, res) => {
    const parsed = CreateCycle.safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Check the reassessment details.', { details: parsed.error.flatten() })
    return ok(res, await svc().createCycle(req, req.actor, req.params.orgId, parsed.data, deps()), 201)
  }))
  router.get('/organizations/:orgId/reassessments/:cycleId', ...gate('reassessments.read'), asyncHandler(async (req, res) => (
    ok(res, (await svc().getCycle(req.actor, req.params.orgId, cycleId(req), deps())).summary)
  )))
  router.post('/organizations/:orgId/reassessments/:cycleId/status', ...gate('reassessments.write'), asyncHandler(async (req, res) => {
    const id = cycleId(req)
    const parsed = z.object({ status: z.enum(['CLOSED', 'CANCELLED']) }).strict().safeParse(req.body || {})
    if (!parsed.success) throw new ApiError('VALIDATION_FAILED', 'Choose close or cancel.')
    return ok(res, await svc().setCycleStatus(req, req.actor, req.params.orgId, id, parsed.data.status, deps()))
  }))
  router.get('/organizations/:orgId/analytics/growth', ...gate('analytics.read'), asyncHandler(async (req, res) => {
    const q = z.object({ cycleId: z.string().regex(UUID).optional() }).strict().safeParse(req.query || {})
    if (!q.success) throw new ApiError('VALIDATION_FAILED', 'One of the filters is not valid.')
    return ok(res, await svc().outcomes(req.actor, req.params.orgId, { ...deps(), cycleId: q.data.cycleId || null }))
  }))

  return router
}
