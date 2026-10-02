// P4.6 — Director: deterministic with a seed, policy order (required →
// clarification → complementary → stop), budget stop with precise partial
// reasons, no re-presentation or paraphrase, world change ridden on stage
// entry, task-only stage strip. Pure: no store, no model.
import test from 'node:test'
import assert from 'node:assert/strict'
import { selectNext, coverageFrom, stageStrip, appliedWorldChanges, SERVED_STATES, OPPORTUNITY_STATES } from '../domain/assessments/director.js'
import { CORE_TEAMREADY_A as form, FAMILY } from '../domain/assessments/universalForm.js'

const row = (opportunityId, state, extra = {}) => {
  const o = form.opportunities.find((x) => x.id === opportunityId.replace(/:CLARIFY$/, ''))
  return { opportunityId, state, groupId: o.groupId, capabilityId: o.capabilityId, actionIds: [], updatedAt: '2026-10-02T10:00:00Z', ...extra }
}
const planned = () => form.opportunities.map((o) => row(o.id, 'PLANNED'))
const requiredIds = form.opportunities.filter((o) => o.required).map((o) => o.id)
const message = (actionId, text, sequence = 1) => ({ actionId, kind: 'MESSAGE', state: 'APPLIED', sequence, payload: { text } })

// Drive a whole run answering every presented opportunity with a full answer.
function drive({ seed = 's', budget = {}, answerText = 'I would check the participant list first and confirm who is actually coming.', mark = () => null }) {
  const ledger = planned()
  const actions = []
  const presented = []
  const decisions = []
  for (let i = 0; i < 40; i += 1) {
    const next = selectNext({ form, presented: ledger, actions, budget, seed })
    decisions.push(next)
    if (next.kind === 'STOP') break
    assert.notEqual(next.kind, 'WAIT')
    const id = next.kind === 'CLARIFY' ? next.opportunityId : next.opportunity.id
    if (next.kind === 'CLARIFY') ledger.push(row(id, 'PLANNED'))
    const r = ledger.find((x) => x.opportunityId === id)
    r.state = 'PRESENTED'
    presented.push({ id, worldChangeId: next.worldChangeId || null, renderHash: next.stimulus.renderHash, text: next.stimulus.text })
    const override = mark(id)
    if (override) { r.state = override; continue }
    const a = message(`a-${i}`, answerText, i + 1)
    actions.push(a)
    r.actionIds = [a.actionId]
    r.state = 'ACTION_RECEIVED'
    r.updatedAt = `2026-10-02T10:${String(i).padStart(2, '0')}:00Z`
  }
  return { ledger, presented, decisions, actions }
}

test('lifecycle vocabulary is the governed one', () => {
  assert.deepEqual([...OPPORTUNITY_STATES], ['PLANNED', 'PRESENTED', 'ACTION_RECEIVED', 'EVALUATION_PENDING', 'EVALUATED', 'DELIVERY_FAILED', 'NOT_ACCESSIBLE', 'SKIPPED_BY_POLICY', 'EXPIRED', 'REVIEW_REQUIRED'])
  assert.ok(SERVED_STATES.has('ACTION_RECEIVED') && !SERVED_STATES.has('PRESENTED') && !SERVED_STATES.has('DELIVERY_FAILED'))
})

test('P4.6: the same seed yields the same sequence, hashes and content; a different seed only reorders equal-priority ties', () => {
  const a = drive({ seed: 'alpha' })
  const b = drive({ seed: 'alpha' })
  assert.deepEqual(a.presented, b.presented)
  const c = drive({ seed: 'omega' })
  assert.deepEqual(a.presented.map((p) => p.id), c.presented.map((p) => p.id), 'required events follow the authored stage order whatever the seed')
  // Required opportunities are all served in stage order; nothing is presented twice.
  const ids = a.presented.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length, 'never re-presents or paraphrases a served opportunity')
  for (const id of requiredIds) assert.ok(ids.includes(id), id)
  const stageOf = (id) => form.stages.findIndex((s) => s.id === form.opportunities.find((o) => o.id === id).stageId)
  for (let i = 1; i < ids.length; i += 1) assert.ok(stageOf(ids[i]) >= stageOf(ids[i - 1]), `stage order ${ids[i - 1]} → ${ids[i]}`)
  // Dependencies: the explanation follows the board change.
  assert.ok(ids.indexOf('OPP-COMM-PLAN-EXPLAIN') > ids.indexOf('OPP-EXEC-BOARD-OWNERS'))
  assert.ok(ids.indexOf('OPP-COMM-HANDOVER-AUDIENCE') > ids.indexOf('OPP-EXEC-BOARD-FINAL'))
  // Policy 4: the stage-3 world change rides on the first stage-3 opportunity, exactly once.
  const changes = a.presented.filter((p) => p.worldChangeId)
  assert.equal(changes.length, 1)
  assert.equal(changes[0].id, 'OPP-ADAPT-REPLAN')
  assert.match(changes[0].text, /afternoon of Day 1/)
  assert.equal(a.decisions.at(-1).kind, 'STOP')
  assert.equal(a.decisions.at(-1).reason, 'COVERAGE_COMPLETE')
  assert.deepEqual(a.decisions.at(-1).partial, [])
  // Full coverage: every family has at least two distinct answered groups.
  const cov = coverageFrom(form, a.ledger)
  for (const fam of Object.values(FAMILY)) assert.ok(cov[fam] >= 2, fam)
  // Optional opportunities are NOT presented when coverage is already met (no padding).
  assert.ok(!ids.includes('OPP-COMM-CLARIFY-BRIEF'))
})

