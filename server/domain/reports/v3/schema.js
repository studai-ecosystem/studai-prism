// Student Report V3 output contract (C6.01). The service validates every
// report before it is stored or served (fail closed): a shape error or a
// forbidden key is a server error, never a partially rendered report.
import { z } from 'zod'

const Level = z.object({ band: z.enum(['EARLY', 'DEVELOPING', 'DEMONSTRATED', 'STRONG']), label: z.string() }).strict()
const Status = z.enum(['INSUFFICIENT_EVIDENCE', 'PROVISIONAL', 'SUFFICIENT', 'HUMAN_REVIEW_REQUIRED'])
const ClaimStatus = z.enum(['SUPPORTED', 'PROVISIONAL', 'INSUFFICIENT'])

const Capability = z.object({
  id: z.string(),
  name: z.string(),
  displayLabel: z.string().nullable(),
  definition: z.string().nullable(),
  layer: z.string(),
  status: Status,
  statusReasons: z.array(z.string()),
  level: Level.nullable(),
  levelDescriptor: z.string().nullable(),
  summary: z.object({ claimId: z.string().nullable(), text: z.string(), status: ClaimStatus, evidenceIds: z.array(z.string()) }).strict(),
}).strict().superRefine((c, ctx) => {
  if (c.level && (c.summary.status === 'INSUFFICIENT' || c.summary.evidenceIds.length === 0)) ctx.addIssue({ code: 'custom', message: 'A level needs evidence' })
  if (!c.level && c.summary.status !== 'INSUFFICIENT') ctx.addIssue({ code: 'custom', message: 'No level means insufficient' })
})

const Evidence = z.object({
  id: z.string(),
  kind: z.literal('FORMAL'),
  claimId: z.string(),
  claim: z.string(),
  claimStatus: ClaimStatus,
  capability: z.object({ id: z.string(), name: z.string() }).strict(),
  assessmentTitle: z.string(),
  candidateAction: z.object({ quote: z.string().nullable(), turn: z.number().int().nullable(), artifactId: z.string().nullable() }).strict(),
  observedBehavior: z.string(),
  rubricAnchor: z.object({ criteria: z.string() }).strict().nullable(),
  evidenceStatus: z.enum(['PROVISIONAL', 'SUFFICIENT']),
  sufficiency: z.object({ status: Status, reasons: z.array(z.string()), unitCount: z.number().int().min(0), opportunities: z.number().int().min(0) }).strict(),
  provenance: z.object({
    evidenceId: z.string(), source: z.enum(['CONVERSATION', 'WORK_MATERIAL']), turn: z.number().int().nullable(), artifactId: z.string().nullable(),
    rubricVersion: z.string().nullable(), reviewedBy: z.enum(['AI', 'AI_AND_HUMAN']), legacy: z.boolean(),
  }).strict(),
}).strict()

const Provenance = z.object({
  evidenceId: z.string(), source: z.enum(['CONVERSATION', 'WORK_MATERIAL']), turn: z.number().int().nullable(), artifactId: z.string().nullable(),
  rubricVersion: z.string().nullable(), reviewedBy: z.enum(['AI', 'AI_AND_HUMAN']), legacy: z.boolean(),
}).strict()

// One verified observed moment below the sufficiency floor: never a level.
const BoundedObservation = z.object({
  id: z.string(),
  capability: z.object({ id: z.string(), name: z.string() }).strict(),
  observedBehavior: z.string(),
  quote: z.string(),
  source: z.object({ turn: z.number().int().nullable(), artifactId: z.string().nullable(), opportunityId: z.string().nullable() }).strict(),
  rubricAnchor: z.object({ criteria: z.string() }).strict().nullable(),
  nextBehavior: z.string().nullable(),
  limitation: z.string(),
  provenance: Provenance,
}).strict()

// A moment that mattered (P5.5): one verified unit, the learner's verbatim
// words, the stimulus it answered and the next behaviour from the anchors.
const Moment = z.object({
  id: z.string(),
  basis: z.enum(['DESCRIBED', 'BOUNDED']),
  capability: z.object({ id: z.string(), name: z.string(), displayLabel: z.string().nullable() }).strict(),
  observedBehavior: z.string().min(1),
  quote: z.string().min(1),
  context: z.string().min(1),
  source: z.object({ turn: z.number().int().nullable(), artifactId: z.string().nullable(), opportunityId: z.string().nullable() }).strict(),
  rubricAnchor: z.object({ criteria: z.string() }).strict().nullable(),
  nextBehavior: z.string().nullable(),
  evidenceStatus: z.enum(['PROVISIONAL', 'SUFFICIENT']),
  provenance: Provenance,
}).strict()

