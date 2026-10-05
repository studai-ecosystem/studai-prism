// Student Report V3 + sharing API (spec §14, §36.3). Schemas mirror the
// server contract; unknown fields are dropped and a shape error fails loudly.
import { z } from 'zod'
import { request } from './client.js'
import { RecommendationSchema } from './student.js'

const Level = z.object({ band: z.enum(['EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG']), label: z.string() })
const Status = z.enum(['INSUFFICIENT_EVIDENCE', 'PROVISIONAL', 'SUFFICIENT', 'HUMAN_REVIEW_REQUIRED'])
const ClaimStatus = z.enum(['SUPPORTED', 'PROVISIONAL', 'INSUFFICIENT'])

const Capability = z.object({
  id: z.string(),
  name: z.string(),
  displayLabel: z.string().nullable().optional().default(null),
  definition: z.string().nullable(),
  layer: z.string(),
  status: Status,
  statusReasons: z.array(z.string()),
  level: Level.nullable(),
  levelDescriptor: z.string().nullable(),
  summary: z.object({ claimId: z.string().nullable(), text: z.string(), status: ClaimStatus, evidenceIds: z.array(z.string()) }),
})

const Evidence = z.object({
  id: z.string(),
  kind: z.literal('FORMAL'),
  claimId: z.string(),
  claim: z.string(),
  claimStatus: ClaimStatus,
  capability: z.object({ id: z.string(), name: z.string() }),
  assessmentTitle: z.string(),
  candidateAction: z.object({ quote: z.string().nullable(), turn: z.number().nullable(), artifactId: z.string().nullable() }),
  observedBehavior: z.string(),
  rubricAnchor: z.object({ criteria: z.string() }).nullable(),
  evidenceStatus: z.enum(['PROVISIONAL', 'SUFFICIENT']),
  sufficiency: z.object({ status: Status, reasons: z.array(z.string()), unitCount: z.number(), opportunities: z.number() }),
  provenance: z.object({
    evidenceId: z.string(), source: z.enum(['CONVERSATION', 'WORK_MATERIAL']), turn: z.number().nullable(), artifactId: z.string().nullable(),
    rubricVersion: z.string().nullable(), reviewedBy: z.enum(['AI', 'AI_AND_HUMAN']), legacy: z.boolean(),
  }),
})

const Priority = z.object({
  capabilityId: z.string(),
  name: z.string(),
  claimId: z.string(),
  claim: z.string(),
  evidenceIds: z.array(z.string()),
  currentLevel: Level,
  behaviorToImprove: z.string().nullable(),
  whyItMatters: z.string().nullable(),
  recommendedMission: z.null(),
  practiceTime: z.null(),
  reassessmentWindow: z.null(),
  availability: z.object({ missions: z.string(), reassessment: z.string() }),
})

const Provenance = z.object({
  evidenceId: z.string(), source: z.enum(['CONVERSATION', 'WORK_MATERIAL']), turn: z.number().nullable(), artifactId: z.string().nullable(),
  rubricVersion: z.string().nullable(), reviewedBy: z.enum(['AI', 'AI_AND_HUMAN']), legacy: z.boolean(),
})

// A moment that mattered (P5.5): a verified unit with the learner's words.
export const MomentSchema = z.object({
  id: z.string(),
  basis: z.enum(['DESCRIBED', 'BOUNDED']),
  capability: z.object({ id: z.string(), name: z.string(), displayLabel: z.string().nullable() }),
  observedBehavior: z.string(),
  quote: z.string(),
  context: z.string(),
  source: z.object({ turn: z.number().nullable(), artifactId: z.string().nullable(), opportunityId: z.string().nullable() }),
  rubricAnchor: z.object({ criteria: z.string() }).nullable(),
  nextBehavior: z.string().nullable(),
  evidenceStatus: z.enum(['PROVISIONAL', 'SUFFICIENT']),
  provenance: Provenance,
})

export const ReportSchema = z.object({
  builderVersion: z.string(),
  sessionId: z.string(),
  disclosure: z.enum(['SUMMARY', 'FULL']),
  header: z.object({
    candidateName: z.string().nullable(),
    assessment: z.object({ definitionId: z.string().nullable(), title: z.string(), formId: z.string().nullable() }),
    scenarioTitle: z.string().nullable(),
    sponsor: z.object({ name: z.string() }).nullable(),
    scope: z.enum(['PERSONAL', 'SPONSORED']),
    completedAt: z.string().nullable(),
    verification: z.object({ identityAssurance: z.string(), credentialId: z.string().nullable() }),
  }),
  summary: z.object({ capabilities: z.array(Capability), describedCount: z.number(), insufficientCount: z.number() }),
  // Older stored versions predate these fields; absence is an honest empty state.
  plainStatement: z.string().nullable().optional().default(null),
  displayLabels: z.array(z.object({ id: z.string(), name: z.string(), displayLabel: z.string().nullable() })).optional().default([]),
  moments: z.array(MomentSchema).max(3).optional().default([]),
  evidence: z.array(Evidence),
  boundedObservations: z.array(z.object({
    id: z.string(),
    capability: z.object({ id: z.string(), name: z.string() }),
    observedBehavior: z.string(),
    quote: z.string(),
    source: z.object({ turn: z.number().nullable(), artifactId: z.string().nullable(), opportunityId: z.string().nullable() }),
    rubricAnchor: z.object({ criteria: z.string() }).nullable(),
    nextBehavior: z.string().nullable(),
    limitation: z.string(),
  }).passthrough()).optional().default([]),
  development: z.object({ priorities: z.array(Priority).max(3), maxPriorities: z.number() }).nullable(),
  // P4.5/P4.7 counts-only coverage notes; absent on legacy and older versions.
  coverage: z.object({ planned: z.number(), presented: z.number(), answered: z.number(), withheld: z.number(), notes: z.array(z.string()) }).optional(),
  // P5.7 reviewed correction: evidence ids a reviewer withheld from this version.
  review: z.object({ withheldEvidenceIds: z.array(z.string()) }).optional(),
  methodology: z.object({
    builderVersion: z.string(), sufficiencyRulesVersion: z.string(), levelLabelsStatus: z.string(), catalogVersion: z.string(),
    assessmentDefinitionId: z.string().nullable(), formId: z.string().nullable(),
  }),
})

