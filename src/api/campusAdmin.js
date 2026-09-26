// Campus administration API (spec §19–§25, §29, §37.1, §43). Every call is
// organization-scoped; the server decides what the caller may see and do.
import { z } from 'zod'
import { request, newIdempotencyKey } from './client.js'

const base = (orgId) => `/api/v1/organizations/${encodeURIComponent(orgId)}`
const nullableStr = z.string().nullable()
const CohortRef = z.object({ id: z.string(), name: z.string() })

const Overview = z.object({
  enrolled: z.number(),
  invited: z.number(),
  cohorts: z.number(),
  activePrograms: z.number(),
  activeAssignments: z.number(),
  completion: z.object({ assigned: z.number(), completed: z.number() }),
  missionsActive: z.number().nullable(),
  reassessmentsDue: z.number().nullable(),
  scope: z.string(),
})

const StudentRow = z.object({
  kind: z.enum(['MEMBER', 'INVITE']),
  userId: nullableStr,
  inviteId: z.string().optional(),
  name: nullableStr,
  email: nullableStr,
  status: z.string(),
  cohorts: z.array(CohortRef),
  assessment: z.object({ status: z.string(), assignmentId: nullableStr }),
})
const StudentPage = z.object({ items: z.array(StudentRow), total: z.number(), page: z.number(), pageSize: z.number() })

const StudentDetail = z.object({
  student: z.object({ userId: z.string(), name: nullableStr, email: nullableStr, status: z.string(), joinedAt: nullableStr.optional() }),
  cohorts: z.array(CohortRef),
  assignments: z.array(z.object({ assignmentId: z.string(), definitionId: z.string(), title: nullableStr, status: z.string(), completedAt: nullableStr })),
  completedSponsoredSessions: z.array(z.object({ assignmentId: z.string(), sessionId: z.string() })),
  sharedWithOrganization: z.array(z.object({ id: z.string(), expiresAt: z.string(), resources: z.array(z.object({ resourceType: z.string(), disclosureLevel: z.string() })) })),
  privacyNote: z.string(),
})

const Cohort = z.object({
  id: z.string(), name: z.string(), status: z.string(), semester: nullableStr.optional(), departmentId: nullableStr.optional(),
  campusId: nullableStr.optional(), academicProgramId: nullableStr.optional(), batchId: nullableStr.optional(), tags: z.array(z.string()).optional(), memberCount: z.number().optional(),
})
const CohortDetail = z.object({
  cohort: Cohort,
  members: z.array(z.object({ id: z.string(), name: nullableStr, email: nullableStr, addedAt: nullableStr.optional() })),
  pendingInvites: z.array(z.object({ id: z.string(), email: z.string(), expiresAt: z.string() })),
})
const Named = z.object({ id: z.string(), name: z.string() })
const Structure = z.object({
  campuses: z.array(Named),
  departments: z.array(Named.extend({ campusId: nullableStr.optional(), code: nullableStr.optional() })),
  academicPrograms: z.array(Named.extend({ departmentId: nullableStr.optional() })),
  batches: z.array(Named.extend({ programId: nullableStr.optional() })),
})

const ImportRow = z.object({
  rowNumber: z.number(),
  raw: z.record(z.string()),
  normalized: z.object({ email: z.string(), name: nullableStr, cohortName: z.string().optional() }).passthrough().nullable(),
  errors: z.array(z.string()),
  action: z.enum(['INVITE', 'ALREADY_MEMBER', 'ERROR']),
  outcome: z.enum(['INVITED', 'SKIPPED', 'FAILED']).nullable().optional(),
})
const ImportJob = z.object({
  id: z.string(), status: z.enum(['PREVIEW', 'COMMITTED', 'CANCELLED']), fileName: nullableStr,
  totals: z.object({ rows: z.number(), invite: z.number(), alreadyMember: z.number(), errors: z.number(), invited: z.number().optional(), skipped: z.number().optional(), failed: z.number().optional() }),
})

