// P4.6 — the deterministic Director. Pure: given the pinned form, world
// state, the opportunity ledger, accepted actions, coverage and the remaining
// approved budget, it selects the next ALLOWED event. It never writes
// evidence or levels, never adapts to inferred personality or demographics,
// and never produces a scoring hint. Tie-breaks are seeded and stable.
//
// Policy (in order):
//   1. a required, eligible, unserved opportunity;
//   2. one bounded authored clarification when the last answer is ambiguous;
//   3. a complementary allowed opportunity for a family under the coverage
//      floor — never a paraphrase of an already-served opportunity;
//   4. required state transitions ride on the first opportunity of a stage;
//   5. stop at the approved budget and report precise partial/review reasons.
import { createHash } from 'node:crypto'
import { renderStimulus } from './factBoundary.js'
import { stageIndex, worldStateFor } from './universalForm.js'

export const OPPORTUNITY_STATES = Object.freeze([
  'PLANNED', 'PRESENTED', 'ACTION_RECEIVED', 'EVALUATION_PENDING', 'EVALUATED',
  'DELIVERY_FAILED', 'NOT_ACCESSIBLE', 'SKIPPED_BY_POLICY', 'EXPIRED', 'REVIEW_REQUIRED',
])
// Served: the opportunity will not be presented again.
export const SERVED_STATES = new Set(['ACTION_RECEIVED', 'EVALUATION_PENDING', 'EVALUATED', 'NOT_ACCESSIBLE', 'SKIPPED_BY_POLICY', 'EXPIRED', 'REVIEW_REQUIRED'])
// Counts toward coverage only when the learner actually answered.
export const ANSWERED_STATES = new Set(['ACTION_RECEIVED', 'EVALUATION_PENDING', 'EVALUATED'])
export const CLARIFY_SUFFIX = ':CLARIFY'
export const isClarificationId = (id) => typeof id === 'string' && id.endsWith(CLARIFY_SUFFIX)
export const parentOpportunityId = (id) => (isClarificationId(id) ? id.slice(0, -CLARIFY_SUFFIX.length) : id)

const tieKey = (seed, id) => createHash('sha256').update(`${seed}\u0000${id}`).digest('hex')

// Coverage: per family, the distinct groups the learner has answered.
export function coverageFrom(form, ledger = []) {
  const byId = new Map(form.opportunities.map((o) => [o.id, o]))
  const out = {}
  for (const row of ledger) {
    const o = byId.get(parentOpportunityId(row.opportunityId))
    if (!o || !ANSWERED_STATES.has(row.state)) continue
    out[o.capabilityId] ||= new Set()
    out[o.capabilityId].add(o.groupId)
  }
  return Object.fromEntries(form.opportunities.map((o) => [o.capabilityId, out[o.capabilityId]?.size || 0]))
}

// World changes applied = those of every stage whose first opportunity has been presented.
export function appliedWorldChanges(form, ledger = []) {
  const presentedStages = new Set()
  const byId = new Map(form.opportunities.map((o) => [o.id, o]))
  for (const row of ledger) {
    const o = byId.get(parentOpportunityId(row.opportunityId))
    if (o && row.state !== 'PLANNED') presentedStages.add(o.stageId)
  }
  return form.stages.filter((s) => s.worldChangeId && presentedStages.has(s.id)).map((s) => s.worldChangeId)
}

function currentStageIndex(form, states) {
  const unservedRequired = form.opportunities.filter((o) => o.required && !SERVED_STATES.has(states.get(o.id) || 'PLANNED'))
  if (unservedRequired.length === 0) return form.stages.length - 1
  return Math.min(...unservedRequired.map((o) => stageIndex(form, o.stageId)))
}

function eligible(form, o, states, stageIdx) {
  const state = states.get(o.id) || 'PLANNED'
  if (state !== 'PLANNED' && state !== 'DELIVERY_FAILED') return false
  if (stageIndex(form, o.stageId) > stageIdx) return false
  return (o.dependsOn || []).every((d) => ANSWERED_STATES.has(states.get(d) || 'PLANNED'))
}

// Ambiguity is a bounded, declared rule: a very short free-text answer to an
// opportunity that authored a clarification. Never style, tone or persona.
function ambiguous(action) {
  if (!action || action.kind !== 'MESSAGE') return false
  const words = String(action.payload?.text || '').trim().split(/\s+/).filter(Boolean)
  return words.length > 0 && words.length < 4
}

/**
 * selectNext({ form, worldState?, presented (ledger rows), actions, coverage?, budget, seed })
 *  → { kind: 'PRESENT', opportunity, stimulus, worldChangeId, decision }
 *  | { kind: 'CLARIFY', opportunityId, parentId, stimulus, decision }
 *  | { kind: 'WAIT', opportunityId, decision }
 *  | { kind: 'STOP', reason, partial: [...], review: [...], decision }
 */
