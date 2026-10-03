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

// P6.4 MEANING check: the intent a learner must express in their own words.
// `synonyms` are common phrasings handed to the evaluator as examples only —
// a keyword match never proves the behaviour; a valid paraphrase can.
const Meaning = z.object({
  intent: Text(400),
  synonyms: z.array(Text(80)).min(1).max(12),
}).strict()

const Criterion = z.object({
  criterion_id: Id,
  behavior_id: Id,
  description: Text(300),
  // DETERMINISTIC: rules decide; EVALUATOR: the structured evaluator decides
  // (with a verbatim quote); BOTH: both must agree or the result is uncertain;
  // MEANING: semantic equivalence decided by the evaluator ({met, quote,
  // reason}) — empty or very short work is "not met", never guessed.
  check: z.enum(['DETERMINISTIC', 'EVALUATOR', 'BOTH', 'MEANING']),
  evaluator_guidance: Text(600).optional(),
  meaning: Meaning.optional(),
  artifact_ids: z.array(Id).min(1).max(4),
}).strict()

// P6.2 reviewer package. Examples are teaching support shown only after a
// submission or on explicit request; copying one is detected and never
// counted as the learner's own behaviour (P6.4).
const Example = z.object({
  example_id: Id,
  kind: z.enum(['EXAMPLE', 'COUNTEREXAMPLE']),
  criterion_ids: z.array(Id).min(1).max(4),
  text: Text(600),
  note: Text(300),
}).strict()
// First-attempt feedback logic: which completed criterion to acknowledge
// first and which missing one is the highest-value next change.
const FirstAttemptFeedback = z.object({
  completed_priority: z.array(Id).min(1).max(8),
  next_change_priority: z.array(Id).min(1).max(8),
}).strict()
// Unfamiliar-transfer version: a different setting for the SAME behaviour
// ids. It may swap the starting artifact state, rule parameters and meaning
// phrasings that are bound to the base facts; criteria, behaviours and
// artifact structure stay identical so feedback stays comparable.
const Transfer = z.object({
  setting: Text(1200),
  objective: Text(600),
  constraints_notes: z.array(Text(300)).max(6),
  situation_facts: z.array(Text(300)).min(1).max(10),
  exposure_tags: z.array(Id).max(8),
  artifact_initial_state: z.record(z.record(z.unknown())).optional(),
  rule_overrides: z.array(z.object({ rule_id: Id, params: z.record(z.unknown()), description: Text(300).optional() }).strict()).max(20).optional(),
  meaning_overrides: z.array(z.object({ criterion_id: Id, intent: Text(400), synonyms: z.array(Text(80)).min(1).max(12), evaluator_guidance: Text(600).optional() }).strict()).max(8).optional(),
}).strict()
// A DRAFT review record never records an approval: publication is a separate
// human decision recorded elsewhere (content_review, 0050).
const ReviewRecord = z.object({
  status: z.literal('DRAFT'),
  authored_by: Text(80),
  authored_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reviewed_by: z.null(),
  reviewed_on: z.null(),
  approval: z.literal('NOT_APPROVED'),
  notes: Text(600).optional(),
}).strict()

