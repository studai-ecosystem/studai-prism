// /api/v1/employer/* — employer development-use (L&D) workspace (PROD-READY
// Phase 9). Dark behind PRISM_EMPLOYER_LND: off → every route here is 404.
//
// Employer routes: flag → campus (404 off / 503 no store) → signed-in user →
// refuse selection parameters (422 PROHIBITED_USE) → EMPLOYER organization
// (404 otherwise) → permission via can() (404) → staff role (404).
//   GET   /employer/organizations/:orgId                               org.overview.read
//   GET   /employer/organizations/:orgId/overview                      org.overview.read
//   GET   /employer/organizations/:orgId/cohorts                       cohorts.read
//   POST  /employer/organizations/:orgId/cohorts                       students.manage
//   POST  /employer/organizations/:orgId/invites                       org.overview.read (role checks in the invite service)
//   GET   /employer/organizations/:orgId/people                        students.read   ?page&pageSize&q&cohortId (fixed name order)
//   GET   /employer/organizations/:orgId/people/:userId                students.read
//   GET   /employer/organizations/:orgId/shared-reports                students.read
//   GET   /employer/organizations/:orgId/shared-reports/:sessionId     students.read   (+ PRISM_STUDENT_REPORT_V3; share grant only)
//   GET   /employer/organizations/:orgId/assessment-catalog            assignments.write (JOB_FAMILY_SCOPE_v1 only)
//   GET   /employer/organizations/:orgId/disclosure                    assignments.write
//   GET   /employer/organizations/:orgId/assignments                   assignments.read
//   POST  /employer/organizations/:orgId/assignments                   assignments.write
//   GET   /employer/organizations/:orgId/insights                      analytics.read  (+ PRISM_CAMPUS_ANALYTICS; suppressed)
//   POST  /employer/organizations/:orgId/insights/exports              analytics.read + exports.cohort (aggregate views only)
//   GET   /employer/organizations/:orgId/development-missions          interventions.write (+ PRISM_DEVELOPMENT_V2)
//   GET   /employer/organizations/:orgId/interventions                 interventions.read  (+ PRISM_DEVELOPMENT_V2)
//   POST  /employer/organizations/:orgId/interventions                 interventions.write (+ PRISM_DEVELOPMENT_V2)
// There is deliberately no route that exports, ranks, sorts or filters
// people by result, and no route that reads a report without a share grant.
// The candidate-side evidence hand-off interface is in ./evidenceHandoff.js.
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { requireFlag, isEnabled } from '../../domain/flags/index.js'
import { readReportVersion } from '../../domain/http/reportVersion.js'
import { createEmployerService, isEmployerStaff, EMPLOYER_INVITABLE_ROLES } from '../../domain/employer/service.js'
import { refuseSelectionParams, EMPLOYER_EXPORT_VIEWS, SCOPED_FAMILY_IDS } from '../../domain/employer/prohibitedUse.js'
import { LAYER_1_TRANSFERABLE_CAPABILITIES } from '../../lib/competencyModelV2.js'
import { capabilityInfo } from '../../domain/assessments/catalog.js'

const ORG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID = ORG_ID
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,127}$/
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/
const MISSION_ID = /^[A-Z0-9][A-Z0-9-]{2,63}$/
const name = z.string().trim().min(1).max(160)
const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}, 'Not a real date')

const People = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().max(120).optional(),
  cohortId: z.string().regex(UUID).optional(),
}).strict()
const CreateCohort = z.object({ name, jobFamily: z.enum(SCOPED_FAMILY_IDS).nullable().optional() }).strict()
const Invite = z.object({
  role: z.enum(EMPLOYER_INVITABLE_ROLES),
  emails: z.array(z.string().trim().toLowerCase().email().max(254)).min(1).max(200),
  cohortId: z.string().regex(UUID).nullable().optional(),
}).strict()
const CreateAssignment = z.object({
  definitionId: z.string().min(1).max(120),
  cohortIds: z.array(z.string().regex(UUID)).min(1).max(200),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  reminders: z.boolean().optional(),
  participation: z.enum(['COMPULSORY', 'VOLUNTARY', 'UNKNOWN']).optional(),
}).strict()
const ExportBody = z.object({ view: z.enum(EMPLOYER_EXPORT_VIEWS) }).strict()
const CreateIntervention = z.object({
  name,
  targetCapabilityId: z.string().regex(/^CAP-[A-Z0-9-]+$/),
  cohortId: z.string().regex(UUID),
  startsOn: calendarDay,
  endsOn: calendarDay,
  missionIds: z.array(z.string().regex(MISSION_ID)).min(1).max(10),
}).strict()
const EMPTY = z.object({}).strict()

