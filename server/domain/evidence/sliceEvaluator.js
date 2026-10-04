// P2.3–P2.5 — the bounded evidence evaluator for the vertical slice. It reads
// ONLY accepted, applied CANDIDATE actions (never system text, seeded board
// rows or AI participant turns), asks the gateway for structured output per
// pinned opportunity, validates every field against the pinned snapshot and
// the actual actions, and writes strict units through the existing evidence
// boundary (lib/evidenceGraph.js → domain/evidence/evidenceUnit.js).
//
//   valid unit with a level      → PROVISIONAL (single judge, no agreement)
//   abstention                   → INSUFFICIENT_EVIDENCE with the reason
//   quote mismatch / bad ids     → HUMAN_REVIEW_REQUIRED, no excerpt, no level
//   ambiguity / contrary markers → ONE bounded second sample (N=2 total); two
//                                  samples ≥ 2 anchor levels apart, or one
//                                  rated and one not → HUMAN_REVIEW_REQUIRED
//                                  (JUDGE_DISAGREEMENT), never an average (T33)
//   malformed / missing output   → throws (the job records TECHNICAL_FAILURE)
import { renderPrompt } from '../../engine/prompts.js'
import { sanitizeCandidateText } from '../../lib/promptSecurity.js'
import { capabilityInfo } from '../assessments/catalog.js'

export const EVALUATOR_PROMPT = 'evidence_evaluator.v2'
export const SLICE_EVALUATOR_VERSION = 'slice-evaluator.v2'
const ELIGIBLE_KINDS = new Set(['MESSAGE', 'ARTIFACT'])
const ABSTAIN_REASONS = new Set(['NOT_ADDRESSED', 'TOO_SPARSE', 'NOT_JUDGEABLE'])
const MAX_EXCERPT = 600
// T33 bounds: a marker counts once it carries real content; at most one
// extra sample per (opportunity, behaviour); levels this far apart disagree.
export const AMBIGUITY_MARKER_MIN_CHARS = 12
export const MAX_JUDGE_SAMPLES = 2
export const DISAGREEMENT_LEVELS = 2
export const JUDGE_DISAGREEMENT = 'JUDGE_DISAGREEMENT'

export function hasAmbiguityMarker(decision) {
  return [decision?.contraryEvidence, decision?.ambiguity].some((m) => typeof m === 'string' && m.trim().length >= AMBIGUITY_MARKER_MIN_CHARS)
}

// Combine two samples of the same action. Pure. Never averages.
export function reconcileSamples(first, second) {
  const samples = [first, second].map((d) => ({ outcome: d.outcome, level: d.level, reason: d.reason, ambiguityFlagged: hasAmbiguityMarker(d) }))
  const bothRated = first.outcome === 'RATED' && second.outcome === 'RATED'
  const disagree = bothRated ? Math.abs(first.level - second.level) >= DISAGREEMENT_LEVELS : (first.outcome === 'RATED') !== (second.outcome === 'RATED')
  if (disagree) {
    // Keep the verified excerpt (the learner's own words) so a human can rate it.
    const quoted = first.outcome === 'RATED' ? first : second
    return { ...first, outcome: 'REVIEW', reason: JUDGE_DISAGREEMENT, level: null, action: quoted.action, excerpt: quoted.excerpt || null, judgeSamples: samples }
  }
  return { ...first, judgeSamples: samples }
}

class EvaluatorOutputError extends Error {
  constructor(message) { super(message); this.name = 'EvaluatorOutputError'; this.code = 'EVALUATOR_OUTPUT_INVALID' }
}

// Candidate-authored text of an action. For a board patch only the values
// the candidate changed count (prefilled rows are never candidate text).
function flattenValues(value, out = []) {
  if (value == null) return out
  if (typeof value === 'string') { if (value.trim()) out.push(value); return out }
  if (typeof value === 'number' || typeof value === 'boolean') { out.push(String(value)); return out }
  if (Array.isArray(value)) { for (const v of value) flattenValues(v, out); return out }
  if (typeof value === 'object') { for (const v of Object.values(value)) flattenValues(v, out); return out }
  return out
}
export function candidateTexts(action) {
  if (action.kind === 'MESSAGE') return typeof action.payload?.text === 'string' ? [action.payload.text] : []
  if (action.kind === 'ARTIFACT') {
    const values = flattenValues(action.payload?.updates)
    if (typeof action.payload?.notes === 'string' && action.payload.notes.trim()) values.push(action.payload.notes)
    return values
  }
  return []
}

