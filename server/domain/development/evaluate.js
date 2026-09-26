// Mission evaluation pipeline (spec §16.3; C8.05). Candidate action → schema
// validation → deterministic checks → structured evaluator → evidence
// extraction (verbatim quotes only) → rubric comparison → uncertainty check →
// practice feedback. Output is PRACTICE feedback only: no level, score or
// formal evidence is ever produced here, and a criterion is OBSERVED only when
// the check that owns it actually saw it:
//   DETERMINISTIC  all of its rules passed
//   EVALUATOR      the evaluator observed it with confidence ≥ threshold AND
//                  quoted the learner's own words verbatim
//   BOTH           both of the above; disagreement is UNCERTAIN, not a claim
import { runDeterministicChecks, candidateTextFor, VALIDATORS_VERSION } from './validators.js'
import { MISSION_SCHEMA_VERSION } from './missionSchema.js'

export const PIPELINE_VERSION = 'mission-pipeline.v1'
export const CONFIDENCE_THRESHOLD = 0.7
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()

// A quote grounds a decision only if it is a real phrase (≥ 3 words and
// ≥ 12 characters) found verbatim in the learner's own text.
export const MIN_QUOTE_WORDS = 3
export const MIN_QUOTE_CHARS = 12
function quoteVerified(quote, texts) {
  const q = norm(quote)
  if (q.length < MIN_QUOTE_CHARS || q.split(' ').length < MIN_QUOTE_WORDS) return false
  return texts.some((t) => norm(t).includes(q))
}

export async function evaluateMissionWork({ mission, work, evaluator, candidateName = null }) {
  const det = runDeterministicChecks(mission, work)
  const needEvaluator = mission.rubric.criteria.filter((c) => c.check === 'EVALUATOR' || (c.check === 'BOTH' && det.get(c.criterion_id).observed))
  const texts = new Map(mission.rubric.criteria.map((c) => [c.criterion_id, candidateTextFor(mission, work, c.artifact_ids)]))
  const allTexts = [...new Set([...texts.values()].flat())]
  const ev = needEvaluator.length && evaluator
    ? await evaluator.evaluate({ mission, criteria: needEvaluator, workTexts: allTexts, candidateName })
    : { available: needEvaluator.length === 0, results: [], reason: needEvaluator.length ? 'EVALUATOR_NOT_CONFIGURED' : null }
  // Only answers for criteria we asked about count; anything else is ignored.
  const asked = new Set(needEvaluator.map((c) => c.criterion_id))
  const answers = new Map()
  for (const r of ev.results || []) if (asked.has(r.criterionId) && !answers.has(r.criterionId)) answers.set(r.criterionId, r)

  const criteria = mission.rubric.criteria.map((c) => {
    const d = det.get(c.criterion_id)
    const base = { criterionId: c.criterion_id, behaviorId: c.behavior_id, description: c.description, check: c.check, rules: d.rules, quote: null }
    if (c.check === 'DETERMINISTIC') return { ...base, result: d.observed ? 'OBSERVED' : 'NOT_OBSERVED', reason: d.observed ? 'RULES_PASSED' : 'RULES_NOT_MET' }
    if (c.check === 'BOTH' && !d.observed) return { ...base, result: 'NOT_OBSERVED', reason: 'RULES_NOT_MET' }
    if (!ev.available) return { ...base, result: 'UNCERTAIN', reason: 'EVALUATION_UNAVAILABLE' }
    const a = answers.get(c.criterion_id)
    if (!a) return { ...base, result: 'UNCERTAIN', reason: 'NO_EVALUATOR_DECISION' }
    if (a.confidence < CONFIDENCE_THRESHOLD) return { ...base, result: 'UNCERTAIN', reason: 'LOW_CONFIDENCE' }
    if (!a.observed) {
      // BOTH: rules passed but the evaluator disagrees → uncertain, never a verdict.
      return c.check === 'BOTH' ? { ...base, result: 'UNCERTAIN', reason: 'CHECKS_DISAGREE' } : { ...base, result: 'NOT_OBSERVED', reason: 'EVALUATOR_NOT_OBSERVED' }
    }
    if (!quoteVerified(a.quote, texts.get(c.criterion_id))) return { ...base, result: 'UNCERTAIN', reason: 'QUOTE_NOT_VERIFIED' }
    return { ...base, result: 'OBSERVED', reason: c.check === 'BOTH' ? 'RULES_AND_EVALUATOR_AGREE' : 'EVALUATOR_OBSERVED', quote: a.quote.trim() }
  })

  const behaviors = mission.target_behavior_ids.map((b) => {
    const cs = criteria.filter((c) => c.behaviorId === b)
    const result = cs.some((c) => c.result === 'UNCERTAIN') ? 'UNCERTAIN' : cs.every((c) => c.result === 'OBSERVED') ? 'DEMONSTRATED' : 'NOT_YET'
    return { behaviorId: b, result }
  })
  const demonstrated = behaviors.filter((b) => b.result === 'DEMONSTRATED').length
  const uncertain = behaviors.filter((b) => b.result === 'UNCERTAIN').length
  const status = ev.available ? 'EVALUATED' : 'EVALUATION_UNAVAILABLE'
  const verified = status === 'EVALUATED' && uncertain === 0
  const total = behaviors.length
  const noun = (n) => (n === 1 ? 'behaviour' : 'behaviours')
  const summary = verified
    ? `Mission completed — ${demonstrated} of ${total} target ${noun(total)} demonstrated.`
    : `${demonstrated} of ${total} target ${noun(total)} demonstrated so far; ${uncertain} could not be checked reliably this time.`

  return {
    status,
    verified,
    summary,
    criteria,
    behaviors,
    counts: { demonstrated, uncertain, total },
    evaluator: { used: needEvaluator.length > 0, available: ev.available, reason: ev.available ? null : ev.reason, promptVersion: evaluator?.promptVersion || null, model: ev.model || null },
    versions: { pipeline: PIPELINE_VERSION, validators: VALIDATORS_VERSION, schema: MISSION_SCHEMA_VERSION, confidenceThreshold: CONFIDENCE_THRESHOLD },
  }
}

// Practice evidence rows: one per OBSERVED criterion, nothing else.
export function practiceUnitsFrom({ evaluation, mission, attempt }) {
  return evaluation.criteria.filter((c) => c.result === 'OBSERVED').map((c) => ({
    attemptId: attempt.id,
    userId: attempt.userId,
    organizationId: attempt.organizationId || null,
    missionId: mission.mission_id,
    missionVersion: mission.version,
    capabilityId: mission.target_capability_id,
    behaviorId: c.behaviorId,
    criterionId: c.criterionId,
    sourceType: 'MISSION_PRACTICE',
    checkType: c.check,
    excerpt: c.quote,
    provenance: { ...evaluation.versions, reason: c.reason, evaluatorPrompt: c.check === 'DETERMINISTIC' ? null : evaluation.evaluator.promptVersion, model: c.check === 'DETERMINISTIC' ? null : evaluation.evaluator.model },
  }))
}