export function createEmployerRouter({ requireUser, campus }) {
  const router = Router()
  const { requireCampus, requireOrgPermission } = campus
  const employer = createEmployerService({ campus })
  const flag = requireFlag('PRISM_EMPLOYER_LND')
  const parse = (schema, value, message) => {
    const r = schema.safeParse(value ?? {})
    if (!r.success) throw new ApiError('VALIDATION_FAILED', message, { details: r.error.flatten() })
    return r.data
  }

  // ── Employer organization routes ──────────────────────────────────────
  router.use('/employer', flag, requireCampus, requireUser, refuseSelectionParams)
  router.param('orgId', (_req, _res, next, orgId) => (ORG_ID.test(orgId) ? next() : next(new ApiError('NOT_FOUND', 'Not found'))))
  const employerOrg = asyncHandler(async (req, _res, next) => {
    const org = await employer.employerOrganization(req.params.orgId)
    if (!org) throw new ApiError('NOT_FOUND', 'Not found')
    req.organization = org
    next()
  })
  const staff = (req, _res, next) => (isEmployerStaff(req.actor, req.params.orgId) ? next() : next(new ApiError('NOT_FOUND', 'Not found')))
  const gate = (permission, ...extra) => [...extra, employerOrg, requireOrgPermission(permission), staff]
  const P = '/employer/organizations/:orgId'
  const reportFlag = requireFlag('PRISM_STUDENT_REPORT_V3')
  const analyticsFlag = requireFlag('PRISM_CAMPUS_ANALYTICS')
  const developmentFlag = requireFlag('PRISM_DEVELOPMENT_V2')
  const development = () => (isEnabled('PRISM_DEVELOPMENT_V2') ? campus.development : null)

  router.get(P, ...gate('org.overview.read'), asyncHandler(async (req, res) => ok(res, await employer.summary(req.actor, req.organization))))
  router.get(`${P}/overview`, ...gate('org.overview.read'), asyncHandler(async (req, res) => ok(res, await employer.overview(req.actor, req.organization))))

  router.get(`${P}/cohorts`, ...gate('cohorts.read'), asyncHandler(async (req, res) => ok(res, await employer.listCohorts(req.actor, req.organization, req.permissionScope))))
  router.post(`${P}/cohorts`, ...gate('students.manage'), asyncHandler(async (req, res) => (
    ok(res, await employer.createCohort(req, req.actor, req.organization, parse(CreateCohort, req.body, 'Give the group a name.')), 201)
  )))
  router.post(`${P}/invites`, ...gate('org.overview.read'), asyncHandler(async (req, res) => (
    ok(res, await employer.invite(req.actor, req.organization, parse(Invite, req.body, 'Check the invitation details.')), 201)
  )))

  router.get(`${P}/people`, ...gate('students.read'), asyncHandler(async (req, res) => (
    ok(res, await employer.listPeople(req.actor, req.organization, req.permissionScope, parse(People, req.query, 'One of the filters is not valid.')))
  )))
  router.get(`${P}/people/:userId`, ...gate('students.read'), asyncHandler(async (req, res) => {
    if (!USER_ID.test(req.params.userId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await employer.getPerson(req, req.actor, req.organization, req.permissionScope, req.params.userId))
  }))
  router.get(`${P}/shared-reports`, ...gate('students.read'), asyncHandler(async (req, res) => ok(res, await employer.listSharedReports(req.actor, req.organization, req.permissionScope))))
  router.get(`${P}/shared-reports/:sessionId`, ...gate('students.read', reportFlag), asyncHandler(async (req, res) => {
    if (!SESSION_ID.test(req.params.sessionId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await employer.sharedReport(req, req.actor, req.organization, req.params.sessionId, readReportVersion(req.query)))
  }))

  router.get(`${P}/assessment-catalog`, ...gate('assignments.write'), asyncHandler(async (_req, res) => ok(res, await employer.catalog())))
  router.get(`${P}/disclosure`, ...gate('assignments.write'), asyncHandler(async (req, res) => ok(res, employer.disclosure(req.organization))))
  router.get(`${P}/assignments`, ...gate('assignments.read'), asyncHandler(async (req, res) => ok(res, await employer.listAssignments(req.actor, req.organization, req.permissionScope))))
  router.post(`${P}/assignments`, ...gate('assignments.write'), asyncHandler(async (req, res) => (
    ok(res, await employer.createAssignment(req, req.actor, req.organization, parse(CreateAssignment, req.body, 'Choose an assessment, groups and a window.')), 201)
  )))

  router.get(`${P}/insights`, ...gate('analytics.read', analyticsFlag), asyncHandler(async (req, res) => {
    parse(EMPTY, req.query, 'Group summaries take no filters here.')
    return ok(res, await employer.insights(req.actor, req.organization, { development: development() }))
  }))
  router.post(`${P}/insights/exports`, ...gate('analytics.read', analyticsFlag), asyncHandler(async (req, res) => {
    const body = parse(ExportBody, req.body, 'Only group summaries can be exported.')
    return ok(res, await employer.exportInsights(req, req.actor, req.organization, body, { development: development() }))
  }))

  router.get(`${P}/development-missions`, ...gate('interventions.write', developmentFlag), asyncHandler(async (_req, res) => {
    const items = await campus.development.catalogue()
    const ids = new Set([...Object.keys(LAYER_1_TRANSFERABLE_CAPABILITIES), ...items.map((m) => m.targetCapabilityId)])
    return ok(res, {
      missions: items.map((m) => ({ id: m.id, title: m.title, targetCapabilityId: m.targetCapabilityId, targetCapabilityName: m.targetCapabilityName, estimatedMinutes: m.estimatedMinutes })),
      capabilities: [...ids].map((id) => ({ id, name: capabilityInfo(id)?.name || id })),
    })
  }))
  router.get(`${P}/interventions`, ...gate('interventions.read', developmentFlag), asyncHandler(async (req, res) => {
    const cohorts = await campus.store.campusAdmin.listCohorts(req.params.orgId)
    return ok(res, { items: await campus.development.listInterventions(req.actor, req.params.orgId, req.permissionScope, { cohortsById: new Map(cohorts.map((c) => [c.id, c])) }) })
  }))
  router.post(`${P}/interventions`, ...gate('interventions.write', developmentFlag), asyncHandler(async (req, res) => {
    const body = parse(CreateIntervention, req.body, 'Check the development plan details.')
    return ok(res, await campus.development.createIntervention(req, req.actor, req.params.orgId, { ...body, reassessmentPlanned: false }, { cohortOf: campus.admin.cohortOf, orgAudit: campus.admin.orgAudit }), 201)
  }))

  return router
}