const Program = z.object({
  id: z.string(), name: z.string(), description: nullableStr, status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']),
  startsOn: nullableStr, endsOn: nullableStr,
  reportingPolicy: z.object({ shareSponsoredReports: z.boolean(), aggregateOnly: z.boolean() }),
  sponsorshipScope: z.object({ assessments: z.boolean(), development: z.boolean(), reassessment: z.boolean() }),
})
const AssignmentSummary = z.object({
  id: z.string(), definitionId: z.string(), title: nullableStr, status: z.string(), windowStart: nullableStr, windowEnd: nullableStr,
  integrityPolicy: z.string(), programId: nullableStr, cohortIds: z.array(z.string()), counts: z.record(z.number()),
})
const ProgramDetail = z.object({ program: Program, cohorts: z.array(Named.extend({ memberCount: z.number().optional() })), assignments: z.array(AssignmentSummary) })
const CatalogItem = z.object({
  id: z.string(), title: z.string(), description: nullableStr, durationMinutes: z.number(), measures: z.array(z.string()),
  notMeasured: z.array(z.string()), integrityModes: z.array(z.string()), formPolicy: z.string(),
})
const ConsentPreview = z.object({ copyVersion: z.string(), heading: z.string(), canSee: z.array(z.string()), cannotSee: z.array(z.string()) })
const Completion = z.object({
  assignment: AssignmentSummary,
  students: z.array(z.object({ userId: z.string(), name: nullableStr, email: nullableStr, status: z.string(), startedAt: nullableStr, completedAt: nullableStr, reportAvailable: z.boolean(), sessionId: nullableStr })),
})
const Members = z.object({
  members: z.array(z.object({ membershipId: z.string(), id: z.string(), name: nullableStr, email: nullableStr, role: z.string(), status: z.string(), departmentId: nullableStr, cohortIds: z.array(z.string()), joinedAt: nullableStr, isSelf: z.boolean() })),
  pendingInvites: z.array(z.object({ id: z.string(), email: z.string(), role: z.string(), expiresAt: z.string() })),
  viewer: z.object({ canInvite: z.boolean(), canManageRoles: z.boolean() }),
})
const AuditPage = z.object({
  items: z.array(z.object({ id: z.string(), at: z.string(), actor: z.object({ name: nullableStr, email: nullableStr }), action: z.string(), targetType: z.string(), targetId: nullableStr, details: z.record(z.unknown()) })),
  nextBefore: nullableStr,
})
const Onboarding = z.object({ steps: z.array(z.string()), completedSteps: z.array(z.string()), data: z.record(z.unknown()), updatedAt: nullableStr })
const Notification = z.object({ id: z.string(), kind: z.string(), organizationId: nullableStr, payload: z.record(z.unknown()), readAt: nullableStr, createdAt: z.string() })

const get = (path, schema, opts = {}) => request(path, { schema, defaultErrorMessage: 'This could not be loaded.', ...opts }).then((r) => r.data)
const send = (method, path, body, schema, opts = {}) => request(path, { method, body, schema, defaultErrorMessage: 'This could not be saved.', ...opts }).then((r) => r.data)
const items = (schema) => z.object({ items: z.array(schema) })

