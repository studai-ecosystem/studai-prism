// V3 support routes (PROD-READY Phase 4): the one free human review of an
// assessment, an adjustment (accommodation) request before the start, and the
// identity check. Every mutation carries an Idempotency-Key, so the client
// can retry it safely. Schemas mirror the server contract; unknown fields are
// dropped and a shape error fails loudly.
import { z } from 'zod'
import { request, newIdempotencyKey } from './client.js'

const Outcome = z.object({
  decision: z.enum(['UPHOLD', 'CORRECT', 'REJECT']),
  decidedAt: z.string().nullable(),
  explanation: z.string().nullable(),
  correctedVersion: z.number().nullable(),
})

export const HumanReviewSchema = z.object({
  sessionId: z.string(),
  reportPublished: z.boolean(),
  freeReview: z.object({ used: z.boolean(), available: z.boolean() }),
  request: z.object({
    id: z.string(),
    state: z.enum(['OPEN', 'RESOLVED']),
    version: z.number(),
    createdAt: z.string(),
    outcome: Outcome.nullable(),
  }).nullable(),
  turnaround: z.object({ targetBusinessDays: z.number(), guaranteed: z.boolean() }),
  furtherReview: z.object({ offered: z.boolean() }),
})

const Modes = z.object({ textOnly: z.boolean(), noCamera: z.boolean(), reducedProctoring: z.boolean() })
const AccommodationRequest = z.object({
  id: z.string(),
  status: z.enum(['REQUESTED', 'APPROVED', 'DENIED', 'LAPSED']),
  needs: z.string(),
  modes: Modes.nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  linkedToSession: z.boolean(),
})

export const AccommodationSchema = z.object({
  assignmentId: z.string(),
  requestable: z.boolean(),
  reason: z.enum(['ALREADY_STARTED', 'CLOSED', 'NOT_REQUESTABLE']).nullable(),
  request: AccommodationRequest.nullable(),
})

const Level = z.object({ level: z.enum(['L1', 'L2', 'L3']), label: z.string(), explanation: z.string() })
export const IdentityCheckSchema = z.object({
  sessionId: z.string(),
  current: Level,
  selfDeclaration: z.object({ recorded: z.boolean(), declaredAt: z.string().nullable(), nameMatchesAccount: z.boolean().nullable() }),
  otherRecordOnFile: z.boolean(),
  options: z.array(Level.extend({ available: z.boolean(), how: z.string(), reason: z.string().optional() })),
})

export const SupportRequestsSchema = z.object({
  humanReviews: z.array(HumanReviewSchema),
  accommodations: z.array(AccommodationRequest.extend({ assignmentId: z.string() })),
})

const session = (id) => `/api/v1/assessment-sessions/${encodeURIComponent(id)}`
const assignment = (id) => `/api/v1/assessment-assignments/${encodeURIComponent(id)}`

export async function fetchHumanReview(sessionId) {
  const { data } = await request(`${session(sessionId)}/human-review`, { schema: HumanReviewSchema, defaultErrorMessage: 'The review status could not be loaded.' })
  return data
}

export async function requestHumanReview(sessionId, { reason }, idempotencyKey = newIdempotencyKey('review')) {
  const { data } = await request(`${session(sessionId)}/human-review`, {
    method: 'POST', body: { reason }, idempotencyKey, schema: HumanReviewSchema, defaultErrorMessage: 'Your review request could not be sent.',
  })
  return data
}

export async function fetchAccommodation(assignmentId) {
  const { data } = await request(`${assignment(assignmentId)}/accommodation`, { schema: AccommodationSchema, defaultErrorMessage: 'Your adjustment request could not be loaded.' })
  return data
}

export async function requestAccommodation(assignmentId, { needs }, idempotencyKey = newIdempotencyKey('adjustment')) {
  const { data } = await request(`${assignment(assignmentId)}/accommodation`, {
    method: 'POST', body: { needs }, idempotencyKey, schema: AccommodationSchema, defaultErrorMessage: 'Your adjustment request could not be sent.',
  })
  return data
}

export async function fetchIdentityCheck(sessionId) {
  const { data } = await request(`${session(sessionId)}/identity-check`, { schema: IdentityCheckSchema, defaultErrorMessage: 'The identity check could not be loaded.' })
  return data
}

export async function declareIdentity(sessionId, { declaredName }, idempotencyKey = newIdempotencyKey('identity')) {
  const { data } = await request(`${session(sessionId)}/identity-check`, {
    method: 'POST', body: { level: 'L1', declaredName, confirm: true }, idempotencyKey, schema: IdentityCheckSchema, defaultErrorMessage: 'Your confirmation could not be saved.',
  })
  return data
}

export async function fetchSupportRequests() {
  const { data } = await request('/api/v1/me/support-requests', { schema: SupportRequestsSchema, defaultErrorMessage: 'Your requests could not be loaded.' })
  return data
}
