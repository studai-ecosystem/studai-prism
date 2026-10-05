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
import { normaliseWork, runDeterministicChecks, candidateEntriesFor, VALIDATORS_VERSION } from './validators.js'
import { MISSION_SCHEMA_VERSION } from './missionSchema.js'
import { meaningWorkEmpty } from './evaluator.js'
import { copiedFrom, buildFocus, FEEDBACK_VERSION } from './feedback.js'

export const PIPELINE_VERSION = 'mission-pipeline.v6'
export const CONFIDENCE_THRESHOLD = 0.7
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase()

// Concise whole-cell evidence needs no style floor. Short fragments of a
// longer cell still cannot establish what the evaluator claims.
export const MIN_QUOTE_WORDS = 3
export const MIN_QUOTE_CHARS = 12
function quoteSource(quote, entries) {
  const q = norm(quote)
  if (!q) return null
  const entry = entries.find((e) => norm(e.value) === q || q.length >= MIN_QUOTE_CHARS && q.split(' ').length >= MIN_QUOTE_WORDS && norm(e.value).includes(q))
  return entry ? { artifactId: entry.artifact_id, path: entry.path, rowId: entry.row_id || null, coverage: norm(entry.value) === q ? 'WHOLE_VALUE' : 'EXCERPT' } : null
}

