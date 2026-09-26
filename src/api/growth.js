// Campus reassessment cycles + growth outcomes (/api/v1, spec §17, §25,
// §30.10). Outcomes are comparable-only; small groups arrive suppressed.
import { z } from 'zod'
import { request } from './client.js'

const nullableStr = z.string().nullable()
const Cycle = z.object({
  id: z.string(), name: z.string(), status: z.enum(['SCHEDULED', 'ACTIVE', 'CLOSED', 'CANCELLED']),
  windowStart: z.string(), windowEnd: z.string(), endedAt: nullableStr.optional().default(null), programId: nullableStr, interventionId: nullableStr, cohortIds: z.array(z.string()),
  baseline: z.object({ assignmentId: z.string(), title: nullableStr, windowStart: nullableStr, windowEnd: nullableStr, completed: z.number(), rostered: z.number() }),
  reassessment: z.object({ assignmentId: z.string(), title: nullableStr, completed: z.number(), rostered: z.number() }),
  comparability: z.enum(['APPROVED', 'PARTIAL', 'PENDING', 'REJECTED']),
  rostered: z.number().optional(),
})
const OutcomeCapability = z.union([
  z.object({ capabilityId: z.string(), name: nullableStr, n: z.number(), higher: z.number(), same: z.number(), lower: z.number(), suppressed: z.literal(false) }),
  z.object({ capabilityId: z.string(), name: nullableStr, suppressed: z.literal(true), reason: z.literal('SMALL_GROUP') }),
])
const Outcome = z.object({
  cycle: z.object({ id: z.string(), name: z.string(), status: z.string(), comparability: z.string() }),
  counts: z.object({ completedBoth: z.number(), comparable: z.number(), formsNotApproved: z.number(), underReviewOrMissing: z.number() }),
  capabilities: z.array(OutcomeCapability),
  minGroupSize: z.number(),
  method: z.string(),
})

const base = (orgId) => `/api/v1/organizations/${encodeURIComponent(orgId)}`
export const fetchReassessments = (orgId) => request(`${base(orgId)}/reassessments`, { schema: z.object({ items: z.array(Cycle) }), defaultErrorMessage: 'Reassessments could not be loaded.' }).then((r) => r.data.items)
export const createReassessment = (orgId, body) => request(`${base(orgId)}/reassessments`, { method: 'POST', body, schema: Cycle, defaultErrorMessage: 'The reassessment could not be scheduled.' }).then((r) => r.data)
export const setReassessmentStatus = (orgId, id, status) => request(`${base(orgId)}/reassessments/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status }, schema: Cycle, defaultErrorMessage: 'The reassessment could not be updated.' }).then((r) => r.data)
export const fetchGrowthOutcomes = (orgId, cycleId) => request(`${base(orgId)}/analytics/growth`, { query: { cycleId }, schema: z.object({ items: z.array(Outcome) }), defaultErrorMessage: 'Growth outcomes could not be loaded.' }).then((r) => r.data.items)
