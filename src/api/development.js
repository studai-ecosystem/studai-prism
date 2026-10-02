// Practice missions + role exploration: legacy JSON (non-envelope) for the
// legacy pages, and the /api/v1 Development V2 contract below.
import { z } from 'zod'
import { request, newIdempotencyKey } from './client.js'

const legacy = { legacy: true, workspace: false, on401: 'throw' }

export async function fetchMissions() {
  const { data } = await request('/api/missions', {
    ...legacy,
    defaultErrorMessage: 'Practice missions could not be loaded.',
  })
  return Array.isArray(data?.missions) ? data.missions : []
}

export async function fetchMission(missionId) {
  const { data } = await request(`/api/missions/${encodeURIComponent(missionId)}`, {
    ...legacy,
    defaultErrorMessage: 'This mission could not be loaded.',
  })
  return data?.mission || null
}

export async function submitMissionPractice(missionId, candidateInputs) {
  const { data } = await request(`/api/missions/${encodeURIComponent(missionId)}/submit`, {
    ...legacy,
    method: 'POST',
    body: { candidateInputs },
    defaultErrorMessage: 'Your practice could not be submitted.',
  })
  return data
}

/** Roles explained from self-reported interests only (null → no interest reasons). */
export async function exploreRoles({ candidateInterests = null } = {}) {
  const { data } = await request('/api/job-families/explore', {
    ...legacy,
    auth: false,
    method: 'POST',
    body: candidateInterests ? { candidateInterests } : {},
    defaultErrorMessage: 'Roles could not be loaded.',
  })
  return data
}

// ── Development Engine V2 (/api/v1, spec §16, §26, §32.2) ────────────────
const nullableStr = z.string().nullable()
const AllowanceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('UNLIMITED') }),
  z.object({ kind: z.literal('BOUNDED'), total: z.number(), used: z.number(), remaining: z.number(), validUntil: nullableStr }),
])
const MissionCardSchema = z.object({
  id: z.string(), version: z.number(), title: z.string(), targetCapabilityId: z.string(), targetCapabilityName: nullableStr,
  status: z.string().optional(), displayCode: nullableStr.optional(), modes: z.array(z.string()).optional(),
  estimatedMinutes: z.number(), behaviorCount: z.number(),
  intervention: z.object({ id: z.string(), name: z.string(), endsOn: nullableStr }).nullable(),
  latestAttempt: z.object({ id: z.string(), status: z.string(), summary: nullableStr, submittedAt: nullableStr }).nullable(),
})
const ArtifactSchema = z.object({
  id: z.string(), type: z.enum(['TEXT_RESPONSE', 'FIELD_SHEET', 'TABLE']), title: z.string(), prompt: z.string(),
  fields: z.array(z.object({ key: z.string(), label: z.string(), kind: z.enum(['text', 'number']), max_length: z.number().optional() })).nullable(),
  columns: z.array(z.object({ key: z.string(), label: z.string(), kind: z.enum(['text', 'number']), editable: z.boolean() })).nullable(),
  maxLength: z.number().nullable(),
})
const MissionViewSchema = z.object({
  mission: z.object({
    id: z.string(), version: z.number(), title: z.string(),
    status: z.string().optional(), displayCode: nullableStr.optional(),
    targetCapability: z.object({ id: z.string(), name: nullableStr }),
    scenario: z.object({ setting: z.string(), objective: z.string() }),
    whyItMatters: nullableStr.optional(), reflectionPrompt: nullableStr.optional(),
    instructions: z.array(z.string()), artifacts: z.array(ArtifactSchema), constraints: z.array(z.string()),
    whatIsChecked: z.array(z.object({ criterionId: z.string(), description: z.string() })),
    hintCount: z.number(), estimatedMinutes: z.number(), evidenceType: z.literal('PRACTICE'),
  }),
  intervention: z.object({ id: z.string(), name: z.string(), endsOn: nullableStr }).nullable(),
  openAttemptId: nullableStr,
  allowance: AllowanceSchema.optional(),
  pastAttempts: z.array(z.object({ id: z.string(), status: z.string(), summary: nullableStr, submittedAt: nullableStr })),
})
const ResultSchema = z.object({
  status: z.enum(['EVALUATED', 'EVALUATION_UNAVAILABLE']),
  verified: z.boolean(),
  summary: z.string(),
  counts: z.object({ demonstrated: z.number(), uncertain: z.number(), total: z.number() }),
  criteria: z.array(z.object({
    criterionId: z.string(), description: z.string(), result: z.enum(['OBSERVED', 'NOT_OBSERVED', 'UNCERTAIN']),
    quote: nullableStr, checks: z.array(z.object({ description: z.string(), passed: z.boolean() })), note: nullableStr,
  })),
})
const OriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('GOAL') }),
  z.object({ kind: z.literal('ASSESSMENT_MOMENT'), sessionId: z.string(), opportunityId: z.string() }),
])
export const AttemptSchema = z.object({
  id: z.string(), missionId: z.string(), missionVersion: z.number(),
  status: z.enum(['IN_PROGRESS', 'EVALUATED', 'EVALUATION_UNAVAILABLE']),
  version: z.number(), work: z.record(z.unknown()), hints: z.array(z.string()), hintsRemaining: z.number(),
  origin: OriginSchema.nullable().optional(),
  // P6: assistance mode (GUIDED hints on request / UNCOACHED fresh challenge)
  // and, for a replayed moment, the stimulus text the learner was shown.
  assistance: z.object({ mode: z.enum(['GUIDED', 'UNCOACHED']), hintsUsed: z.number(), scaffoldRequested: z.boolean() }).optional(),
  stimulus: z.object({ source: z.enum(['ASSESSMENT_MOMENT', 'MISSION_BRIEFING']), opportunityId: nullableStr.optional(), text: z.string(), presentedAt: nullableStr.optional() }).nullable().optional(),
  result: ResultSchema.nullable(), submittedAt: nullableStr, evidenceType: z.literal('PRACTICE'),
})
const StartedSchema = z.object({ attempt: AttemptSchema, missionId: z.string() })