export const MissionContentSchema = z.object({
  mission_id: Id,
  version: z.number().int().min(1),
  status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']),
  // P6.2 reviewer-package fields (optional so earlier versions stay byte-identical).
  situation_facts: z.array(Text(300)).min(1).max(10).optional(),
  learner_actions: z.array(Text(300)).min(1).max(8).optional(),
  clarifications: z.array(z.object({ question: Text(300), answer: Text(400) }).strict()).max(8).optional(),
  examples: z.array(Example).max(8).optional(),
  first_attempt_feedback: FirstAttemptFeedback.optional(),
  transfer: Transfer.optional(),
  accessibility_note: Text(600).optional(),
  confounds: z.array(Text(300)).min(1).max(8).optional(),
  review_record: ReviewRecord.optional(),
  // P6 authoring metadata (optional so earlier versions stay byte-identical).
  display_code: z.string().regex(/^M\d{2}$/).optional(),
  source: z.enum(['ORIGINAL', 'LEGACY']).optional(),
  form_behaviour_ids: z.array(Id).min(1).max(2).optional(),
  why_it_matters: Text(600).optional(),
  reflection_prompt: Text(400).optional(),
  retry_variation: Text(400).optional(),
  // Which universal-form opportunities this mission resembles — exposure
  // tracking so a fresh challenge never reuses a familiar setting.
  exposure_tags: z.array(Id).max(8).optional(),
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
    if (c.check !== 'EVALUATOR' && c.check !== 'MEANING' && rules.length === 0) ctx.addIssue({ code: 'custom', message: `criterion ${c.criterion_id} needs a deterministic rule` })
    if (c.check !== 'DETERMINISTIC' && !c.evaluator_guidance) ctx.addIssue({ code: 'custom', message: `criterion ${c.criterion_id} needs evaluator guidance` })
    if (c.check === 'MEANING' && !c.meaning) ctx.addIssue({ code: 'custom', message: `criterion ${c.criterion_id} needs a meaning (intent + phrasings)` })
    if (c.check !== 'MEANING' && c.meaning) ctx.addIssue({ code: 'custom', message: `criterion ${c.criterion_id} carries a meaning but is not a MEANING check` })
  }
  for (const r of m.deterministic_validation_rules) {
    if (!criteria.has(r.criterion_id)) ctx.addIssue({ code: 'custom', message: `rule ${r.rule_id} references unknown criterion` })
    if (!artifacts.has(r.artifact_id)) ctx.addIssue({ code: 'custom', message: `rule ${r.rule_id} reads unknown artifact` })
  }
  for (const b of behaviors) if (![...criteria.values()].some((c) => c.behavior_id === b)) ctx.addIssue({ code: 'custom', message: `behaviour ${b} has no criterion` })
  if (m.required_evidence.min_criteria_observed > m.rubric.criteria.length) ctx.addIssue({ code: 'custom', message: 'required evidence exceeds the rubric' })
  // P6.2 package cross-checks.
  for (const e of m.examples || []) for (const id of e.criterion_ids) if (!criteria.has(id)) ctx.addIssue({ code: 'custom', message: `example ${e.example_id} references unknown criterion ${id}` })
  if (m.first_attempt_feedback) {
    for (const id of [...m.first_attempt_feedback.completed_priority, ...m.first_attempt_feedback.next_change_priority]) {
      if (!criteria.has(id)) ctx.addIssue({ code: 'custom', message: `first-attempt feedback references unknown criterion ${id}` })
    }
  }
  if (m.transfer) {
    const rules = new Set(m.deterministic_validation_rules.map((r) => r.rule_id))
    for (const o of m.transfer.rule_overrides || []) if (!rules.has(o.rule_id)) ctx.addIssue({ code: 'custom', message: `transfer overrides unknown rule ${o.rule_id}` })
    for (const o of m.transfer.meaning_overrides || []) {
      const c = criteria.get(o.criterion_id)
      if (!c) ctx.addIssue({ code: 'custom', message: `transfer overrides unknown criterion ${o.criterion_id}` })
      else if (c.check !== 'MEANING') ctx.addIssue({ code: 'custom', message: `transfer meaning override ${o.criterion_id} is not a MEANING criterion` })
    }
    for (const id of Object.keys(m.transfer.artifact_initial_state || {})) if (!artifacts.has(id)) ctx.addIssue({ code: 'custom', message: `transfer starts unknown artifact ${id}` })
  }
  if (m.review_record && m.status !== 'DRAFT') ctx.addIssue({ code: 'custom', message: 'a review record describes DRAFT content only' })
})

export const MISSION_VARIANTS = Object.freeze(['BASE', 'TRANSFER'])

