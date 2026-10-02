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

// Authorized history projection (P1.2). Dates are stored facts or null.
export const HistoryItemSchema = z.object({
  id: z.string(),
  sourceType: z.enum(['FORMAL_SESSION', 'LEGACY_REPORT', 'PRACTICE_ATTEMPT', 'PREPARATION_ATTEMPT', 'SELF_REPORT']),
  sourceId: z.string(),
  mode: z.enum(['FORMAL', 'PRACTICE', 'PREPARATION', 'SELF_REPORT']),
  title: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  issuedAt: z.string().nullable(),
  scope: z.enum(['PERSONAL', 'SPONSORED']),
  sponsorOrganizationId: z.string().nullable(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'PROCESSING', 'TECHNICAL_FAILED', 'UNDER_REVIEW', 'LEGACY', 'ABANDONED']),
  reportFormat: z.enum(['V3', 'LEGACY_V2']).nullable(),
  permittedAction: z.object({ kind: z.enum(['VIEW_REPORT', 'RESUME', 'RECOVER', 'VIEW', 'NONE']), to: z.string().nullable() }),
  recoveryState: z.enum(['NONE', 'RESUMABLE', 'AWAITING_REPORT', 'RECOVERABLE', 'SUPPORT_REQUIRED', 'HELD']),
}).passthrough()

const HistorySchema = z.object({ items: z.array(HistoryItemSchema), nextCursor: z.string().nullable() })

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
    kind: z.enum(['ASSESSMENT_DUE', 'ASSESSMENT_IN_PROGRESS', 'ASSESSMENT_READY', 'ASSESSMENT_PROCESSING', 'ASSESSMENT_TECHNICAL_FAILED', 'REPORT_READY', 'CAPABILITY_SUMMARY', 'GET_STARTED', 'NOTHING_ASSIGNED']),
    to: z.string().nullable(),
    title: z.string().nullable().optional(),
    scope: z.enum(['PERSONAL', 'SPONSORED']).optional(),
    dueAt: z.string().nullable().optional(),
    assignmentId: z.string().optional(),
    // Session-backed kinds (processing / technical failure): the saved run.
    sessionId: z.string().optional(),
    completedAt: z.string().nullable().optional(),
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

const PlanMission = z.object({
  id: z.string(), title: z.string(), targetCapabilityName: z.string().nullable(), estimatedMinutes: z.number(),
  targetCapabilityId: z.string().optional(), status: z.string().optional(), displayCode: z.string().nullable().optional(), modes: z.array(z.string()).optional(),
  intervention: z.object({ id: z.string(), name: z.string(), endsOn: z.string().nullable() }).nullable(),
  latestAttempt: z.object({ id: z.string(), status: z.string(), summary: z.string().nullable(), submittedAt: z.string().nullable() }).nullable(),
}).passthrough()
// P6.8 practice allowance: shown only when it is actually bounded.
const PlanAllowance = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('UNLIMITED') }),
  z.object({ kind: z.literal('BOUNDED'), total: z.number(), used: z.number(), remaining: z.number(), validUntil: z.string().nullable() }),
])

const PlanSchema = z.object({
  status: z.enum(['FOCUS_FROM_EVIDENCE', 'NO_PLAN']),
  priorities: z.array(Focus).max(3),
  missions: z.array(PlanMission),
  catalogue: z.array(PlanMission).optional().default([]),
  allowance: PlanAllowance.optional().default({ kind: 'UNLIMITED' }),
  completedMissions: z.array(z.object({ attemptId: z.string(), missionId: z.string(), title: z.string().nullable(), status: z.string(), summary: z.string().nullable(), submittedAt: z.string().nullable() }).passthrough()),
  missionsAvailable: z.boolean(),
  missionsEnabled: z.boolean().optional().default(false),
  upcomingReassessment: z.unknown().nullable(),
  practiceEvidence: z.array(z.unknown()),
})

const GrowthSessionRef = z.object({
  sessionId: z.string(), title: z.string().nullable(), completedAt: z.string().nullable(),
  form: z.object({ id: z.string(), version: z.string() }).nullable().optional().default(null),
})
const BandLabel = z.object({ band: z.enum(['EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG']), label: z.string() })
// A change is a level-label change on an approved comparable pair; there is
// no score and no uncertainty until a validated method exists.
const GrowthChange = z.object({
  capabilityId: z.string(),
  name: z.string().nullable(),
  comparable: z.boolean(),
  reason: z.string().optional(),
  from: BandLabel.optional(),
  to: BandLabel.optional(),
  direction: z.enum(['HIGHER', 'SAME', 'LOWER']).optional(),
  uncertainty: z.null().optional(),
  uncertaintyStatus: z.literal('NOT_VALIDATED').optional(),
})
const GrowthSchema = z.object({
  comparable: z.boolean(),
  reason: z.string().nullable(),
  assessments: z.array(GrowthSessionRef),
  comparison: z.object({
    baseline: GrowthSessionRef,
    reassessment: GrowthSessionRef,
    formPair: z.object({ status: z.literal('APPROVED'), evidenceRef: z.string().nullable(), decidedAt: z.string().nullable() }),
  }).nullable().optional().default(null),
  changes: z.array(GrowthChange),
  reassessments: z.array(z.object({
    id: z.string(), name: z.string(), windowStart: z.string(), windowEnd: z.string(), status: z.string(), assignmentId: z.string(), rosterStatus: z.string().nullable(),
    endedAt: z.string().nullable().optional().default(null),
    comparability: z.enum(['APPROVED', 'PARTIAL', 'PENDING', 'REJECTED']).optional().default('PENDING'),
  })).optional().default([]),
  interventions: z.array(z.object({ id: z.string(), name: z.string(), startsOn: z.string(), endsOn: z.string(), status: z.string() })).optional().default([]),
  growthEnabled: z.boolean().optional().default(false),
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
  start: z.object({ allowed: z.boolean(), reason: z.string(), to: z.string().nullable(), mode: z.enum(['V3', 'LEGACY']).optional() }),
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

const PreferencesSchema = z.object({
  reducedMotion: z.boolean(),
  largerText: z.boolean(),
  segment: z.enum(['STUDENT', 'EARLY_CAREER', 'OTHER']).nullable().optional(),
  intention: z.enum(['UNDERSTAND', 'PRACTISE', 'PREPARE']).nullable().optional(),
  responseMode: z.enum(['TEXT']).nullable().optional(),
  updatedAt: z.string().nullable(),
})

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
export const fetchHistory = ({ cursor = null, limit } = {}) => get('/api/v1/me/history', HistorySchema, { ...(cursor ? { cursor } : {}), ...(limit ? { limit } : {}) })
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
