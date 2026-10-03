// /api/v1/organizations/:orgId/* — campus administration (spec §19–§25, §29,
// §37.1, §43; C7.02–C7.08). Every route: campus flag (404 when off) →
// campus store (503) → signed-in user → organization permission via can()
// (404 when denied). The service re-checks each target against the caller's
// role scope. There are deliberately no routes to edit assessment
// definitions, rubrics or prompts (§25).
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../domain/http/asyncHandler.js'
import { ApiError, ok } from '../../domain/http/errors.js'
import { STAFF_ROLES } from '../../domain/campusAdmin/service.js'

const ORG_ID = /^[0-9a-f-]{36}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9:._@-]{0,127}$/
const name = z.string().trim().min(1).max(160)
const uuidOrNull = z.string().regex(UUID).nullable().optional()
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const ListStudents = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().max(120).optional(),
  cohortId: z.string().regex(UUID).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INVITED']).optional(),
  assessment: z.enum(['NONE', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'WITHDRAWN']).optional(),
}).strict()
const Structure = {
  campus: z.object({ name }).strict(),
  department: z.object({ name, code: z.string().trim().max(40).optional(), campusId: uuidOrNull }).strict(),
  academicProgram: z.object({ name, departmentId: uuidOrNull, degreeLevel: z.string().trim().max(60).optional(), durationYears: z.number().int().min(1).max(10).optional() }).strict(),
  batch: z.object({ name, programId: uuidOrNull, startYear: z.number().int().min(1990).max(2100).optional(), endYear: z.number().int().min(1990).max(2100).optional() }).strict(),
}
const CreateCohort = z.object({
  name, semester: z.string().trim().max(40).nullable().optional(), tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  campusId: uuidOrNull, departmentId: uuidOrNull, academicProgramId: uuidOrNull, batchId: uuidOrNull, ownerUserId: z.string().regex(USER_ID).nullable().optional(),
}).strict()
const UpdateCohort = CreateCohort.partial().extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() }).strict()
const MoveStudents = z.object({ userIds: z.array(z.string().regex(USER_ID)).min(1).max(500), fromCohortId: uuidOrNull, toCohortId: z.string().regex(UUID) }).strict()
const ImportPreview = z.object({ fileName: z.string().max(200).optional(), csv: z.string().min(1).max(1_200_000), defaultCohortId: uuidOrNull }).strict()
const ProgramInput = z.object({
  name, description: z.string().trim().max(2000).nullable().optional(), status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
  startsOn: dateOnly.nullable().optional(), endsOn: dateOnly.nullable().optional(), cohortIds: z.array(z.string().regex(UUID)).max(200).optional(),
  reportingPolicy: z.object({ shareSponsoredReports: z.boolean(), aggregateOnly: z.boolean() }).strict().optional(),
  sponsorshipScope: z.object({ assessments: z.boolean(), development: z.boolean(), reassessment: z.boolean() }).strict().optional(),
}).strict()
const CreateAssignment = z.object({
  definitionId: z.string().min(1).max(120),
  cohortIds: z.array(z.string().regex(UUID)).min(1).max(200),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  integrityPolicy: z.enum(['STANDARD', 'PROCTORED']).optional(),
  accommodationsRequestable: z.boolean().optional(),
  extraTimeAllowed: z.boolean().optional(),
  reminders: z.boolean().optional(),
  // P8.7: how participation was shaped, recorded on the assignment so
  // engagement is never read as voluntary demand. Defaults: participation
  // UNKNOWN (not asked), no incentive.
  participation: z.enum(['COMPULSORY', 'VOLUNTARY', 'UNKNOWN']).optional(),
  incentive: z.string().trim().min(1).max(200).nullable().optional(),
  programId: uuidOrNull,
}).strict()
const Onboarding = z.object({
  completedSteps: z.array(z.string().max(40)).max(20),
  data: z.record(z.string().max(60), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).refine((d) => Object.keys(d).length <= 20, 'Too many fields').optional(),
}).strict()