// `exposed`: sentences the learner was shown before submitting (scaffold
// hints and examples, from this and earlier attempts of the mission). A
// criterion whose text reproduces one of them is COPIED_ASSISTANCE: shown
// honestly, never praised, never counted as the learner's own behaviour.
export async function evaluateMissionWork({ mission, work, evaluator, candidateName = null, exposed = [] }) {
  work = normaliseWork(mission, work)
  const det = runDeterministicChecks(mission, work)
  const needEvaluator = mission.rubric.criteria.filter((c) => c.check === 'EVALUATOR' || (c.check === 'BOTH' && det.get(c.criterion_id).observed))
  const entries = new Map(mission.rubric.criteria.map((c) => [c.criterion_id, candidateEntriesFor(mission, work, c.artifact_ids, c.work_paths).filter((e) => e.kind === 'text' && e.value.trim())]))
  const texts = new Map([...entries].map(([id, cells]) => [id, cells.map((e) => e.value)]))
  const needMeaning = mission.rubric.criteria.filter((c) => c.check === 'MEANING' && !meaningWorkEmpty(texts.get(c.criterion_id)))
  const ev = needEvaluator.length && evaluator
    ? await evaluator.evaluate({ mission, criteria: needEvaluator, work, candidateName })
    : { available: needEvaluator.length === 0, results: [], reason: needEvaluator.length ? 'EVALUATOR_NOT_CONFIGURED' : null }
  // Nonempty work is judged contextually, regardless of character count.
  const mv = !needMeaning.length ? { available: true, results: [] }
    : evaluator && typeof evaluator.evaluateMeaning === 'function'
      ? await evaluator.evaluateMeaning({ mission, criteria: needMeaning, work, candidateName })
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
        if (meaningWorkEmpty(texts.get(c.criterion_id))) return { ...base, result: 'NOT_OBSERVED', reason: 'EMPTY_WORK' }
        if (!mv.available) return { ...base, result: 'UNCERTAIN', reason: 'EVALUATION_UNAVAILABLE' }
        const m = meanings.get(c.criterion_id)
        if (!m) return { ...base, result: 'UNCERTAIN', reason: 'NO_EVALUATOR_DECISION' }
        if (m.met && m.reason !== 'EXPRESSED') return { ...base, result: 'UNCERTAIN', reason: 'INVALID_EVALUATOR_DECISION' }
        if (m.reason === 'NOT_JUDGEABLE') return { ...base, result: 'NOT_JUDGEABLE', reason: 'MEANING_NOT_JUDGEABLE' }
        if (!m.met) return { ...base, result: 'NOT_OBSERVED', reason: m.reason === 'EMPTY_WORK' ? 'EMPTY_WORK' : `MEANING_${m.reason}` }
        const source = quoteSource(m.quote, entries.get(c.criterion_id))
        if (!source) return { ...base, result: 'UNCERTAIN', reason: 'QUOTE_NOT_VERIFIED' }
        return { ...base, result: 'OBSERVED', reason: 'MEANING_EXPRESSED', quote: m.quote.trim(), quoteSource: source }
      }
      if (c.check === 'BOTH' && !d.observed) return { ...base, result: 'NOT_OBSERVED', reason: 'RULES_NOT_MET' }
      if (!ev.available) return { ...base, result: 'UNCERTAIN', reason: 'EVALUATION_UNAVAILABLE' }
      const a = answers.get(c.criterion_id)
      if (!a) return { ...base, result: 'UNCERTAIN', reason: 'NO_EVALUATOR_DECISION' }
      if (a.reason === 'NOT_JUDGEABLE' && !a.observed) return { ...base, result: 'NOT_JUDGEABLE', reason: 'EVALUATOR_NOT_JUDGEABLE' }
      if (a.confidence < CONFIDENCE_THRESHOLD) return { ...base, result: 'UNCERTAIN', reason: 'LOW_CONFIDENCE' }
      if (!a.observed) {
        // BOTH: rules passed but the evaluator disagrees → uncertain, never a verdict.
        return c.check === 'BOTH' ? { ...base, result: 'UNCERTAIN', reason: 'CHECKS_DISAGREE' } : { ...base, result: 'NOT_OBSERVED', reason: 'EVALUATOR_NOT_OBSERVED' }
      }
      const source = quoteSource(a.quote, entries.get(c.criterion_id))
      if (!source) return { ...base, result: 'UNCERTAIN', reason: 'QUOTE_NOT_VERIFIED' }
      return { ...base, result: 'OBSERVED', reason: c.check === 'BOTH' ? 'RULES_AND_EVALUATOR_AGREE' : 'EVALUATOR_OBSERVED', quote: a.quote.trim(), quoteSource: source }
    })()
    if (decided.result === 'UNCERTAIN' || decided.result === 'NOT_JUDGEABLE' || !exposed.length) return decided
    const copied = copiedFrom(texts.get(c.criterion_id), exposed)
    return copied ? { ...decided, result: 'COPIED_ASSISTANCE', reason: 'COPIED_ASSISTANCE', quote: null, quoteSource: null, copiedFrom: { source: copied.source, id: copied.id } } : decided
  })

  const behaviors = mission.target_behavior_ids.map((b) => {
    const cs = criteria.filter((c) => c.behaviorId === b)
    const result = cs.some((c) => c.result === 'UNCERTAIN') ? 'UNCERTAIN' : cs.some((c) => c.result === 'NOT_JUDGEABLE') ? 'NOT_JUDGEABLE' : cs.every((c) => c.result === 'OBSERVED') ? 'DEMONSTRATED' : 'NOT_YET'
    return { behaviorId: b, result }
  })
  const demonstrated = behaviors.filter((b) => b.result === 'DEMONSTRATED').length
  const uncertain = behaviors.filter((b) => b.result === 'UNCERTAIN').length
  const notJudgeable = behaviors.filter((b) => b.result === 'NOT_JUDGEABLE').length
  const copied = criteria.filter((c) => c.result === 'COPIED_ASSISTANCE').length
  const status = ev.available && mv.available ? 'EVALUATED' : 'EVALUATION_UNAVAILABLE'
  const verified = status === 'EVALUATED' && uncertain === 0 && notJudgeable === 0
  const total = behaviors.length
  const noun = (n) => (n === 1 ? 'behaviour' : 'behaviours')
  const copiedNote = copied ? ` ${copied} ${copied === 1 ? 'check matches' : 'checks match'} an example or hint you were shown and ${copied === 1 ? 'is' : 'are'} not counted as your own.` : ''
  const summary = (verified
    ? (demonstrated === 0
      ? `Attempt reviewed — none of the ${total} target ${noun(total)} shown yet.`
      : demonstrated === total
        ? `Mission completed — ${demonstrated} of ${total} target ${noun(total)} demonstrated.`
        : `Attempt reviewed — ${demonstrated} of ${total} target ${noun(total)} demonstrated.`)
    : `${demonstrated} of ${total} target ${noun(total)} demonstrated so far.${uncertain ? ` ${uncertain} could not be checked reliably this time.` : ''}${notJudgeable ? ` ${notJudgeable} could not be judged from this work and context, and are not counted either way.` : ''}`) + copiedNote
  const focus = buildFocus({ mission, criteria, status, learnerTextFor: (c) => texts.get(c.criterionId) })
  const counterpart = counterpartReply({ mission, criteria, status })

  return {
    status,
    verified,
    summary,
    focus,
    counterpart,
    criteria,
    behaviors,
    counts: { demonstrated, uncertain, notJudgeable, total, copied },
    evaluator: {
      used: needEvaluator.length > 0 || needMeaning.length > 0, available: ev.available && mv.available,
      reason: ev.available ? (mv.available ? null : mv.reason) : ev.reason,
      promptVersion: evaluator?.promptVersion || null, meaningPromptVersion: needMeaning.length ? (evaluator?.meaningPromptVersion || null) : null, model: ev.model || mv.model || null,
    },
    versions: { pipeline: PIPELINE_VERSION, validators: VALIDATORS_VERSION, schema: MISSION_SCHEMA_VERSION, feedback: FEEDBACK_VERSION, confidenceThreshold: CONFIDENCE_THRESHOLD },
  }
}