test('P4.6 policy 2: a very short answer earns one bounded authored clarification, never two, and never a scoring hint', () => {
  const ledger = planned()
  const first = selectNext({ form, presented: ledger, actions: [], seed: 's' })
  assert.equal(first.kind, 'PRESENT')
  assert.equal(first.opportunity.id, 'OPP-REASON-FACTS-ASSUMPTIONS')
  assert.equal(first.decision.policy, '1_REQUIRED')
  const r = ledger.find((x) => x.opportunityId === first.opportunity.id)
  const a = message('a1', 'ok sure')
  Object.assign(r, { state: 'ACTION_RECEIVED', actionIds: ['a1'], updatedAt: '2026-10-02T10:01:00Z' })
  const second = selectNext({ form, presented: ledger, actions: [a], seed: 's' })
  assert.equal(second.kind, 'CLARIFY')
  assert.equal(second.decision.policy, '2_CLARIFY')
  assert.equal(second.opportunityId, 'OPP-REASON-FACTS-ASSUMPTIONS:CLARIFY')
  assert.doesNotMatch(second.stimulus.text, /ownership|show more|score|level/i)
  ledger.push(row(second.opportunityId, 'ACTION_RECEIVED', { actionIds: ['a2'], updatedAt: '2026-10-02T10:02:00Z' }))
  const third = selectNext({ form, presented: ledger, actions: [a, message('a2', 'no', 2)], seed: 's' })
  assert.equal(third.kind, 'PRESENT', 'a second short answer does not earn a second clarification')
  assert.equal(third.decision.policy, '1_REQUIRED')
})

test('P4.6 policy 3: a complementary opportunity is chosen only for a family under the coverage floor, never a paraphrase', () => {
  // Make the required pushback opportunity NOT_ACCESSIBLE: collaboration drops to one group.
  const run = drive({ seed: 's', mark: (id) => (id === 'OPP-COLLAB-PUSHBACK' ? 'NOT_ACCESSIBLE' : null) })
  const ids = run.presented.map((p) => p.id)
  assert.ok(ids.includes('OPP-COLLAB-PRIORITY-ALIGN'), 'optional collaboration opportunity fills the gap')
  const complementary = run.decisions.filter((d) => d.decision?.policy === '3_COMPLEMENTARY')
  assert.ok(complementary.length >= 1)
  assert.ok(complementary.every((d) => d.opportunity.capabilityId === FAMILY.COLLABORATION), 'no padding of families already covered')
  assert.ok(!ids.includes('OPP-COMM-CLARIFY-BRIEF'))
  assert.equal(run.decisions.at(-1).reason, 'COVERAGE_PARTIAL')
  assert.deepEqual(run.decisions.at(-1).partial, ['OPP-COLLAB-PUSHBACK'], 'the inaccessible required opportunity is reported, not scored')
})

test('P4.6 policy 5: the approved budget stops the run and reports the unserved required opportunities precisely', () => {
  const run = drive({ seed: 's', budget: { maxOpportunities: 3 } })
  assert.equal(run.presented.length, 3)
  const stop = run.decisions.at(-1)
  assert.equal(stop.kind, 'STOP')
  assert.equal(stop.reason, 'BUDGET_EXHAUSTED')
  assert.deepEqual(new Set(stop.partial), new Set(requiredIds.filter((id) => !run.presented.some((p) => p.id === id))))
  const timed = selectNext({ form, presented: planned(), actions: [], budget: { remainingMs: 0 }, seed: 's' })
  assert.equal(timed.kind, 'STOP')
  assert.equal(timed.reason, 'BUDGET_EXHAUSTED')
})

test('P4.6: WAIT while an opportunity is presented; REVIEW_REQUIRED and DELIVERY_FAILED are reported / retried', () => {
  const ledger = planned()
  ledger[0].state = 'PRESENTED'
  const w = selectNext({ form, presented: ledger, actions: [], seed: 's' })
  assert.equal(w.kind, 'WAIT')
  assert.equal(w.opportunityId, ledger[0].opportunityId)
  ledger[0].state = 'DELIVERY_FAILED'
  const retry = selectNext({ form, presented: ledger, actions: [], seed: 's' })
  assert.equal(retry.kind, 'PRESENT')
  assert.equal(retry.opportunity.id, ledger[0].opportunityId, 'a failed delivery is presented again')
  ledger[0].state = 'REVIEW_REQUIRED'
  const after = selectNext({ form, presented: ledger, actions: [], seed: 's' })
  assert.notEqual(after.opportunity?.id, ledger[0].opportunityId)
})

test('P4.6: the stage strip names tasks and position only — no scores, levels or coverage gaps', () => {
  const run = drive({ seed: 's', budget: { maxOpportunities: 4 } })
  const strip = stageStrip(form, run.ledger)
  assert.deepEqual(strip.map((s) => s.id), form.stages.map((s) => s.id))
  for (const s of strip) {
    assert.deepEqual(Object.keys(s).sort(), ['id', 'label', 'state'])
    assert.ok(['DONE', 'CURRENT', 'UPCOMING'].includes(s.state))
  }
  assert.equal(strip[0].state, 'DONE')
  assert.equal(strip[5].state, 'UPCOMING')
  assert.deepEqual(appliedWorldChanges(form, run.ledger), [])
})