export const fetchV2Missions = () => request('/api/v1/missions', { schema: z.object({ items: z.array(MissionCardSchema) }).passthrough(), defaultErrorMessage: 'Practice missions could not be loaded.' }).then((r) => r.data.items)
export const fetchV2Mission = (id) => request(`/api/v1/missions/${encodeURIComponent(id)}`, { schema: MissionViewSchema, defaultErrorMessage: 'This mission could not be loaded.' }).then((r) => r.data)
// `origin` (P2.8): the learner's goal, or the approved assessment moment this
// practice was started from — identifiers only, never assessment content.
export const startMissionAttempt = (id, { retry = false, origin = null, idempotencyKey = newIdempotencyKey('mission') } = {}) => request(`/api/v1/missions/${encodeURIComponent(id)}/attempts`, {
  method: 'POST', body: { ...(retry ? { retry: true } : {}), ...(origin ? { origin } : {}) }, idempotencyKey, schema: AttemptSchema, defaultErrorMessage: 'The mission could not be started.',
}).then((r) => r.data)
export const fetchMissionAttempt = (attemptId) => request(`/api/v1/mission-attempts/${encodeURIComponent(attemptId)}`, { schema: AttemptSchema, defaultErrorMessage: 'Your work could not be loaded.' }).then((r) => r.data)
export const saveMissionWork = (attemptId, version, work) => request(`/api/v1/mission-attempts/${encodeURIComponent(attemptId)}`, {
  method: 'PATCH', body: { work }, ifMatch: `"${version}"`, schema: AttemptSchema, defaultErrorMessage: 'Your work could not be saved.',
}).then((r) => r.data)
export const revealMissionHint = (attemptId, version) => request(`/api/v1/mission-attempts/${encodeURIComponent(attemptId)}/hints`, {
  method: 'POST', ifMatch: `"${version}"`, schema: AttemptSchema, defaultErrorMessage: 'The hint could not be shown.',
}).then((r) => r.data)
export const submitMissionAttempt = (attemptId) => request(`/api/v1/mission-attempts/${encodeURIComponent(attemptId)}/submit`, {
  method: 'POST', schema: AttemptSchema, defaultErrorMessage: 'Your work could not be submitted.',
}).then((r) => r.data)
// P6.6 "Try that moment again": identifiers only; the server copies the
// stimulus it showed, never the learner's transcript.
export const replayMoment = ({ sessionId, opportunityId, idempotencyKey = newIdempotencyKey('replay') }) => request('/api/v1/development/replay', {
  method: 'POST', body: { sessionId, opportunityId }, idempotencyKey, schema: StartedSchema, defaultErrorMessage: 'This moment could not be opened for practice.',
}).then((r) => r.data)
// P6.7 fresh challenge for a capability (uncoached; hints off).
export const startChallenge = ({ capabilityId, idempotencyKey = newIdempotencyKey('challenge') }) => request('/api/v1/development/challenge', {
  method: 'POST', body: { capabilityId }, idempotencyKey, schema: StartedSchema, defaultErrorMessage: 'A fresh challenge could not be started.',
}).then((r) => r.data)

// Campus interventions (spec §26).
const InterventionSchema = z.object({
  id: z.string(), name: z.string(), status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']), cohortId: z.string(), cohortName: z.string().optional(),
  startsOn: z.string(), endsOn: z.string(), reassessmentPlanned: z.boolean(),
  targetCapability: z.object({ id: z.string(), name: nullableStr }),
  missions: z.array(z.object({ id: z.string(), title: nullableStr, completed: z.number() })),
  counts: z.object({ members: z.number(), started: z.number(), completedAll: z.number() }),
})
const orgBase = (orgId) => `/api/v1/organizations/${encodeURIComponent(orgId)}`
export const fetchInterventions = (orgId) => request(`${orgBase(orgId)}/interventions`, { schema: z.object({ items: z.array(InterventionSchema) }), defaultErrorMessage: 'Interventions could not be loaded.' }).then((r) => r.data.items)
export const fetchIntervention = (orgId, id) => request(`${orgBase(orgId)}/interventions/${encodeURIComponent(id)}`, { schema: InterventionSchema, defaultErrorMessage: 'This intervention could not be loaded.' }).then((r) => r.data)
export const fetchPracticeCatalogue = (orgId) => request(`${orgBase(orgId)}/practice-missions`, {
  schema: z.object({
    missions: z.array(z.object({ id: z.string(), title: z.string(), targetCapabilityId: z.string(), targetCapabilityName: nullableStr, estimatedMinutes: z.number() })),
    capabilities: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  defaultErrorMessage: 'Practice missions could not be loaded.',
}).then((r) => r.data)
export const createIntervention = (orgId, body) => request(`${orgBase(orgId)}/interventions`, { method: 'POST', body, schema: InterventionSchema, defaultErrorMessage: 'The intervention could not be created.' }).then((r) => r.data)
export const setInterventionStatus = (orgId, id, status) => request(`${orgBase(orgId)}/interventions/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status }, schema: InterventionSchema, defaultErrorMessage: 'The intervention could not be updated.' }).then((r) => r.data)
