// Governed practice-mission schema (spec §16.2; C8.02). Every field the spec
// lists is required. Deterministic rules and rubric criteria reference each
// other by id and are cross-checked, so a mission can only claim behaviours
// it has a way to observe.
import { z } from 'zod'

export const MISSION_SCHEMA_VERSION = 'mission-schema.v1'

const Id = z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/)
const Text = (max) => z.string().trim().min(1).max(max)

const Artifact = z.object({
  artifact_id: Id,
  type: z.enum(['TEXT_RESPONSE', 'FIELD_SHEET', 'TABLE']),
  title: Text(120),
  prompt: Text(600),
  // FIELD_SHEET: named fields; TABLE: rows with editable numeric columns.
  fields: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/), label: Text(120), kind: z.enum(['text', 'number']), max_length: z.number().int().min(1).max(4000).optional() })).max(12).optional(),
  columns: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/), label: Text(80), kind: z.enum(['text', 'number']), editable: z.boolean() })).max(8).optional(),
  initial_state: z.record(z.unknown()),
  max_length: z.number().int().min(1).max(8000).optional(),
}).strict()

const Rule = z.object({
  rule_id: Id,
  criterion_id: Id,
  type: z.enum(['REQUIRED_FIELD', 'TEXT_PATTERN', 'NUMBER_RANGE', 'SUM_EQUALS']),
  artifact_id: Id,
  path: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/).optional(),
  params: z.record(z.unknown()),
  description: Text(300),
}).strict()

const Criterion = z.object({
  criterion_id: Id,
  behavior_id: Id,
  description: Text(300),
  // DETERMINISTIC: rules decide; EVALUATOR: the structured evaluator decides
  // (with a verbatim quote); BOTH: both must agree or the result is uncertain.
  check: z.enum(['DETERMINISTIC', 'EVALUATOR', 'BOTH']),
  evaluator_guidance: Text(600).optional(),
  artifact_ids: z.array(Id).min(1).max(4),
}).strict()

export const MissionContentSchema = z.object({
  mission_id: Id,
  version: z.number().int().min(1),
  status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']),
  title: Text(160),
  target_capability_id: z.string().regex(/^CAP-[A-Z0-9-]+$/),
  target_behavior_ids: z.array(Id).min(1).max(8),
  scenario_context: z.object({ setting: Text(1200), objective: Text(600) }).strict(),
  instructions: z.array(Text(400)).min(1).max(8),
  artifacts: z.array(Artifact).min(1).max(4),
  constraints: z.object({ notes: z.array(Text(300)).max(6), budget_total: z.number().positive().optional() }).strict(),
  deterministic_validation_rules: z.array(Rule).max(20),
  rubric: z.object({ criteria: z.array(Criterion).min(1).max(8) }).strict(),
  required_evidence: z.object({ min_criteria_observed: z.number().int().min(1) }).strict(),
  scaffolding_policy: z.object({ hints: z.array(Text(400)).max(5), reveal: z.literal('ON_REQUEST') }).strict(),
  feedback_policy: z.object({ mode: z.literal('CRITERION'), show_unobserved: z.boolean() }).strict(),
  estimated_duration: z.object({ minutes: z.number().int().min(5).max(120) }).strict(),
  accessibility_mode: z.object({ keyboard_only: z.literal(true), screen_reader: z.literal(true), untimed: z.boolean() }).strict(),
}).strict().superRefine((m, ctx) => {
  const artifacts = new Set(m.artifacts.map((a) => a.artifact_id))
  const criteria = new Map(m.rubric.criteria.map((c) => [c.criterion_id, c]))
  const behaviors = new Set(m.target_behavior_ids)
  for (const c of m.rubric.criteria) {
    if (!behaviors.has(c.behavior_id)) ctx.addIssue({ code: 'custom', message: `criterion ${c.criterion_id} targets an unlisted behaviour` })
    for (const a of c.artifact_ids) if (!artifacts.has(a)) ctx.addIssue({ code: 'custom', message: `criterion ${c.criterion_id} reads unknown artifact ${a}` })
    const rules = m.deterministic_validation_rules.filter((r) => r.criterion_id === c.criterion_id)
    if (c.check !== 'EVALUATOR' && rules.length === 0) ctx.addIssue({ code: 'custom', message: `criterion ${c.criterion_id} needs a deterministic rule` })
    if (c.check !== 'DETERMINISTIC' && !c.evaluator_guidance) ctx.addIssue({ code: 'custom', message: `criterion ${c.criterion_id} needs evaluator guidance` })
  }
  for (const r of m.deterministic_validation_rules) {
    if (!criteria.has(r.criterion_id)) ctx.addIssue({ code: 'custom', message: `rule ${r.rule_id} references unknown criterion` })
    if (!artifacts.has(r.artifact_id)) ctx.addIssue({ code: 'custom', message: `rule ${r.rule_id} reads unknown artifact` })
  }
  for (const b of behaviors) if (![...criteria.values()].some((c) => c.behavior_id === b)) ctx.addIssue({ code: 'custom', message: `behaviour ${b} has no criterion` })
  if (m.required_evidence.min_criteria_observed > m.rubric.criteria.length) ctx.addIssue({ code: 'custom', message: 'required evidence exceeds the rubric' })
})

export function parseMission(content) {
  const r = MissionContentSchema.safeParse(content)
  if (!r.success) {
    const err = new Error(`Invalid mission: ${r.error.issues.map((i) => i.message).join('; ')}`)
    err.code = 'INVALID_MISSION'
    throw err
  }
  return r.data
}