// Only the candidate's own accepted-and-applied actions are ever evaluated.
export function eligibleActions(actions = []) {
  return actions
    .filter((a) => a && a.actorKind === 'CANDIDATE' && ELIGIBLE_KINDS.has(a.kind) && a.state === 'APPLIED' && candidateTexts(a).length > 0)
    .sort((a, b) => a.sequence - b.sequence)
}

export function buildEvaluatorMessages({ snapshot, opportunity, actions }) {
  const anchors = snapshot.form?.rubric?.anchorsByBehaviour?.[opportunity.behaviourId]
    || capabilityInfo(opportunity.capabilityId)?.anchors
  if (!anchors) throw new EvaluatorOutputError(`Pinned anchors are unavailable for ${opportunity.behaviourId}`)
  const prompt = renderPrompt(EVALUATOR_PROMPT, {
    OPPORTUNITY_JSON: JSON.stringify({ id: opportunity.id, capabilityId: opportunity.capabilityId, behaviourId: opportunity.behaviourId, description: opportunity.description || '' }),
    ANCHORS_JSON: JSON.stringify(anchors),
    ACTIONS_JSON: JSON.stringify(actions.map((a) => ({
      actionId: a.actionId, kind: a.kind, sequence: a.sequence,
      ...(a.kind === 'ARTIFACT' ? { artifactId: a.payload?.artifactId || null } : {}),
      text: candidateTexts(a).map((t) => sanitizeCandidateText(t, 4000)).join('\n'),
      context: a.result?.evaluationContext || null,
    }))),
  })
  return [
    { role: 'system', content: prompt },
    { role: 'user', content: `Return the JSON object for opportunity ${opportunity.id}.` },
  ]
}

function parseUnits(content) {
  let data = content
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { throw new EvaluatorOutputError('Evaluator output is not JSON') }
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.units)) throw new EvaluatorOutputError('Evaluator output has no units array')
  return data.units
}

const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '')

// Decide what one evaluator unit becomes. Pure.
export function classifyUnit(raw, { opportunity, actions }) {
  const byId = new Map(actions.map((a) => [a.actionId, a]))
  const base = {
    opportunityId: opportunity.id, capabilityId: opportunity.capabilityId, behaviourId: opportunity.behaviourId,
    observedBehavior: str(raw?.observedBehavior), contraryEvidence: str(raw?.contraryEvidence), ambiguity: str(raw?.ambiguity),
  }
  if (!raw || typeof raw !== 'object') return { ...base, outcome: 'REVIEW', reason: 'MALFORMED_UNIT', action: null, excerpt: null, level: null }
  if (raw.opportunityId !== opportunity.id || raw.capabilityId !== opportunity.capabilityId || raw.behaviourId !== opportunity.behaviourId) {
    return { ...base, outcome: 'REVIEW', reason: 'ID_MISMATCH', action: null, excerpt: null, level: null }
  }
  const abstain = str(raw.abstainReason, 64)
  if (abstain) {
    return { ...base, outcome: 'ABSTAIN', reason: ABSTAIN_REASONS.has(abstain) ? abstain : 'NOT_JUDGEABLE', action: byId.get(raw.sourceActionId) || null, excerpt: null, level: null }
  }
  const action = byId.get(raw.sourceActionId) || null
  if (!action) return { ...base, outcome: 'REVIEW', reason: 'UNKNOWN_SOURCE_ACTION', action: null, excerpt: null, level: null }
  const excerpt = typeof raw.excerpt === 'string' ? raw.excerpt : ''
  const quoted = excerpt.trim().length > 0 && excerpt.length <= MAX_EXCERPT && candidateTexts(action).some((t) => t.includes(excerpt))
  if (!quoted) return { ...base, outcome: 'REVIEW', reason: 'QUOTE_MISMATCH', action, excerpt: null, level: null }
  const level = Number.isInteger(raw.anchorLevel) && raw.anchorLevel >= 1 && raw.anchorLevel <= 5 ? raw.anchorLevel : null
  if (level === null) return { ...base, outcome: 'REVIEW', reason: 'LEVEL_INVALID', action, excerpt: null, level: null }
  return { ...base, outcome: 'RATED', reason: null, action, excerpt, level }
}

