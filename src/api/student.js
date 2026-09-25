// Student application read models (/api/v1/me/*, /api/v1/assessment-assignments/*).
// Every call carries the active workspace header, so personal and sponsored
// data never mix (spec §4.3). Schemas validate the fields the UI relies on.
import { z } from 'zod'
import { request } from './client.js'

const Level = z.object({ band: z.string(), label: z.string() }).nullable()
const Status = z.enum(['INSUFFICIENT_EVIDENCE', 'PROVISIONAL', 'SUFFICIENT', 'HUMAN_REVIEW_REQUIRED'])
const Cta = z.object({ kind: z.enum(['START', 'VIEW_BRIEFING', 'RESUME', 'VIEW_REPORT', 'NONE']), to: z.string().nullable() })

export const AssignmentCardSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  scope: z.enum(['PERSONAL', 'SPONSORED']),
  sponsor: z.object({ organizationId: z.string(), name: z.string().nullable() }).nullable(),
  durationMinutes: z.number().int().positive(),
  integrityMode: z.enum(['STANDARD', 'PROCTORED']),
  opensAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'UPCOMING']),
  tab: z.enum(['ACTIVE', 'COMPLETED', 'UPCOMING']),
  sessionId: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  underReview: z.boolean(),
  acknowledgementRequired: z.boolean(),
  acknowledged: z.boolean(),
  cta: Cta,
}).passthrough()

const AssessmentsSchema = z.object({
  active: z.array(AssignmentCardSchema),
  completed: z.array(AssignmentCardSchema),
  upcoming: z.array(AssignmentCardSchema),
})

const Summary = z.object({ text: z.string(), status: z.enum(['SUPPORTED', 'PROVISIONAL', 'INSUFFICIENT']), evidenceIds: z.array(z.string()) }).passthrough()

export const CapabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  definition: z.string(),
  layer: z.enum(['PRIMARY', 'CONTEXTUAL']),
  status: Status,
  statusReasons: z.array(z.string()),
  level: Level,
  levelLabelsStatus: z.string(),
  change: z.null(),
  changeStatus: z.literal('NOT_COMPARABLE'),
  evidenceSummary: Summary,
  observedBehaviors: z.array(z.object({ evidenceId: z.string(), behavior: z.string(), quote: z.string().nullable() })),
  evidenceSources: z.array(z.object({ sessionId: z.string(), assessmentTitle: z.string().nullable(), completedAt: z.string().nullable() })),
  developmentPriority: z.boolean(),
  relatedMissions: z.array(z.unknown()),
  history: z.array(z.object({ sessionId: z.string(), assessmentTitle: z.string().nullable(), completedAt: z.string().nullable(), status: Status, level: Level })),
}).passthrough()

const CapabilitiesSchema = z.object({ items: z.array(CapabilitySchema), assessedCount: z.number().int(), excludedCount: z.number().int(), levelLabelsStatus: z.string() })

const Focus = z.object({ capabilityId: z.string(), name: z.string(), level: Level, status: Status }).passthrough()

const HomeSchema = z.object({
  user: z.object({ name: z.string().nullable() }),
  workspace: z.object({ id: z.string(), type: z.string(), name: z.string().nullable(), organizationName: z.string().nullable() }),
  primaryAction: z.object({
    kind: z.enum(['ASSESSMENT_DUE', 'ASSESSMENT_IN_PROGRESS', 'ASSESSMENT_READY', 'REPORT_READY', 'CAPABILITY_SUMMARY', 'GET_STARTED', 'NOTHING_ASSIGNED']),
    to: z.string().nullable(),
    title: z.string().optional(),
    scope: z.enum(['PERSONAL', 'SPONSORED']).optional(),
    dueAt: z.string().nullable().optional(),
    assignmentId: z.string().optional(),
  }),
  capabilitySnapshot: z.array(z.object({ id: z.string(), name: z.string(), status: Status, level: Level, change: z.null(), evidenceSummary: z.string() }).passthrough()),
  assessedCount: z.number().int(),
  focus: z.array(Focus).max(3),
  sponsor: z.object({ organizationId: z.string(), organizationName: z.string().nullable(), programName: z.string().nullable() }).nullable(),
  levelLabelsStatus: z.string(),
})

const EvidenceItem = z.object({
  id: z.string(),
  kind: z.enum(['FORMAL', 'PRACTICE']),
  sessionId: z.string().nullable().optional(),
  assessmentTitle: z.string().nullable().optional(),
  scope: z.enum(['PERSONAL', 'SPONSORED']).optional(),
  date: z.string().nullable().optional(),
  candidateAction: z.object({ quote: z.string().nullable(), turn: z.number().nullable(), artifactId: z.string().nullable() }).optional(),
  observedBehavior: z.string().nullable().optional(),
  capability: z.object({ id: z.string(), name: z.string().nullable() }).optional(),
  rubricAnchor: z.object({ criteria: z.string() }).nullable().optional(),
  evidenceStatus: z.string().optional(),
}).passthrough()