// The mission as it runs for one attempt. TRANSFER swaps the scene, the
// starting artifact state and any fact-bound rule parameters / meaning
// phrasings; everything else (criteria, behaviours, artifact structure,
// hints, feedback policy) is the base mission, so two attempts stay
// comparable criterion by criterion.
export function applyVariant(mission, variant = 'BASE') {
  if (variant !== 'TRANSFER') return mission
  const t = mission.transfer
  if (!t) throw Object.assign(new Error(`Mission ${mission.mission_id} has no transfer version`), { code: 'NO_TRANSFER_VARIANT' })
  const ruleOverride = new Map((t.rule_overrides || []).map((o) => [o.rule_id, o]))
  const meaningOverride = new Map((t.meaning_overrides || []).map((o) => [o.criterion_id, o]))
  return {
    ...mission,
    scenario_context: { setting: t.setting, objective: t.objective },
    constraints: { ...mission.constraints, notes: t.constraints_notes },
    situation_facts: t.situation_facts,
    exposure_tags: t.exposure_tags,
    artifacts: mission.artifacts.map((a) => (t.artifact_initial_state?.[a.artifact_id] ? { ...a, initial_state: t.artifact_initial_state[a.artifact_id] } : a)),
    deterministic_validation_rules: mission.deterministic_validation_rules.map((r) => {
      const o = ruleOverride.get(r.rule_id)
      return o ? { ...r, params: o.params, description: o.description || r.description } : r
    }),
    rubric: {
      criteria: mission.rubric.criteria.map((c) => {
        const o = meaningOverride.get(c.criterion_id)
        return o ? { ...c, meaning: { intent: o.intent, synonyms: o.synonyms }, evaluator_guidance: o.evaluator_guidance || c.evaluator_guidance } : c
      }),
    },
  }
}

// P6.2 reviewer-package completeness: the fields every authored mission must
// carry before a human can review it. Returns the names that are missing or
// empty (an empty array means the package is complete).
export const P6_PACKAGE_FIELDS = Object.freeze([
  'situation_facts', 'objective', 'learner_actions', 'clarifications', 'initial_artifact_state', 'success_criteria',
  'examples', 'counterexamples', 'deterministic_checks', 'semantic_checks', 'first_attempt_feedback', 'scaffold',
  'retry_variation', 'transfer', 'accessibility_note', 'confounds', 'review_record',
])
export function missionPackageGaps(m) {
  const gaps = []
  const has = (name, ok) => { if (!ok) gaps.push(name) }
  has('situation_facts', Array.isArray(m.situation_facts) && m.situation_facts.length > 0)
  has('objective', Boolean(m.scenario_context?.objective))
  has('learner_actions', Array.isArray(m.learner_actions) && m.learner_actions.length > 0)
  has('clarifications', Array.isArray(m.clarifications) && m.clarifications.length > 0)
  has('initial_artifact_state', Array.isArray(m.artifacts) && m.artifacts.every((a) => a.initial_state && typeof a.initial_state === 'object'))
  has('success_criteria', (m.rubric?.criteria || []).length > 0)
  has('examples', (m.examples || []).some((e) => e.kind === 'EXAMPLE'))
  has('counterexamples', (m.examples || []).some((e) => e.kind === 'COUNTEREXAMPLE'))
  has('deterministic_checks', (m.rubric?.criteria || []).some((c) => c.check === 'DETERMINISTIC' || c.check === 'BOTH'))
  has('semantic_checks', (m.rubric?.criteria || []).some((c) => c.check === 'MEANING' || c.check === 'EVALUATOR' || c.check === 'BOTH'))
  has('first_attempt_feedback', Boolean(m.first_attempt_feedback))
  has('scaffold', (m.scaffolding_policy?.hints || []).length > 0)
  has('retry_variation', Boolean(m.retry_variation))
  has('transfer', Boolean(m.transfer) && m.transfer.setting !== m.scenario_context?.setting)
  has('accessibility_note', Boolean(m.accessibility_note))
  has('confounds', Array.isArray(m.confounds) && m.confounds.length > 0)
  has('review_record', Boolean(m.review_record) && m.review_record.approval === 'NOT_APPROVED')
  return gaps
}

export function parseMission(content) {
  const r = MissionContentSchema.safeParse(content)
  if (!r.success) {
    const err = new Error(`Invalid mission: ${r.error.issues.map((i) => i.message).join('; ')}`)
    err.code = 'INVALID_MISSION'
    throw err
  }
  return r.data
}