function toEvidenceInput(decision, { sessionId, formId, pin, attempt, provenanceBase }) {
  const action = decision.action
  const sourceType = action ? (action.kind === 'ARTIFACT' ? 'WORK_ARTIFACT' : 'DIALOGUE_TURN') : null
  const provenance = {
    ...provenanceBase,
    actionId: action?.actionId || null,
    evaluatorAttempt: attempt,
    rubricRef: pin.rubricRef,
    rubric_version: pin.rubricRef,
    methodVersion: pin.methodVersion,
    snapshotHash: pin.snapshotHash,
    opportunityId: decision.opportunityId,
    opportunityGroup: decision.opportunityGroup || null,
    behaviourId: decision.behaviourId,
    ...(decision.behaviourIds ? { targetedBehaviourIds: decision.behaviourIds } : {}),
    outcome: decision.outcome,
    reason: decision.reason,
    contraryEvidence: decision.contraryEvidence || null,
    ambiguity: decision.ambiguity || null,
    ...(decision.judgeSamples ? { judgeSamples: decision.judgeSamples, judgeSampleCount: decision.judgeSamples.length } : {}),
    ...(action?.result?.evaluationContext ? { evaluationContext: action.result.evaluationContext } : {}),
  }
  const candidateAction = action ? {
    actionId: action.actionId,
    kind: action.kind,
    sequence: action.sequence,
    payloadHash: action.payloadHash,
    ...(action.kind === 'ARTIFACT' ? { artifactId: action.payload?.artifactId || null } : {}),
    ...(decision.excerpt ? { dialogue_excerpt: decision.excerpt } : {}),
  } : null
  return {
    session_id: sessionId,
    assessment_form_id: formId,
    capability_id: decision.capabilityId,
    capability_layer: 'LAYER_1',
    source_type: sourceType,
    source_turn: action ? action.sequence : null,
    source_artifact_id: action?.kind === 'ARTIFACT' ? action.payload?.artifactId || null : null,
    behavior_anchor_id: decision.outcome === 'RATED' ? `${pin.rubricRef}:${decision.behaviourId}:L${decision.level}` : null,
    candidate_action: candidateAction,
    observable_behavior: decision.outcome === 'RATED' ? decision.observedBehavior || null : null,
    rubric_level: decision.outcome === 'RATED' ? decision.level : null,
    rubric_label: decision.outcome === 'RATED' ? capabilityInfo(decision.capabilityId)?.anchors?.[decision.level]?.label || null : null,
    human_review_status: decision.outcome === 'REVIEW' ? 'REQUIRED' : 'NOT_REQUIRED',
    provenance,
  }
}

// T23: independent observations are distinct opportunity GROUPS, never unit
// or rating counts. Three ratings of one answer, or a board change plus its
// explanation in one group, count once.
export function independentOpportunityCount(units = []) {
  const groups = new Set()
  for (const u of units) {
    const p = u?.provenance_json || u?.provenance || {}
    if (!p.opportunityId) continue
    groups.add(p.opportunityGroup || p.opportunityId)
  }
  return groups.size
}