const Priority = z.object({
  capabilityId: z.string(),
  name: z.string(),
  claimId: z.string(),
  claim: z.string(),
  evidenceIds: z.array(z.string()).min(1),
  currentLevel: Level,
  behaviorToImprove: z.string().nullable(),
  whyItMatters: z.string().nullable(),
  recommendedMission: z.null(),
  practiceTime: z.null(),
  reassessmentWindow: z.null(),
  availability: z.object({ missions: z.literal('NOT_YET_AVAILABLE'), reassessment: z.literal('NOT_YET_AVAILABLE') }).strict(),
}).strict()

export const StudentReportV3Schema = z.object({
  builderVersion: z.string(),
  sessionId: z.string(),
  disclosure: z.enum(['SUMMARY', 'FULL']),
  header: z.object({
    candidateName: z.string().nullable(),
    assessment: z.object({ definitionId: z.string().nullable(), title: z.string(), formId: z.string().nullable() }).strict(),
    scenarioTitle: z.string().nullable(),
    sponsor: z.object({ name: z.string() }).strict().nullable(),
    scope: z.enum(['PERSONAL', 'SPONSORED']),
    completedAt: z.string().nullable(),
    verification: z.object({ identityAssurance: z.string(), credentialId: z.string().nullable() }).strict(),
  }).strict(),
  summary: z.object({ capabilities: z.array(Capability), describedCount: z.number().int().min(0), insufficientCount: z.number().int().min(0) }).strict(),
  plainStatement: z.string().min(1).nullable(),
  displayLabels: z.array(z.object({ id: z.string(), name: z.string(), displayLabel: z.string().nullable() }).strict()),
  evidence: z.array(Evidence),
  boundedObservations: z.array(BoundedObservation).optional(),
  moments: z.array(Moment).max(3),
  development: z.object({ priorities: z.array(Priority).max(3), maxPriorities: z.literal(3) }).strict().nullable(),
  // P4.5/P4.7 coverage diagnostics: counts and plain notes only.
  coverage: z.object({ planned: z.number().int().min(0), presented: z.number().int().min(0), answered: z.number().int().min(0), withheld: z.number().int().min(0), notes: z.array(z.string().min(1)) }).strict().optional(),
  // P5.7 reviewed correction: evidence ids a reviewer withheld (ids only).
  review: z.object({ withheldEvidenceIds: z.array(z.string().min(1)).min(1) }).strict().optional(),
  methodology: z.object({
    builderVersion: z.string(), sufficiencyRulesVersion: z.string(), levelLabelsStatus: z.string(), catalogVersion: z.string(),
    assessmentDefinitionId: z.string().nullable(), formId: z.string().nullable(),
  }).strict(),
  claims: z.array(z.object({
    claim_id: z.string(), claim_type: z.string(), capability_id: z.string().nullable(), text: z.string(),
    evidence_ids: z.array(z.string()), status: ClaimStatus, quote: z.string().nullable(),
  }).strict()),
}).strict()

// Keys that would leak a single score, a ranking or false precision.
export const FORBIDDEN_KEY = /composite|overall|percentile|score|rank|median|agreement|theta|confidence|weight/i
// The only numeric fields a report may carry: counts and positions.
const NUMERIC_KEYS = new Set(['turn', 'unitCount', 'opportunities', 'describedCount', 'insufficientCount', 'maxPriorities', 'planned', 'presented', 'answered', 'withheld'])

export function forbiddenPaths(value, path = '$') {
  const out = []
  if (Array.isArray(value)) value.forEach((v, i) => out.push(...forbiddenPaths(v, `${path}[${i}]`)))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(k)) out.push(`${path}.${k}`)
      if (typeof v === 'number' && !NUMERIC_KEYS.has(k)) out.push(`${path}.${k}`)
      out.push(...forbiddenPaths(v, `${path}.${k}`))
    }
  }
  return out
}

export function assertReportSafe(report) {
  const parsed = StudentReportV3Schema.safeParse(report)
  if (!parsed.success) throw new Error(`Report V3 failed its contract: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).slice(0, 5).join('; ')}`)
  const bad = forbiddenPaths(report)
  if (bad.length) throw new Error(`Report V3 carries forbidden fields: ${bad.slice(0, 5).join(', ')}`)
  return report
}
