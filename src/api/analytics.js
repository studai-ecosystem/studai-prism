// Campus analytics + reports (/api/v1, spec §20, §27, §28). Aggregates only;
// suppressed groups arrive as { suppressed: true, reason: 'SMALL_GROUP' }.
import { z } from 'zod'
import { request } from './client.js'

const nullableStr = z.string().nullable()
const Buckets = z.object({ INSUFFICIENT: z.number(), EARLY: z.number(), DEVELOPING: z.number(), DEMONSTRATED: z.number(), STRONG: z.number() })
const Suppressed = z.object({ suppressed: z.literal(true), reason: z.literal('SMALL_GROUP'), complementary: z.boolean().optional() })
const CapabilityRow = z.union([
  z.object({ capabilityId: z.string(), name: nullableStr, suppressed: z.literal(false), n: z.number(), buckets: Buckets, provisional: z.number() }),
  Suppressed.extend({ capabilityId: z.string(), name: nullableStr }),
])
const Need = z.object({ capabilityId: z.string(), name: nullableStr, needs: z.number(), of: z.number() })
const CapabilitiesView = z.object({
  minGroupSize: z.number(), assessed: z.number().optional(), underReview: z.number().optional(), bucketLabels: z.record(z.string()), method: z.string(),
  suppressed: z.boolean(), reason: z.string().optional(), capabilities: z.array(CapabilityRow), topNeeds: z.array(Need),
})
const SufficiencyView = z.object({
  minGroupSize: z.number(), assessed: z.number().optional(), underReview: z.number().optional(), suppressed: z.boolean(), reason: z.string().optional(),
  capabilities: z.array(z.union([
    z.object({ capabilityId: z.string(), name: nullableStr, suppressed: z.literal(false), n: z.number(), insufficient: z.number(), statuses: z.object({ SUFFICIENT: z.number(), PROVISIONAL: z.number(), INSUFFICIENT_EVIDENCE: z.number(), HUMAN_REVIEW_REQUIRED: z.number() }) }),
    Suppressed.extend({ capabilityId: z.string(), name: nullableStr }),
  ])),
})
const ComparisonView = z.object({
  groupBy: z.enum(['cohort', 'department']), minGroupSize: z.number(),
  capabilities: z.array(z.object({ capabilityId: z.string(), name: nullableStr })),
  groups: z.array(z.union([
    z.object({ groupId: z.string(), name: nullableStr, suppressed: z.literal(false), n: z.number(), capabilities: z.array(CapabilityRow) }),
    Suppressed.extend({ groupId: z.string(), name: nullableStr }),
  ])),
})
const CompletionView = z.object({
  assignments: z.number(),
  funnel: z.object({ assigned: z.number(), acknowledged: z.number(), started: z.number(), completed: z.number() }),
  notCompleted: z.object({ expired: z.number(), withdrawn: z.number() }),
})
const InterventionRow = z.union([
  z.object({ interventionId: z.string(), name: z.string(), status: z.string(), startsOn: z.string(), endsOn: z.string(), targetCapability: z.object({ id: z.string(), name: nullableStr }), suppressed: z.literal(false), members: z.number(), started: z.number(), completedAll: z.number() }),
  Suppressed.extend({ interventionId: z.string(), name: z.string(), status: z.string(), startsOn: z.string(), endsOn: z.string(), targetCapability: z.object({ id: z.string(), name: nullableStr }) }),
])
const Outcome = z.object({
  cycle: z.object({ id: z.string(), name: z.string(), status: z.string(), comparability: z.string() }),
  counts: z.object({ completedBoth: z.number(), comparable: z.number(), formsNotApproved: z.number(), underReviewOrMissing: z.number() }),
  capabilities: z.array(z.union([
    z.object({ capabilityId: z.string(), name: nullableStr, n: z.number(), higher: z.number(), same: z.number(), lower: z.number(), suppressed: z.literal(false) }),
    z.object({ capabilityId: z.string(), name: nullableStr, suppressed: z.literal(true), reason: z.literal('SMALL_GROUP') }),
  ])),
  minGroupSize: z.number(), method: z.string(),
})
const InterventionsView = z.object({
  minGroupSize: z.number(),
  interventions: z.array(z.intersection(InterventionRow, z.object({ outcome: Outcome.nullable() }))),
  reassessments: z.array(Outcome),
})
const Report = z.object({
  kind: z.enum(['EXECUTIVE', 'DEPARTMENT', 'COHORT']), generatedAt: z.string(), minGroupSize: z.number(),
  participation: CompletionView,
  capabilities: z.object({ suppressed: z.boolean(), assessed: z.number().optional(), underReview: z.number().optional(), items: z.array(CapabilityRow), bucketLabels: z.record(z.string()) }),
  majorGaps: z.array(Need),
  interventions: z.array(InterventionRow),
  reassessments: z.array(z.object({ id: z.string(), name: z.string(), status: z.string(), windowStart: z.string(), windowEnd: z.string(), comparability: z.string() })),
  recommendedActions: z.array(z.object({ kind: z.string(), text: z.string(), capabilityId: z.string().optional() })),
  method: z.string(), privacy: z.string(),
})
const Settings = z.object({ minAggregateGroupSize: z.number(), default: z.number(), floor: z.number(), updatedAt: nullableStr, canChange: z.boolean().optional().default(false) })

const base = (orgId) => `/api/v1/organizations/${encodeURIComponent(orgId)}`
const clean = (f = {}) => Object.fromEntries(Object.entries(f).filter(([, v]) => v))
const get = (orgId, path, schema, query, msg) => request(`${base(orgId)}${path}`, { query: clean(query), schema, defaultErrorMessage: msg }).then((r) => r.data)

export const analyticsApi = {
  capabilities: (orgId, f) => get(orgId, '/analytics/capabilities', CapabilitiesView, f, 'Capability analytics could not be loaded.'),
  sufficiency: (orgId, f) => get(orgId, '/analytics/sufficiency', SufficiencyView, f, 'Evidence analytics could not be loaded.'),
  comparison: (orgId, f, groupBy) => get(orgId, '/analytics/comparison', ComparisonView, { ...f, groupBy }, 'The comparison could not be loaded.'),
  completion: (orgId, f) => get(orgId, '/analytics/completion', CompletionView, f, 'Completion could not be loaded.'),
  interventions: (orgId) => get(orgId, '/analytics/interventions', InterventionsView, {}, 'Intervention outcomes could not be loaded.'),
  exportCsv: (orgId, body) => request(`${base(orgId)}/analytics/exports`, { method: 'POST', body, schema: z.object({ fileName: z.string(), contentType: z.string(), csv: z.string() }), defaultErrorMessage: 'The export could not be created.' }).then((r) => r.data),
  report: (orgId, body) => request(`${base(orgId)}/reports/cohort`, { method: 'POST', body, schema: Report, defaultErrorMessage: 'The report could not be generated.' }).then((r) => r.data),
  settings: (orgId) => get(orgId, '/settings/analytics', Settings, {}, 'Settings could not be loaded.'),
  saveSettings: (orgId, body) => request(`${base(orgId)}/settings/analytics`, { method: 'PATCH', body, schema: Settings, defaultErrorMessage: 'The setting could not be saved.' }).then((r) => r.data),
}
