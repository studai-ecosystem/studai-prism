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
import { meaningWorkTooShort } from './evaluator.js'
import { copiedFrom, buildFocus, FEEDBACK_VERSION } from './feedback.js'

export const PIPELINE_VERSION = 'mission-pipeline.v3'
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

// `exposed`: sentences the learner was shown before submitting (scaffold
// hints and examples, from this and earlier attempts of the mission). A
// criterion whose text reproduces one of them is COPIED_ASSISTANCE: shown
// honestly, never praised, never counted as the learner's own behaviour.
export async function evaluateMissionWork({ mission, work, evaluator, candidateName = null, exposed = [] }) {
  const det = runDeterministicChecks(mission, work)
  const needEvaluator = mission.rubric.criteria.filter((c) => c.check === 'EVALUATOR' || (c.check === 'BOTH' && det.get(c.criterion_id).observed))
  const needMeaning = mission.rubric.criteria.filter((c) => c.check === 'MEANING')
  const texts = new Map(mission.rubric.criteria.map((c) => [c.criterion_id, candidateTextFor(mission, work, c.artifact_ids)]))
  const allTexts = [...new Set([...texts.values()].flat())]
  const ev = needEvaluator.length && evaluator
    ? await evaluator.evaluate({ mission, criteria: needEvaluator, workTexts: allTexts, candidateName })
    : { available: needEvaluator.length === 0, results: [], reason: needEvaluator.length ? 'EVALUATOR_NOT_CONFIGURED' : null }
  // P6.4 — meaning (paraphrase) checks. Short work is decided locally as
  // "not met, EMPTY_WORK" even when no evaluator is configured.
  const meaningTexts = [...new Set(needMeaning.flatMap((c) => texts.get(c.criterion_id)))]
  const mv = !needMeaning.length ? { available: true, results: [] }
    : meaningWorkTooShort(meaningTexts) ? { available: true, results: needMeaning.map((c) => ({ criterionId: c.criterion_id, met: false, quote: '', reason: 'EMPTY_WORK' })) }
      : evaluator && typeof evaluator.evaluateMeaning === 'function'
        ? await evaluator.evaluateMeaning({ mission, criteria: needMeaning, workTexts: meaningTexts, candidateName })
        : { available: false, results: [], reason: 'EVALUATOR_NOT_CONFIGURED' }
  // Only answers for criteria we asked about count; anything else is ignored.
  const asked = new Set(needEvaluator.map((c) => c.criterion_id))
  const answers = new Map()
  for (const r of ev.results || []) if (asked.has(r.criterionId) && !answers.has(r.criterionId)) answers.set(r.criterionId, r)
  const askedMeaning = new Set(needMeaning.map((c) => c.criterion_id))
  const meanings = new Map()
  for (const r of mv.results || []) if (askedMeaning.has(r.criterionId) && !meanings.has(r.criterionId)) meanings.set(r.criterionId, r)

  const criteria = mission.rubric.criteria.map((c) => {
    const d = det.get(c.criterion_id)
    const base = { criterionId: c.criterion_id, behaviorId: c.behavior_id, description: c.description, check: c.check, rules: d.rules, quote: null }
    const decided = (() => {
      if (c.check === 'DETERMINISTIC') return { ...base, result: d.observed ? 'OBSERVED' : 'NOT_OBSERVED', reason: d.observed ? 'RULES_PASSED' : 'RULES_NOT_MET' }
      if (c.check === 'MEANING') {
        if (!mv.available) return { ...base, result: 'UNCERTAIN', reason: 'EVALUATION_UNAVAILABLE' }
        const m = meanings.get(c.criterion_id)
        if (!m) return { ...base, result: 'UNCERTAIN', reason: 'NO_EVALUATOR_DECISION' }
        if (!m.met) return { ...base, result: 'NOT_OBSERVED', reason: m.reason === 'EMPTY_WORK' ? 'EMPTY_WORK' : `MEANING_${m.reason}` }
        if (!quoteVerified(m.quote, texts.get(c.criterion_id))) return { ...base, result: 'UNCERTAIN', reason: 'QUOTE_NOT_VERIFIED' }
        return { ...base, result: 'OBSERVED', reason: 'MEANING_EXPRESSED', quote: m.quote.trim() }
      }
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
    })()
    if (decided.result === 'UNCERTAIN' || !exposed.length) return decided
    const copied = copiedFrom(texts.get(c.criterion_id), exposed)
    return copied ? { ...decided, result: 'COPIED_ASSISTANCE', reason: 'COPIED_ASSISTANCE', quote: null, copiedFrom: { source: copied.source, id: copied.id } } : decided
  })

  const behaviors = mission.target_behavior_ids.map((b) => {
    const cs = criteria.filter((c) => c.behaviorId === b)
    const result = cs.some((c) => c.result === 'UNCERTAIN') ? 'UNCERTAIN' : cs.every((c) => c.result === 'OBSERVED') ? 'DEMONSTRATED' : 'NOT_YET'
    return { behaviorId: b, result }
  })
  const demonstrated = behaviors.filter((b) => b.result === 'DEMONSTRATED').length
  const uncertain = behaviors.filter((b) => b.result === 'UNCERTAIN').length
  const copied = criteria.filter((c) => c.result === 'COPIED_ASSISTANCE').length
  const status = ev.available && mv.available ? 'EVALUATED' : 'EVALUATION_UNAVAILABLE'
  const verified = status === 'EVALUATED' && uncertain === 0
  const total = behaviors.length
  const noun = (n) => (n === 1 ? 'behaviour' : 'behaviours')
  const copiedNote = copied ? ` ${copied} ${copied === 1 ? 'check matches' : 'checks match'} an example or hint you were shown and ${copied === 1 ? 'is' : 'are'} not counted as your own.` : ''
  const summary = (verified
    ? (demonstrated === 0
      ? `Attempt reviewed — none of the ${total} target ${noun(total)} shown yet.`
      : `Mission completed — ${demonstrated} of ${total} target ${noun(total)} demonstrated.`)
    : `${demonstrated} of ${total} target ${noun(total)} demonstrated so far; ${uncertain} could not be checked reliably this time.`) + copiedNote
  const focus = buildFocus({ mission, criteria, status, learnerTextFor: (c) => candidateTextFor(mission, work, mission.rubric.criteria.find((x) => x.criterion_id === c.criterionId)?.artifact_ids || []) })

  return {
    status,
    verified,
    summary,
    focus,
    criteria,
    behaviors,
    counts: { demonstrated, uncertain, total, copied },
    evaluator: {
      used: needEvaluator.length > 0 || needMeaning.length > 0, available: ev.available && mv.available,
      reason: ev.available ? (mv.available ? null : mv.reason) : ev.reason,
      promptVersion: evaluator?.promptVersion || null, meaningPromptVersion: needMeaning.length ? (evaluator?.meaningPromptVersion || null) : null, model: ev.model || mv.model || null,
    },
    versions: { pipeline: PIPELINE_VERSION, validators: VALIDATORS_VERSION, schema: MISSION_SCHEMA_VERSION, feedback: FEEDBACK_VERSION, confidenceThreshold: CONFIDENCE_THRESHOLD },
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
    provenance: { ...evaluation.versions, reason: c.reason, evaluatorPrompt: c.check === 'DETERMINISTIC' ? null : c.check === 'MEANING' ? (evaluation.evaluator.meaningPromptVersion || null) : evaluation.evaluator.promptVersion, model: c.check === 'DETERMINISTIC' ? null : evaluation.evaluator.model },
  }))
}
