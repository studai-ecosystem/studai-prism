// /api/v1 campus analytics + reports (spec §20, §27, §28, §32.2; C10.03,
// C10.04). Dark unless PRISM_CAMPUS_ANALYTICS is on. Aggregates only; every
// group below the organization's minimum size is suppressed.
//   GET   /organizations/:orgId/analytics/capabilities   analytics.read
//   GET   /organizations/:orgId/analytics/sufficiency    analytics.read
//   GET   /organizations/:orgId/analytics/comparison     analytics.read  ?groupBy=cohort|department
//   GET   /organizations/:orgId/analytics/completion     analytics.read
//   GET   /organizations/:orgId/analytics/missions       analytics.read
//   GET   /organizations/:orgId/analytics/interventions  analytics.read
//   POST  /organizations/:orgId/analytics/exports        analytics.read + exports.cohort (audited)
//   POST  /organizations/:orgId/reports/cohort           reports.read (audited; executive/department/cohort)
//   GET   /organizations/:orgId/settings/analytics       org.settings.read
//   PATCH /organizations/:orgId/settings/analytics       org.manage (owners)
// Filters: campusId, departmentId, programId, batchId, cohortId (UUIDs), from/to (YYYY-MM-DD).
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag, isEnabled } from '../../domain/flags/index.js'

const ORG_ID = /^[0-9a-f-]{36}$/i
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
})
const Filters = z.object({
  campusId: uuid.optional(), departmentId: uuid.optional(), programId: uuid.optional(), batchId: uuid.optional(), cohortId: uuid.optional(),
  from: day.optional(), to: day.optional(),
}).strict()
const ComparisonQuery = Filters.extend({ groupBy: z.enum(['cohort', 'department']).optional() }).strict()
const ExportBody = z.object({
  view: z.enum(['capabilities', 'sufficiency', 'comparison', 'completion', 'missions']),
  filters: Filters.optional(),
  groupBy: z.enum(['cohort', 'department']).optional(),
}).strict()
const ReportBody = z.object({ cohortId: uuid.optional(), departmentId: uuid.optional() }).strict()
  .refine((v) => !(v.cohortId && v.departmentId), 'Choose a cohort or a department, not both.')
const Settings = z.object({ minAggregateGroupSize: z.number().int() }).strict()

export function createAnalyticsRouter({ requireUser, campus }) {
  const router = Router()
  const flag = requireFlag('PRISM_CAMPUS_ANALYTICS')
  const { requireCampus, requireOrgPermission } = campus
  for (const p of ['/organizations/:orgId/analytics', '/organizations/:orgId/reports', '/organizations/:orgId/settings/analytics']) {
    router.use(p, (req, _res, next) => (ORG_ID.test(req.params.orgId) ? next() : next(new ApiError('NOT_FOUND', 'Not found'))))
  }
  const gate = (perm) => [flag, requireCampus, requireUser, requireOrgPermission(perm)]
  const svc = () => campus.analytics
  const deps = () => ({
    orgAudit: campus.admin.orgAudit,
    admin: campus.admin,
    development: isEnabled('PRISM_DEVELOPMENT_V2') ? campus.development : null,
    growthEnabled: isEnabled('PRISM_GROWTH_ENABLED'),
  })
  const parse = (schema, value, message) => {
    const r = schema.safeParse(value ?? {})
    if (!r.success) throw new ApiError('VALIDATION_FAILED', message, { details: r.error.flatten() })
    return r.data
  }
  const filters = (req) => parse(Filters, req.query, 'One of the filters is not valid.')

  router.get('/organizations/:orgId/analytics/capabilities', ...gate('analytics.read'), asyncHandler(async (req, res) => ok(res, await svc().capabilities(req.actor, req.params.orgId, filters(req)))))
  router.get('/organizations/:orgId/analytics/sufficiency', ...gate('analytics.read'), asyncHandler(async (req, res) => ok(res, await svc().sufficiency(req.actor, req.params.orgId, filters(req)))))
  router.get('/organizations/:orgId/analytics/comparison', ...gate('analytics.read'), asyncHandler(async (req, res) => (
    ok(res, await svc().comparison(req.actor, req.params.orgId, parse(ComparisonQuery, req.query, 'One of the filters is not valid.')))
  )))
  router.get('/organizations/:orgId/analytics/completion', ...gate('analytics.read'), asyncHandler(async (req, res) => ok(res, await svc().completion(req.actor, req.params.orgId, filters(req)))))
  router.get('/organizations/:orgId/analytics/missions', ...gate('analytics.read'), asyncHandler(async (req, res) => ok(res, await svc().missions(req.actor, req.params.orgId, deps()))))
  router.get('/organizations/:orgId/analytics/interventions', ...gate('analytics.read'), asyncHandler(async (req, res) => (
    ok(res, await svc().interventions(req.actor, req.params.orgId, deps()))
  )))
  router.post('/organizations/:orgId/analytics/exports', ...gate('analytics.read'), asyncHandler(async (req, res) => {
    const body = parse(ExportBody, req.body, 'Choose what to export.')
    return ok(res, await svc().exportCsv(req, req.actor, req.params.orgId, body, deps()))
  }))
  router.post('/organizations/:orgId/reports/cohort', ...gate('reports.read'), asyncHandler(async (req, res) => {
    const body = parse(ReportBody, req.body, 'Choose a cohort or a department, not both.')
    return ok(res, await svc().cohortReport(req, req.actor, req.params.orgId, body, deps()))
  }))
  router.get('/organizations/:orgId/settings/analytics', ...gate('org.settings.read'), asyncHandler(async (req, res) => ok(res, await svc().settings(req.params.orgId, req.actor))))
  router.patch('/organizations/:orgId/settings/analytics', ...gate('org.manage'), asyncHandler(async (req, res) => {
    const body = parse(Settings, req.body, 'The minimum group size must be a whole number.')
    return ok(res, await svc().updateSettings(req, req.actor, req.params.orgId, body, deps()))
  }))

  return router
}