export function createSliceEvaluator({ complete, recordUnit, timeoutMs = 30_000 }) {
  if (typeof complete !== 'function') throw new Error('sliceEvaluator: complete() is required')
  if (typeof recordUnit !== 'function') throw new Error('sliceEvaluator: recordUnit() is required')

  async function ask(messages, sessionId) {
    const call = complete({ messages, temperature: 0, max_completion_tokens: 900, response_format: { type: 'json_object' } }, { task: 'evidence_evaluator', retries: 1, sessionId })
    const timeout = new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), timeoutMs).unref?.())
    const out = await Promise.race([call, timeout])
    return parseUnits(out?.choices?.[0]?.message?.content ?? out?.content ?? out)
  }
  // One sample: ask, require exactly one unit for the target, classify.
  async function sample(target, actions, snapshot, sessionId) {
    const units = await ask(buildEvaluatorMessages({ snapshot, opportunity: target, actions }), sessionId)
    const found = units.filter((u) => u && u.opportunityId === target.id)
    if (found.length !== 1) throw new EvaluatorOutputError(`Evaluator returned ${found.length} units for ${target.id}`)
    return classifyUnit(found[0], { opportunity: target, actions })
  }
  // T33: a rated unit carrying an ambiguity / contrary-evidence marker gets
  // exactly one more sample (MAX_JUDGE_SAMPLES); the two are reconciled by
  // policy, never averaged. Unflagged units stay single-judge PROVISIONAL.
  async function judge(target, actions, snapshot, sessionId) {
    const first = await sample(target, actions, snapshot, sessionId)
    if (first.outcome !== 'RATED' || !hasAmbiguityMarker(first) || MAX_JUDGE_SAMPLES < 2) return first
    const second = await sample(target, actions, snapshot, sessionId)
    return reconcileSamples(first, second)
  }

  return {
    promptVersion: EVALUATOR_PROMPT,
    evaluatorVersion: SLICE_EVALUATOR_VERSION,
    /**
     * Evaluate one run. Throws on provider / output failure so the caller's job
     * records a technical failure; never writes a partial "deficit".
     * @returns { units: stored units, attempt }
     */
    async evaluateRun({ sessionId, actions, snapshot, pin, formId = null, attempt = 1, opportunities = null }) {
      const eligible = eligibleActions(actions)
      const inputs = []
      const provenanceBase = { evaluatorPrompt: EVALUATOR_PROMPT, snapshotId: snapshot.id, snapshotVersion: snapshot.version }
      // P4.8 ledger-driven path: only opportunities the learner actually
      // answered are evaluated, only for the behaviours they target, and only
      // against the actions attached to them. Unpresented or unanswered
      // opportunities yield no unit at all (coverage, not failure).
      if (Array.isArray(opportunities)) {
        const defs = new Map((snapshot.opportunities || []).map((o) => [o.id, o]))
        for (const row of opportunities) {
          if (!['ACTION_RECEIVED', 'EVALUATION_PENDING'].includes(row.state)) continue
          const def = defs.get(row.opportunityId.replace(/:CLARIFY$/, ''))
          if (!def) continue
          const mine = eligible.filter((a) => (row.actionIds || []).includes(a.actionId))
          for (const action of mine) {
            const context = action.result?.evaluationContext
            if (!context || context.stimulus?.opportunityId !== row.opportunityId || !Array.isArray(context.situation?.applicableFacts)) {
              const err = new EvaluatorOutputError(`Required action context is unavailable for ${row.opportunityId}`)
              err.code = 'EVALUATION_CONTEXT_INCOMPLETE'
              throw err
            }
          }
          for (const behaviourId of def.behaviourIds || [def.behaviourId]) {
            const target = { id: row.opportunityId, group: def.groupId || def.group || null, capabilityId: def.capabilityId, behaviourId, description: def.description || '' }
            let decision
            if (mine.length === 0) {
              decision = { opportunityId: target.id, capabilityId: target.capabilityId, behaviourId, outcome: 'ABSTAIN', reason: 'NOT_ADDRESSED', action: null, excerpt: null, level: null }
            } else {
              decision = await judge(target, mine, snapshot, sessionId)
            }
            inputs.push(toEvidenceInput({ ...decision, opportunityGroup: target.group, behaviourIds: def.behaviourIds || [behaviourId] }, { sessionId, formId, pin, attempt, provenanceBase }))
          }
        }
        const stored = []
        for (const input of inputs) stored.push(await recordUnit(input))
        return { units: stored, attempt }
      }
      for (const opportunity of snapshot.opportunities || []) {
        let decision
        if (eligible.length === 0) {
          decision = { opportunityId: opportunity.id, capabilityId: opportunity.capabilityId, behaviourId: opportunity.behaviourId, outcome: 'ABSTAIN', reason: 'NOT_ADDRESSED', action: null, excerpt: null, level: null }
        } else {
          decision = await judge(opportunity, eligible, snapshot, sessionId)
        }
        inputs.push(toEvidenceInput({ ...decision, opportunityGroup: opportunity.group || null }, { sessionId, formId, pin, attempt, provenanceBase }))
      }
      // All evaluator calls succeeded: write the whole set.
      const stored = []
      for (const input of inputs) stored.push(await recordUnit(input))
      return { units: stored, attempt }
    },
  }
}