export function selectNext({ form, worldState = null, presented = [], actions = [], coverage = null, budget = {}, seed = 'seed' }) {
  const states = new Map(presented.map((r) => [r.opportunityId, r.state]))
  const maxPresented = Number.isInteger(budget.maxOpportunities) ? budget.maxOpportunities : form.director.maxPresentedOpportunities
  const presentedCount = presented.filter((r) => r.state !== 'PLANNED' && r.state !== 'SKIPPED_BY_POLICY' && r.state !== 'NOT_ACCESSIBLE').length
  const inputs = { formVersion: form.version, seed, presentedCount, maxPresented, remainingMs: budget.remainingMs ?? null }
  const decision = (policy, extra = {}) => ({ policy, ...inputs, ...extra })

  const awaiting = presented.find((r) => r.state === 'PRESENTED')
  if (awaiting) return { kind: 'WAIT', opportunityId: awaiting.opportunityId, decision: decision('WAIT_FOR_ACTION') }

  const review = presented.filter((r) => r.state === 'REVIEW_REQUIRED').map((r) => r.opportunityId)
  const partial = form.opportunities.filter((o) => o.required && !ANSWERED_STATES.has(states.get(o.id) || 'PLANNED')).map((o) => o.id)
  const outOfBudget = presentedCount >= maxPresented || (Number.isFinite(budget.remainingMs) && budget.remainingMs <= 0)
  if (outOfBudget) return { kind: 'STOP', reason: 'BUDGET_EXHAUSTED', partial, review, decision: decision('5_BUDGET') }

  const stageIdx = currentStageIndex(form, states)
  const applied = appliedWorldChanges(form, presented)
  const world = worldState || worldStateFor(form, { appliedWorldChangeIds: applied })
  const authoredIndex = (o) => form.opportunities.indexOf(o)
  // Required events follow the authored order inside a stage (the scenario's
  // narrative is a constraint, policy 4); only genuinely interchangeable
  // complementary events are tie-broken by the seed.
  const authored = (list) => [...list].sort((a, b) => stageIndex(form, a.stageId) - stageIndex(form, b.stageId) || authoredIndex(a) - authoredIndex(b))
  const seeded = (list) => [...list].sort((a, b) => stageIndex(form, a.stageId) - stageIndex(form, b.stageId) || tieKey(seed, a.id).localeCompare(tieKey(seed, b.id)))

  const present = (o, policy) => {
    const stageEntering = !presented.some((r) => r.state !== 'PLANNED' && form.opportunities.find((x) => x.id === parentOpportunityId(r.opportunityId))?.stageId === o.stageId)
    const stage = form.stages.find((s) => s.id === o.stageId)
    const worldChangeId = stageEntering && stage?.worldChangeId ? stage.worldChangeId : null
    const stateForRender = worldChangeId ? worldStateFor(form, { appliedWorldChangeIds: [...applied, worldChangeId], revealedFactIds: world.revealedFactIds }) : world
    const stimulus = renderStimulus({ form, opportunity: o, worldState: stateForRender })
    return { kind: 'PRESENT', opportunity: o, stimulus, worldChangeId, decision: decision(policy, { opportunityId: o.id, stageId: o.stageId, renderHash: stimulus.renderHash, renderStatus: stimulus.status }) }
  }

  // 1. required, eligible, unserved
  const required = authored(form.opportunities.filter((o) => o.required && eligible(form, o, states, stageIdx)))
  // 2. bounded clarification of the last answered opportunity (checked before
  //    moving on so the learner's interpretation is settled first).
  const lastAnswered = [...presented].filter((r) => ANSWERED_STATES.has(r.state) && !isClarificationId(r.opportunityId)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]
  if (lastAnswered) {
    const o = form.opportunities.find((x) => x.id === lastAnswered.opportunityId)
    const clarifyId = `${lastAnswered.opportunityId}${CLARIFY_SUFFIX}`
    const lastAction = actions.filter((a) => (lastAnswered.actionIds || []).includes(a.actionId)).sort((a, b) => b.sequence - a.sequence)[0]
    if (o?.clarification && !states.has(clarifyId) && ambiguous(lastAction) && (form.director.maxClarificationsPerOpportunity || 0) > 0) {
      const stimulus = renderStimulus({ form, opportunity: o, worldState: world, variant: { ...o.stimulus, template: o.clarification.template, factIds: [] } })
      return { kind: 'CLARIFY', opportunityId: clarifyId, parentId: o.id, opportunity: o, stimulus, decision: decision('2_CLARIFY', { opportunityId: clarifyId, renderHash: stimulus.renderHash }) }
    }
  }
  if (required.length) return present(required[0], '1_REQUIRED')

  // 3. complementary for incomplete coverage (no paraphrases)
  const cov = coverage || coverageFrom(form, presented)
  const servedIds = new Set(presented.filter((r) => SERVED_STATES.has(r.state)).map((r) => parentOpportunityId(r.opportunityId)))
  const complementary = seeded(form.opportunities.filter((o) => !o.required && eligible(form, o, states, form.stages.length - 1)
    && (cov[o.capabilityId] || 0) < form.director.coverageFloorPerFamily
    && !(o.paraphraseOf && servedIds.has(o.paraphraseOf))))
  if (complementary.length) return present(complementary[0], '3_COMPLEMENTARY')

  return { kind: 'STOP', reason: partial.length ? 'COVERAGE_PARTIAL' : 'COVERAGE_COMPLETE', partial, review, decision: decision('5_STOP') }
}

