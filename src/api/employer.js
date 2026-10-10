// Employer development-use (L&D) workspace API (PROD-READY Phase 9; dark
// behind the server flag PRISM_EMPLOYER_LND). Every call is scoped to one
// employer organization; the server decides what the caller may see. There
// is no call that ranks, sorts or filters people by result, and no export of
// individual results: the server refuses such parameters (PROHIBITED_USE).
import { z } from 'zod'
import { request } from './client.js'
import { ReportResponse } from './reports.js'

const base = (orgId) => `/api/v1/employer/organizations/${encodeURIComponent(orgId)}`
const nullableStr = z.string().nullable()
const Family = z.object({ id: z.string(), name: z.string() })
const CohortRef = z.object({ id: z.string(), name: z.string() })
const StaffCopy = z.object({
  status: z.string(), purpose: z.string(), peopleNote: z.string(), sharedReportsNote: z.string(), reportNotice: z.string(),
  insightsNote: z.string(), exportNote: z.string(), catalogNote: z.string(),
}).passthrough()

const Summary = z.object({
  id: z.string(), name: z.string(), organizationType: z.literal('EMPLOYER'),
  roles: z.array(z.object({ role: z.string(), label: z.string() })),
  permissions: z.array(z.string()),
  copy: StaffCopy,
  prohibitedUses: z.array(z.string()),
  jobFamilyScope: z.object({ version: z.string(), families: z.array(Family) }),
  invitableRoles: z.array(z.object({ role: z.string(), label: z.string() })),
})
const Overview = z.object({
  enrolled: z.number(), invited: z.number(), cohorts: z.number(), activeAssignments: z.number(),
  completion: z.object({ assigned: z.number(), completed: z.number() }), sharedReports: z.number().nullable(), purpose: z.string(),
})
const Cohort = z.object({ id: z.string(), name: z.string(), status: z.string(), memberCount: z.number().nullable(), jobFamily: Family.nullable() })
const Person = z.object({
  kind: z.enum(['MEMBER', 'INVITE']), userId: nullableStr, name: nullableStr, email: nullableStr, status: z.string(),
  cohorts: z.array(CohortRef), assessmentStatus: z.string(),
})
const People = z.object({ items: z.array(Person), total: z.number(), page: z.number(), pageSize: z.number(), order: z.literal('NAME'), note: z.string() })
const PersonDetail = z.object({
  person: z.object({ userId: z.string(), name: nullableStr, email: nullableStr, status: z.string(), joinedAt: nullableStr.optional() }),
  cohorts: z.array(CohortRef),
  assignments: z.array(z.object({ assignmentId: z.string(), title: nullableStr, status: z.string(), completedAt: nullableStr })),
  sharedReports: z.array(z.object({ sessionId: z.string(), disclosureLevel: z.enum(['SUMMARY', 'FULL']), expiresAt: z.string() })),
  note: z.string(),
})
const SharedReports = z.object({
  items: z.array(z.object({ sessionId: z.string(), person: z.object({ userId: z.string(), name: nullableStr }), disclosureLevel: z.enum(['SUMMARY', 'FULL']), expiresAt: z.string(), sharedAt: nullableStr })),
  note: z.string(),
})
const SharedReport = ReportResponse.extend({ notice: z.string(), prohibitedUses: z.array(z.string()) })
const Catalog = z.object({
  items: z.array(z.object({ id: z.string(), title: z.string(), description: nullableStr.optional(), durationMinutes: z.number().nullable().optional(), families: z.array(Family) })),
  note: z.string(),
})
const Assignment = z.object({
  id: z.string(), definitionId: z.string(), title: nullableStr, status: z.string(), windowStart: nullableStr, windowEnd: nullableStr,
  cohortIds: z.array(z.string()), counts: z.record(z.number()).optional(), rostered: z.number().optional(),
})
const Suppressed = z.object({ suppressed: z.boolean() }).passthrough()
const Insights = z.object({
  capabilities: z.object({
    minGroupSize: z.number(), suppressed: z.boolean(), bucketLabels: z.record(z.string()).optional(), method: z.string().optional(),
    assessed: z.number().nullable(), items: z.array(Suppressed), developmentFocus: z.array(z.object({ capabilityId: z.string(), name: nullableStr, needs: z.number(), of: z.number() })).optional().default([]),
  }),
  completion: z.object({ assignments: z.number(), funnel: z.object({ assigned: z.number(), acknowledged: z.number(), started: z.number(), completed: z.number() }), notCompleted: z.object({ expired: z.number(), withdrawn: z.number() }) }),
  missions: z.object({ minGroupSize: z.number(), available: z.boolean().optional(), interventions: z.array(Suppressed) }),
  note: z.string(),
})
const Export = z.object({ fileName: z.string(), contentType: z.string(), csv: z.string(), note: z.string() })
const Missions = z.object({
  missions: z.array(z.object({ id: z.string(), title: z.string(), targetCapabilityId: z.string(), targetCapabilityName: nullableStr.optional(), estimatedMinutes: z.number().nullable().optional() })),
  capabilities: z.array(z.object({ id: z.string(), name: z.string() })),
})
const Interventions = z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() }).passthrough()) })
const Invited = z.array(z.object({ id: z.string(), email: z.string(), role: z.string(), roleLabel: z.string(), expiresAt: z.string(), delivery: z.string() }))