export const campusAdminApi = {
  overview: (orgId) => get(`${base(orgId)}/overview`, Overview),
  students: (orgId, query) => get(`${base(orgId)}/students`, StudentPage, { query }),
  exportStudents: (orgId, query) => get(`${base(orgId)}/students/export`, z.object({ fileName: z.string(), contentType: z.string(), csv: z.string() }), { query }),
  student: (orgId, userId) => get(`${base(orgId)}/students/${encodeURIComponent(userId)}`, StudentDetail),
  moveStudents: (orgId, body) => send('POST', `${base(orgId)}/students/move`, body, z.object({ moved: z.number() })),
  structure: (orgId) => get(`${base(orgId)}/structure`, Structure),
  createStructure: (orgId, kind, body) => send('POST', `${base(orgId)}/structure/${kind}`, body, Named),
  cohorts: (orgId) => get(`${base(orgId)}/cohorts`, items(Cohort)).then((d) => d.items),
  cohort: (orgId, id) => get(`${base(orgId)}/cohorts/${encodeURIComponent(id)}`, CohortDetail),
  createCohort: (orgId, body) => send('POST', `${base(orgId)}/cohorts`, body, Cohort),
  updateCohort: (orgId, id, body) => send('PATCH', `${base(orgId)}/cohorts/${encodeURIComponent(id)}`, body, Cohort),
  removeFromCohort: (orgId, id, userId) => send('DELETE', `${base(orgId)}/cohorts/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, undefined, z.object({ removed: z.boolean() })),
  previewImport: (orgId, body) => send('POST', `${base(orgId)}/imports/students`, body, z.object({ job: ImportJob, rows: z.array(ImportRow) }), { defaultErrorMessage: 'This file could not be checked.' }),
  getImport: (orgId, jobId) => get(`${base(orgId)}/imports/${encodeURIComponent(jobId)}`, z.object({ job: ImportJob, rows: z.array(ImportRow) })),
  commitImport: (orgId, jobId, idempotencyKey = newIdempotencyKey('import')) => send('POST', `${base(orgId)}/imports/${encodeURIComponent(jobId)}/commit`, undefined, z.object({ job: ImportJob, replayed: z.boolean() }), { idempotencyKey, defaultErrorMessage: 'The import could not be completed.' }),
  programs: (orgId) => get(`${base(orgId)}/programs`, items(Program)).then((d) => d.items),
  program: (orgId, id) => get(`${base(orgId)}/programs/${encodeURIComponent(id)}`, ProgramDetail),
  createProgram: (orgId, body) => send('POST', `${base(orgId)}/programs`, body, Program.extend({ cohortIds: z.array(z.string()) })),
  updateProgram: (orgId, id, body) => send('PATCH', `${base(orgId)}/programs/${encodeURIComponent(id)}`, body, Program),
  catalog: (orgId) => get(`${base(orgId)}/assessment-catalog`, items(CatalogItem)).then((d) => d.items),
  consentPreview: (orgId) => get(`${base(orgId)}/consent-preview`, ConsentPreview),
  assignments: (orgId) => get(`${base(orgId)}/assignments`, items(AssignmentSummary)).then((d) => d.items),
  createAssignment: (orgId, body) => send('POST', `${base(orgId)}/assignments`, body, AssignmentSummary.extend({ rostered: z.number() }), { defaultErrorMessage: 'The assessment could not be assigned.' }),
  completion: (orgId, id) => get(`${base(orgId)}/assignments/${encodeURIComponent(id)}`, Completion),
  setAssignmentStatus: (orgId, id, status) => send('POST', `${base(orgId)}/assignments/${encodeURIComponent(id)}/status`, { status }, z.object({ id: z.string(), status: z.string() })),
  members: (orgId) => get(`${base(orgId)}/members`, Members),
  changeRole: (orgId, membershipId, role) => send('PATCH', `${base(orgId)}/members/${encodeURIComponent(membershipId)}`, { role }, z.object({ membershipId: z.string(), role: z.string() })),
  removeMember: (orgId, membershipId) => send('DELETE', `${base(orgId)}/members/${encodeURIComponent(membershipId)}`, undefined, z.object({ removed: z.boolean() })),
  invite: (orgId, body) => send('POST', `${base(orgId)}/invites`, body, z.array(z.object({ id: z.string(), email: z.string(), role: z.string(), delivery: z.string() })), { defaultErrorMessage: 'The invitation could not be sent.' }),
  resendInvite: (orgId, inviteId) => send('POST', `${base(orgId)}/invites/${encodeURIComponent(inviteId)}/resend`, undefined, z.object({ id: z.string(), email: z.string(), delivery: z.string() }), { defaultErrorMessage: 'The invitation could not be sent again.' }),
  audit: (orgId, query) => get(`${base(orgId)}/audit`, AuditPage, { query }),
  onboarding: (orgId) => get(`${base(orgId)}/onboarding`, Onboarding),
  saveOnboarding: (orgId, body) => send('PUT', `${base(orgId)}/onboarding`, body, Onboarding),
  notifications: () => get('/api/v1/me/notifications', items(Notification)).then((d) => d.items),
  markNotificationRead: (id) => send('POST', `/api/v1/me/notifications/${encodeURIComponent(id)}/read`, undefined, Notification),
}