// Visible stage strip: task names only, never scores or coverage gaps.
export function stageStrip(form, ledger = []) {
  const byId = new Map(form.opportunities.map((o) => [o.id, o]))
  const touched = new Map()
  for (const row of ledger) {
    const o = byId.get(parentOpportunityId(row.opportunityId))
    if (!o || row.state === 'PLANNED') continue
    const prev = touched.get(o.stageId)
    touched.set(o.stageId, row.state === 'PRESENTED' ? 'CURRENT' : prev === 'CURRENT' ? 'CURRENT' : 'VISITED')
  }
  return form.stages.map((s) => ({ id: s.id, label: s.label, state: touched.get(s.id) === 'CURRENT' ? 'CURRENT' : touched.has(s.id) ? 'DONE' : 'UPCOMING' }))
}

// P4.5/P4.7 per-run coverage diagnostics: COUNTS only (never scores or
// capability hints) over the REQUIRED planned opportunities of the pinned
// form, plus the side-state reasons. Shown to the owner after finish and
// carried into the report as a limitation. Pure.
export const COVERAGE_SIDE_STATES = Object.freeze(['DELIVERY_FAILED', 'NOT_ACCESSIBLE', 'EXPIRED', 'SKIPPED_BY_POLICY', 'REVIEW_REQUIRED'])
export function coverageReport(form, ledger = []) {
  const states = new Map(ledger.map((r) => [r.opportunityId, r.state]))
  const required = form.opportunities.filter((o) => o.required)
  const stateOf = (o) => states.get(o.id) || 'PLANNED'
  const presented = required.filter((o) => stateOf(o) !== 'PLANNED' && !['DELIVERY_FAILED', 'NOT_ACCESSIBLE', 'SKIPPED_BY_POLICY', 'REVIEW_REQUIRED'].includes(stateOf(o))).length
  const answered = required.filter((o) => ANSWERED_STATES.has(stateOf(o))).length
  const reasons = Object.fromEntries(COVERAGE_SIDE_STATES.map((s) => [s, ledger.filter((r) => r.state === s).length]))
  const notPresented = required.length - presented - required.filter((o) => ['DELIVERY_FAILED', 'NOT_ACCESSIBLE', 'SKIPPED_BY_POLICY', 'REVIEW_REQUIRED'].includes(stateOf(o))).length
  const stagesPresented = new Set(ledger.filter((r) => r.state !== 'PLANNED').map((r) => form.opportunities.find((o) => o.id === parentOpportunityId(r.opportunityId))?.stageId).filter(Boolean))
  const notes = []
  notes.push(`Review coverage: ${presented} of ${required.length} planned moments were presented.`)
  if (reasons.REVIEW_REQUIRED > 0) notes.push(reasons.REVIEW_REQUIRED === 1 ? 'One moment was withheld for review.' : `${reasons.REVIEW_REQUIRED} moments were withheld for review.`)
  if (notPresented > 0) notes.push(notPresented === 1 ? 'One planned moment was not reached before you finished.' : `${notPresented} planned moments were not reached before you finished.`)
  if (reasons.EXPIRED > 0) notes.push(reasons.EXPIRED === 1 ? 'One moment expired before an answer was received.' : `${reasons.EXPIRED} moments expired before an answer was received.`)
  if (reasons.DELIVERY_FAILED > 0 || reasons.NOT_ACCESSIBLE > 0) notes.push('Some moments could not be delivered; this is a technical limitation, not something you did.')
  return {
    planned: required.length, presented, answered, notPresented,
    stagesPlanned: form.stages.length, stagesPresented: stagesPresented.size,
    reasons, reviewRequired: reasons.REVIEW_REQUIRED > 0, notes,
  }
}