const get = async (path, schema, message) => (await request(path, { schema, defaultErrorMessage: message })).data
const post = async (path, body, schema, message) => (await request(path, { method: 'POST', body, schema, defaultErrorMessage: message })).data

export const employerApi = {
  summary: (orgId) => get(base(orgId), Summary, 'This workspace could not be loaded.'),
  overview: (orgId) => get(`${base(orgId)}/overview`, Overview, 'The overview could not be loaded.'),
  cohorts: (orgId) => get(`${base(orgId)}/cohorts`, z.object({ items: z.array(Cohort) }), 'Groups could not be loaded.'),
  createCohort: (orgId, body) => post(`${base(orgId)}/cohorts`, body, Cohort, 'The group could not be created.'),
  invite: (orgId, body) => post(`${base(orgId)}/invites`, body, Invited, 'The invitations could not be sent.'),
  people: (orgId, { page = 1, q = '', cohortId = '' } = {}) => (
    request(`${base(orgId)}/people`, { query: Object.fromEntries(Object.entries({ page, q, cohortId }).filter(([, v]) => v !== '' && v != null)), schema: People, defaultErrorMessage: 'People could not be loaded.' }).then((r) => r.data)
  ),
  person: (orgId, userId) => get(`${base(orgId)}/people/${encodeURIComponent(userId)}`, PersonDetail, 'This person could not be loaded.'),
  sharedReports: (orgId) => get(`${base(orgId)}/shared-reports`, SharedReports, 'Shared reports could not be loaded.'),
  sharedReport: (orgId, sessionId) => get(`${base(orgId)}/shared-reports/${encodeURIComponent(sessionId)}`, SharedReport, 'This report could not be loaded.'),
  catalog: (orgId) => get(`${base(orgId)}/assessment-catalog`, Catalog, 'Assessments could not be loaded.'),
  assignments: (orgId) => get(`${base(orgId)}/assignments`, z.object({ items: z.array(Assignment) }), 'Assessments could not be loaded.'),
  createAssignment: (orgId, body) => post(`${base(orgId)}/assignments`, body, Assignment, 'The assessment could not be sponsored.'),
  insights: (orgId) => get(`${base(orgId)}/insights`, Insights, 'Group summaries could not be loaded.'),
  exportInsights: (orgId, view) => post(`${base(orgId)}/insights/exports`, { view }, Export, 'The export could not be created.'),
  missions: (orgId) => get(`${base(orgId)}/development-missions`, Missions, 'Practice missions could not be loaded.'),
  interventions: (orgId) => get(`${base(orgId)}/interventions`, Interventions, 'Development plans could not be loaded.'),
  createIntervention: (orgId, body) => post(`${base(orgId)}/interventions`, body, z.object({ id: z.string() }).passthrough(), 'The development plan could not be created.'),
}