const Share = z.object({ id: z.string(), recipientType: z.enum(['LINK', 'ORGANIZATION']), organizationName: z.string().nullable(), expiresAt: z.string(), disclosureLevel: z.enum(['SUMMARY', 'FULL']) })

const ReportResponse = z.object({
  report: ReportSchema,
  version: z.object({ number: z.number().int(), createdAt: z.string().nullable(), reason: z.string().nullable().optional().default(null), priorVersion: z.number().int().nullable().optional().default(null) }),
  audience: z.enum(['OWNER', 'SPONSOR', 'SHARE_LINK']),
  privacy: z.object({ visibility: z.string(), activeShares: z.array(Share), canShare: z.boolean() }).optional(),
  share: z.object({ expiresAt: z.string(), disclosureLevel: z.enum(['SUMMARY', 'FULL']) }).optional(),
  // Owner only (P5.6/P5.7): read-time recommendations and the pending-review state.
  review: z.object({ openRequests: z.number().int(), pending: z.boolean() }).optional(),
  recommendations: z.array(RecommendationSchema).optional().default([]),
})

const CreatedShare = z.object({ id: z.string(), recipientType: z.enum(['LINK', 'ORGANIZATION']), disclosureLevel: z.enum(['SUMMARY', 'FULL']), expiresAt: z.string(), token: z.string().nullable() })

const ReviewRequest = z.object({ id: z.string(), sessionId: z.string(), version: z.number().int(), category: z.string(), momentId: z.string().nullable(), state: z.enum(['OPEN', 'RESOLVED']), createdAt: z.string().nullable() })

const VersionHistory = z.object({
  sessionId: z.string(),
  versions: z.array(z.object({ version: z.number().int(), builderVersion: z.string(), createdAt: z.string().nullable(), issuedAt: z.string().nullable(), reason: z.string().nullable(), priorVersion: z.number().int().nullable(), publicationNote: z.string().nullable().optional() })),
  reviews: z.array(ReviewRequest),
})

export const REVIEW_CATEGORIES = ['TRANSCRIPTION', 'ATTRIBUTION', 'SCENARIO_FACT', 'INTERPRETATION', 'OTHER']

export async function fetchReportVersions(sessionId) {
  const { data } = await request(`/api/v1/assessment-sessions/${encodeURIComponent(sessionId)}/report/versions`, {
    schema: VersionHistory, defaultErrorMessage: 'The version history could not be loaded.',
  })
  return data
}

export async function requestReportReview(sessionId, body) {
  const { data } = await request(`/api/v1/assessment-sessions/${encodeURIComponent(sessionId)}/report/review-request`, {
    method: 'POST', body, schema: ReviewRequest, defaultErrorMessage: 'Your review request could not be sent.',
  })
  return data
}

const versionQuery = (version) => version == null ? '' : `?version=${encodeURIComponent(version)}`

export async function fetchStudentReport(sessionId, { version = null } = {}) {
  const { data } = await request(`/api/v1/assessment-sessions/${encodeURIComponent(sessionId)}/report${versionQuery(version)}`, {
    schema: ReportResponse, on401: 'redirect', defaultErrorMessage: 'Your report could not be loaded.',
  })
  return data
}

// A sponsored (or student-shared) report read by an authorized staff member.
export async function fetchSponsorReport(organizationId, sessionId, { version = null } = {}) {
  const { data } = await request(`/api/v1/organizations/${encodeURIComponent(organizationId)}/sessions/${encodeURIComponent(sessionId)}/report${versionQuery(version)}`, {
    schema: ReportResponse, defaultErrorMessage: 'This report could not be loaded.',
  })
  return data
}

export async function fetchSharedReport(token, { version = null } = {}) {
  const { data } = await request(`/api/v1/shared/${encodeURIComponent(token)}${versionQuery(version)}`, {
    workspace: false, auth: false, schema: ReportResponse, defaultErrorMessage: 'This report could not be loaded.',
  })
  return data
}

export async function createReportShare(body) {
  const { data } = await request('/api/v1/me/share-grants', {
    method: 'POST', body, schema: CreatedShare, defaultErrorMessage: 'This share could not be created.',
  })
  return data
}

export async function deleteShareGrant(id) {
  const { data } = await request(`/api/v1/me/share-grants/${encodeURIComponent(id)}`, {
    method: 'DELETE', workspace: false, defaultErrorMessage: 'We could not revoke this share.',
  })
  return data
}