// P6.8 counterpart reply. The person the learner wrote to (Mina, Priya…)
// answers in character, one line per criterion the evaluation could decide,
// chosen by what the learner's message actually did (OBSERVED) or did not do
// (NOT_OBSERVED). Copied text and uncertain checks get no line, so the reply
// never praises borrowed words and never guesses; an incomplete review gets
// no reply at all. Lines follow the mission's own criterion order.
export const COUNTERPART_NOTE = 'This reply is written from what your message did and did not do in this attempt. It is practice, not a judgement of you.'
export function counterpartReply({ mission, criteria, status }) {
  const cp = mission.counterpart
  if (!cp || status !== 'EVALUATED') return null
  const byId = new Map(criteria.map((c) => [c.criterionId, c]))
  const lines = []
  for (const def of mission.rubric.criteria) {
    const c = byId.get(def.criterion_id)
    if (!c || (c.result !== 'OBSERVED' && c.result !== 'NOT_OBSERVED')) continue
    const r = cp.reactions.find((x) => x.criterion_id === c.criterionId && x.when === c.result)
    if (r) lines.push({ criterionId: c.criterionId, when: c.result, text: r.text })
  }
  const decided = criteria.filter((c) => c.result === 'OBSERVED' || c.result === 'NOT_OBSERVED')
  const closing = decided.length && decided.every((c) => c.result === 'OBSERVED') && decided.length === criteria.length ? cp.all_met
    : decided.length && decided.every((c) => c.result === 'NOT_OBSERVED') && decided.length === criteria.length ? cp.none_met : null
  return { name: cp.name, role: cp.role, lines, closing, note: COUNTERPART_NOTE }
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
    provenance: { ...evaluation.versions, reason: c.reason, ...(c.quoteSource ? { quoteSource: c.quoteSource } : {}), evaluatorPrompt: c.check === 'DETERMINISTIC' ? null : c.check === 'MEANING' ? (evaluation.evaluator.meaningPromptVersion || null) : evaluation.evaluator.promptVersion, model: c.check === 'DETERMINISTIC' ? null : evaluation.evaluator.model },
  }))
}