const EvidenceSchema = z.object({
  items: z.array(EvidenceItem),
  total: z.number().int(),
  facets: z.object({
    capabilities: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
    assessments: z.array(z.object({ sessionId: z.string(), title: z.string().nullable(), completedAt: z.string().nullable() })),
  }),
  practiceAvailable: z.boolean(),
})

const PlanSchema = z.object({
  status: z.enum(['FOCUS_FROM_EVIDENCE', 'NO_PLAN']),
  priorities: z.array(Focus).max(3),
  missions: z.array(z.unknown()),
  completedMissions: z.array(z.unknown()),
  missionsAvailable: z.boolean(),
  upcomingReassessment: z.unknown().nullable(),
  practiceEvidence: z.array(z.unknown()),
})

const GrowthSchema = z.object({
  comparable: z.boolean(),
  reason: z.string(),
  assessments: z.array(z.object({ sessionId: z.string(), title: z.string().nullable(), completedAt: z.string().nullable() })),
  changes: z.array(z.unknown()),
})

const BriefingSchema = z.object({
  assignment: AssignmentCardSchema,
  definition: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    durationMinutes: z.number().int().positive(),
    measures: z.array(z.object({ id: z.string(), name: z.string() })),
    notMeasured: z.array(z.string()),
    hasArtifacts: z.boolean(),
    integrityModes: z.array(z.string()),
  }),
  sponsorship: z.object({
    scope: z.enum(['PERSONAL', 'SPONSORED']),
    sponsorName: z.string().nullable(),
    disclosureCopyVersion: z.string().nullable(),
    acknowledged: z.boolean(),
    acknowledgedAt: z.string().nullable(),
  }),
  start: z.object({ allowed: z.boolean(), reason: z.string(), to: z.string().nullable() }),
})

const ExplorationSchema = z.object({
  selfReported: z.object({ interests: z.array(z.string()) }),
  demonstrated: z.array(z.object({ capabilityId: z.string(), name: z.string(), level: Level, status: Status })),
  recommendations: z.array(z.object({
    roleId: z.string(),
    title: z.string(),
    basis: z.string(),
    selfReportedReasons: z.array(z.string()),
    demonstratedReasons: z.array(z.string()),
    unknowns: z.array(z.string()),
    nextStep: z.object({ type: z.string(), label: z.string() }),
  })),
  evaluated: z.boolean(),
})

const PreferencesSchema = z.object({ reducedMotion: z.boolean(), largerText: z.boolean(), updatedAt: z.string().nullable() })

const GrantSchema = z.object({
  id: z.string(),
  recipient: z.object({ type: z.enum(['ORGANIZATION', 'LINK']), organizationName: z.string().nullable() }),
  resources: z.array(z.object({ resourceType: z.string(), resourceId: z.string(), disclosureLevel: z.enum(['SUMMARY', 'FULL']) })),
  createdAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']),
})

const get = async (path, schema, query) => (await request(path, { schema, query, on401: 'redirect' })).data

export const fetchStudentHome = () => get('/api/v1/me/home', HomeSchema)
export const fetchStudentAssessments = () => get('/api/v1/me/assessments', AssessmentsSchema)
export const fetchStudentCapabilities = () => get('/api/v1/me/capabilities', CapabilitiesSchema)
export const fetchStudentEvidence = (filters = {}) => get('/api/v1/me/evidence', EvidenceSchema, filters)
export const fetchDevelopmentPlan = () => get('/api/v1/me/development-plan', PlanSchema)
export const fetchGrowth = () => get('/api/v1/me/growth', GrowthSchema)
export const fetchAssignmentBriefing = (id) => get(`/api/v1/assessment-assignments/${encodeURIComponent(id)}`, BriefingSchema)
export const fetchPreferences = () => request('/api/v1/me/preferences', { workspace: false, schema: PreferencesSchema }).then((r) => r.data)
export const fetchShareGrants = () => request('/api/v1/me/share-grants', { workspace: false, schema: z.object({ items: z.array(GrantSchema) }) }).then((r) => r.data)

export async function acknowledgeAssignment(id, copyVersion) {
  const { data } = await request(`/api/v1/assessment-assignments/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
    body: { copyVersion, acknowledged: true },
    defaultErrorMessage: 'We could not record your acknowledgement.',
  })
  return data
}

export async function exploreRolesV2(interests) {
  const { data } = await request('/api/v1/me/role-exploration', {
    method: 'POST',
    body: { interests },
    schema: ExplorationSchema,
    defaultErrorMessage: 'Roles could not be loaded.',
  })
  return data
}

export async function savePreferences(prefs) {
  const { data } = await request('/api/v1/me/preferences', {
    method: 'PUT',
    workspace: false,
    body: prefs,
    schema: PreferencesSchema,
    defaultErrorMessage: 'Your preferences could not be saved.',
  })
  return data
}

export async function revokeShareGrant(id) {
  const { data } = await request(`/api/v1/me/share-grants/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    workspace: false,
    defaultErrorMessage: 'We could not revoke this share.',
  })
  return data
}