export function createCampusAdminRouter({ requireUser, campus }) {
  const router = Router()
  const { requireCampus, requireOrgPermission } = campus
  const svc = () => campus.admin
  const org = (req) => req.params.orgId
  const parse = (schema, value, message) => {
    const r = schema.safeParse(value ?? {})
    if (!r.success) throw new ApiError('VALIDATION_FAILED', message, { details: r.error.flatten() })
    return r.data
  }

  router.use('/organizations/:orgId', (req, _res, next) => (ORG_ID.test(req.params.orgId) ? next() : next(new ApiError('NOT_FOUND', 'Not found'))))
  const base = [requireCampus, requireUser]
  const perm = (p) => [...base, requireOrgPermission(p)]

  router.get('/organizations/:orgId/overview', ...perm('org.overview.read'), asyncHandler(async (req, res) => {
    const base = await svc().overview(req.actor, org(req))
    const extras = campus.overviewExtras ? await campus.overviewExtras(org(req)) : {}
    return ok(res, { ...base, ...extras })
  }))

  router.get('/organizations/:orgId/students', ...perm('students.read'), asyncHandler(async (req, res) => {
    const q = parse(ListStudents, req.query, 'One of the filters is not valid.')
    return ok(res, await svc().listStudents(req.actor, org(req), req.permissionScope, { ...q, assignmentStatus: q.assessment }))
  }))
  router.get('/organizations/:orgId/students/export', ...perm('exports.cohort'), asyncHandler(async (req, res) => {
    const q = parse(ListStudents.omit({ page: true, pageSize: true }), req.query, 'One of the filters is not valid.')
    const scope = campus.scopeFor(req.actor, org(req), 'students.read')
    if (!scope.allowed) throw new ApiError('NOT_FOUND', 'Not found')
    const csv = await svc().exportStudents(req, req.actor, org(req), scope, { ...q, assignmentStatus: q.assessment })
    // JSON envelope (the API client only speaks /api/v1 envelopes); the
    // browser turns `csv` into a download.
    return ok(res, { fileName: 'students.csv', contentType: 'text/csv', csv })
  }))
  router.post('/organizations/:orgId/students/move', ...perm('students.manage'), asyncHandler(async (req, res) => (
    ok(res, await svc().moveStudents(req, req.actor, org(req), parse(MoveStudents, req.body, 'Choose students and a cohort.')))
  )))
  router.get('/organizations/:orgId/students/:studentId', ...perm('students.read'), asyncHandler(async (req, res) => {
    if (!USER_ID.test(req.params.studentId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().getStudent(req, req.actor, org(req), req.permissionScope, req.params.studentId))
  }))

  router.get('/organizations/:orgId/structure', ...perm('cohorts.read'), asyncHandler(async (req, res) => ok(res, await svc().structure(org(req)))))
  router.post('/organizations/:orgId/structure/:kind', ...perm('org.manage'), asyncHandler(async (req, res) => {
    const schema = Object.hasOwn(Structure, req.params.kind) ? Structure[req.params.kind] : null
    if (!schema) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().createStructure(req, req.actor, org(req), req.params.kind, parse(schema, req.body, 'Check the details.')), 201)
  }))

  router.get('/organizations/:orgId/cohorts', ...perm('cohorts.read'), asyncHandler(async (req, res) => ok(res, { items: await svc().listCohorts(req.actor, org(req), req.permissionScope) })))
  router.post('/organizations/:orgId/cohorts', ...perm('students.manage'), asyncHandler(async (req, res) => (
    ok(res, await svc().createCohort(req, req.actor, org(req), parse(CreateCohort, req.body, 'Give the cohort a name.')), 201)
  )))
  router.get('/organizations/:orgId/cohorts/:cohortId', ...perm('cohorts.read'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.cohortId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().getCohort(req.actor, org(req), req.permissionScope, req.params.cohortId))
  }))
  router.patch('/organizations/:orgId/cohorts/:cohortId', ...perm('students.manage'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.cohortId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().updateCohort(req, req.actor, org(req), req.params.cohortId, parse(UpdateCohort, req.body, 'Check the cohort details.')))
  }))
  router.delete('/organizations/:orgId/cohorts/:cohortId/members/:userId', ...perm('students.manage'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.cohortId) || !USER_ID.test(req.params.userId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().removeFromCohort(req, req.actor, org(req), req.params.cohortId, req.params.userId))
  }))

  router.post('/organizations/:orgId/imports/students', ...perm('students.manage'), asyncHandler(async (req, res) => (
    ok(res, await svc().previewImport(req, req.actor, org(req), req.permissionScope, parse(ImportPreview, req.body, 'Choose a CSV file.')), 201)
  )))
  router.get('/organizations/:orgId/imports/:jobId', ...perm('students.manage'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.jobId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().getImport(req.actor, org(req), req.permissionScope, req.params.jobId))
  }))
  router.post('/organizations/:orgId/imports/:jobId/commit', ...perm('students.manage'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.jobId)) throw new ApiError('NOT_FOUND', 'Not found')
    const key = req.get('idempotency-key')
    if (!key || key.length > 128) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key is required.')
    const out = await svc().commitImport(req, req.actor, org(req), req.permissionScope, req.params.jobId, key)
    return ok(res, out, out.replayed ? 200 : 201)
  }))

  router.get('/organizations/:orgId/programs', ...perm('programs.read'), asyncHandler(async (req, res) => ok(res, { items: await svc().listPrograms(req.actor, org(req), req.permissionScope) })))
  router.post('/organizations/:orgId/programs', ...perm('programs.write'), asyncHandler(async (req, res) => (
    ok(res, await svc().createProgram(req, req.actor, org(req), parse(ProgramInput, req.body, 'Give the program a name.')), 201)
  )))
  router.get('/organizations/:orgId/programs/:programId', ...perm('programs.read'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.programId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().getProgram(req.actor, org(req), req.permissionScope, req.params.programId))
  }))
  router.patch('/organizations/:orgId/programs/:programId', ...perm('programs.write'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.programId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().updateProgram(req, req.actor, org(req), req.params.programId, parse(ProgramInput.partial(), req.body, 'Check the program details.')))
  }))

  router.get('/organizations/:orgId/assessment-catalog', ...perm('assignments.write'), asyncHandler(async (req, res) => ok(res, { items: await svc().catalogForAssignment() })))
  router.get('/organizations/:orgId/consent-preview', ...perm('assignments.write'), asyncHandler(async (req, res) => {
    const o = await campus.repos.organizations.getOrganization(org(req))
    return ok(res, svc().consentPreview(o?.name))
  }))
  router.get('/organizations/:orgId/assignments', ...perm('assignments.read'), asyncHandler(async (req, res) => ok(res, { items: await svc().listAssignments(req.actor, org(req), req.permissionScope) })))
  router.post('/organizations/:orgId/assignments', ...perm('assignments.write'), asyncHandler(async (req, res) => (
    ok(res, await svc().createAssignment(req, req.actor, org(req), parse(CreateAssignment, req.body, 'Choose an assessment, cohorts and a window.')), 201)
  )))
  router.get('/organizations/:orgId/assignments/:assignmentId', ...perm('assignments.read'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.assignmentId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().assignmentCompletion(req.actor, org(req), req.permissionScope, req.params.assignmentId))
  }))
  router.post('/organizations/:orgId/assignments/:assignmentId/status', ...perm('assignments.write'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.assignmentId)) throw new ApiError('NOT_FOUND', 'Not found')
    const { status } = parse(z.object({ status: z.enum(['CLOSED', 'CANCELLED']) }).strict(), req.body, 'Choose close or cancel.')
    return ok(res, await svc().closeAssignment(req, req.actor, org(req), req.params.assignmentId, status))
  }))

  router.get('/organizations/:orgId/members', ...perm('team.read'), asyncHandler(async (req, res) => ok(res, await svc().listMembers(req.actor, org(req)))))
  router.patch('/organizations/:orgId/members/:membershipId', ...perm('team.manage'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.membershipId)) throw new ApiError('NOT_FOUND', 'Not found')
    const { role } = parse(z.object({ role: z.enum(STAFF_ROLES) }).strict(), req.body, 'Choose a role.')
    return ok(res, await svc().changeRole(req, req.actor, org(req), req.params.membershipId, role))
  }))
  router.delete('/organizations/:orgId/members/:membershipId', ...perm('team.manage'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.membershipId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().removeMember(req, req.actor, org(req), req.params.membershipId))
  }))
  router.post('/organizations/:orgId/invites/:inviteId/resend', ...perm('org.overview.read'), asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.inviteId)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().resendInvite(req, req.actor, org(req), req.params.inviteId))
  }))

  router.get('/organizations/:orgId/audit', ...perm('org.settings.read'), asyncHandler(async (req, res) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), before: z.string().datetime().optional() }).strict(), req.query, 'Invalid page.')
    return ok(res, await svc().auditLog(org(req), q))
  }))
  router.get('/organizations/:orgId/onboarding', ...perm('org.manage'), asyncHandler(async (req, res) => ok(res, await svc().getOnboarding(org(req)))))
  router.put('/organizations/:orgId/onboarding', ...perm('org.manage'), asyncHandler(async (req, res) => (
    ok(res, await svc().saveOnboarding(req, req.actor, org(req), parse(Onboarding, req.body, 'Check the onboarding progress.')))
  )))

  // Notifications for the signed-in user (in-app; spec §43).
  router.get('/me/notifications', requireCampus, requireUser, asyncHandler(async (req, res) => ok(res, await svc().listNotifications(req.user))))
  router.post('/me/notifications/:id/read', requireCampus, requireUser, asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.id)) throw new ApiError('NOT_FOUND', 'Not found')
    return ok(res, await svc().markNotificationRead(req.user, req.params.id))
  }))

  return router
}
