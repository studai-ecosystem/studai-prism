// P4.7 — fact and tool boundary: unknown fact stays unknown, an already
// given fact gets a neutral pointer, a relevant conditional fact returns the
// authored answer, forbidden structured mutations are rejected, and the
// render hash is stable and sensitive to content.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  renderStimulus, verifyRender, answerFactQuestion, validateGeneratedAction, toolAllowed,
  boardReviewReadiness, interpretLearnerMessage, LEARNER_INTENT, stakeholderReaction, stimulusForWorkState,
} from '../domain/assessments/factBoundary.js'
import { CORE_TEAMREADY_A as form, worldStateFor, opportunityById } from '../domain/assessments/universalForm.js'

const world = worldStateFor(form)

test('renderStimulus substitutes only permitted, known facts and hashes what is actually shown', () => {
  const o = opportunityById(form, 'OPP-REASON-FACTS-ASSUMPTIONS')
  const r = renderStimulus({ form, opportunity: o, worldState: world })
  assert.equal(r.ok, true)
  assert.equal(r.status, 'OK')
  assert.match(r.text, /24 participants/)
  assert.doesNotMatch(r.text, /\{\{/)
  assert.deepEqual(r.factsUsed, o.stimulus.factIds)
  assert.equal(r.message.actorKind, 'AI_PARTICIPANT')
  assert.equal(r.renderHash.length, 64)
  assert.equal(renderStimulus({ form, opportunity: o, worldState: world }).renderHash, r.renderHash, 'deterministic')
  // A fact changed by the world → a different hash (the shown version is what is recorded).
  const changed = worldStateFor(form, { appliedWorldChangeIds: ['WC-FACILITATOR-UNAVAILABLE'] })
  const r2 = renderStimulus({ form, opportunity: o, worldState: changed })
  assert.notEqual(r2.renderHash, r.renderHash)
  assert.deepEqual(verifyRender(r.renderHash, r.renderHash), { ok: true })
  assert.equal(verifyRender(r.renderHash, r2.renderHash).status, 'REVIEW_REQUIRED')
})

test('renderStimulus flags a template that invents or reaches for a fact it may not use as REVIEW_REQUIRED', () => {
  const o = opportunityById(form, 'OPP-REASON-OPTIONS')
  const unknown = renderStimulus({ form, opportunity: o, worldState: world, variant: { ...o.stimulus, template: 'We have {{F-BUDGET}} to spend.', factIds: ['F-BUDGET'] } })
  assert.equal(unknown.ok, false)
  assert.ok(unknown.issues.includes('FACT_UNKNOWN:F-BUDGET'))
  const notPermitted = renderStimulus({ form, opportunity: o, worldState: world, variant: { ...o.stimulus, template: '{{F-PARTICIPANTS}}', factIds: [] } })
  assert.equal(notPermitted.ok, false)
  assert.ok(notPermitted.issues.includes('FACT_NOT_PERMITTED:F-PARTICIPANTS'))
  // A conditional fact that was never revealed is unknown to the render too.
  const hidden = renderStimulus({ form, opportunity: o, worldState: world, variant: { ...o.stimulus, template: '{{CF-PRINTING}}', factIds: ['CF-PRINTING'] } })
  assert.equal(hidden.ok, false)
  assert.equal(renderStimulus({ form, opportunity: { id: 'x' }, worldState: world }).status, 'REVIEW_REQUIRED')
})

test('answerFactQuestion: already-given → neutral pointer; relevant missing → authored answer; unknown → unknown', () => {
  const given = answerFactQuestion({ form, worldState: world, text: 'How many participants are we expecting?' })
  assert.equal(given.kind, 'ALREADY_GIVEN')
  assert.equal(given.factId, 'F-PARTICIPANTS')
  assert.equal(given.neutral, true)
  assert.match(given.text, /already in the brief/)
  const authored = answerFactQuestion({ form, worldState: world, text: 'Can we print the handouts on the day?' })
  assert.equal(authored.kind, 'AUTHORED')
  assert.equal(authored.factId, 'CF-PRINTING')
  assert.equal(authored.text, form.conditionalFacts.find((f) => f.id === 'CF-PRINTING').text)
  // Once revealed, the same question becomes an already-given pointer.
  const revealed = worldStateFor(form, { revealedFactIds: ['CF-PRINTING'] })
  assert.equal(answerFactQuestion({ form, worldState: revealed, text: 'Can we print the handouts on the day?' }).kind, 'ALREADY_GIVEN')
  const unknown = answerFactQuestion({ form, worldState: world, text: 'What is the catering budget per head?' })
  assert.equal(unknown.kind, 'UNKNOWN')
  assert.equal(unknown.factId, null)
  assert.match(unknown.text, /not known/)
  assert.equal(answerFactQuestion({ form, worldState: world, text: '' }).kind, 'UNKNOWN')
})

test('validateGeneratedAction (T34): deadline, identity, scope, payment, threshold, fact, version and access changes are rejected', () => {
  const graph = { form, worldState: world }
  assert.deepEqual(validateGeneratedAction({ type: 'SAY', payload: { content: 'Thanks, {{F-PARTICIPANTS}} noted.' } }, graph), { ok: true, reasons: [] })
  assert.equal(validateGeneratedAction({ type: 'BOARD_PATCH', payload: { updates: { 'R2.owner': 'Priya', 'R2.due': 'Day 2' } } }, graph).ok, true)
  const cases = [
    [{ type: 'SET_DEADLINE', payload: {} }, /TYPE_NOT_ALLOWED/],
    [{ type: 'SAY', payload: { content: 'x', deadlineAt: '2030-01-01' } }, /PROTECTED_FIELD:deadlineAt/],
    [{ type: 'SAY', payload: { content: 'x', meta: { userId: 'u' } } }, /PROTECTED_FIELD:userId/],
    [{ type: 'BOARD_PATCH', payload: { updates: { 'R2.task': 'Order catering' } } }, /SCOPE_CHANGE:task/],
    [{ type: 'BOARD_PATCH', payload: { updates: {}, addRows: [{}] } }, /SCOPE_CHANGE:rows/],
    [{ type: 'BOARD_PATCH', payload: { updates: { 'R2.owner': 'The CEO' } } }, /IDENTITY_UNKNOWN/],
    [{ type: 'SAY', payload: { content: 'x', payment: { amount: 1 } } }, /PROTECTED_FIELD:payment/],
    [{ type: 'SAY', payload: { content: 'x', threshold: 3 } }, /PROTECTED_FIELD:threshold/],
    [{ type: 'SAY', payload: { content: 'x', level: 5 } }, /PROTECTED_FIELD:level/],
    [{ type: 'REVEAL_FACT', payload: { factId: 'F-PARTICIPANTS', text: '40 participants' } }, /FACT_NOT_REVEALABLE|FACT_TEXT_OVERRIDE/],
    [{ type: 'APPLY_WORLD_CHANGE', payload: { worldChangeId: 'WC-NEW', setFacts: [] } }, /WORLD_CHANGE_NOT_ALLOWED/],
    [{ type: 'SAY', payload: { content: 'x', version: '9.9.9' } }, /PROTECTED_FIELD:version/],
    [{ type: 'SAY', payload: { content: 'x', permissions: ['*'] } }, /PROTECTED_FIELD:permissions/],
    [{ type: 'SAY', payload: { content: 'There are {{F-BUDGET}} rupees.' } }, /FACT_UNKNOWN:F-BUDGET/],
  ]
  for (const [action, re] of cases) {
    const out = validateGeneratedAction(action, graph)
    assert.equal(out.ok, false, JSON.stringify(action))
    assert.ok(out.reasons.some((r) => re.test(r)), `${JSON.stringify(action)} → ${out.reasons}`)
  }
  assert.equal(validateGeneratedAction(null, graph).ok, false)
  for (const t of ['browser', 'email', 'shell', 'database']) assert.equal(toolAllowed(t), false)
})

test('answerFactQuestion matches only the question sentence, so a plan that mentions the venue is not answered with a fact pointer', () => {
  const world = worldStateFor(form, { revealedFactIds: [] })
  const plan = 'Sam is out Day 1 afternoon, so room setup moves to Day 1 morning and I take the materials myself. Priya, can you cover the list if I run short?'
  const out = answerFactQuestion({ form, worldState: world, text: plan })
  assert.notEqual(out.factId, 'F-VENUE', 'a decision that mentions the room is not a venue question')
  assert.equal(answerFactQuestion({ form, worldState: world, text: 'What equipment does the venue have?' }).factId, 'F-VENUE')
  assert.equal(answerFactQuestion({ form, worldState: world, text: 'I will book the room. How many participants are expected?' }).factId, 'F-PARTICIPANTS')
})

test('answerFactQuestion leaves a request to a colleague to the Director instead of answering "not known"', () => {
  const world = worldStateFor(form, { revealedFactIds: [] })
  const out = answerFactQuestion({ form, worldState: world, text: 'Priya, can you cover the list if I run short?' })
  assert.equal(out.kind, 'NONE')
  assert.equal(out.text, null)
  assert.equal(answerFactQuestion({ form, worldState: world, text: 'Who approved the budget?' }).kind, 'UNKNOWN')
})

test('learner interpretation is task-aware and does not use word count as ambiguity', () => {
  const decisionOpportunity = opportunityById(form, 'OPP-ADAPT-REPLAN')
  const inquiryOpportunity = opportunityById(form, 'OPP-REASON-FACTS-ASSUMPTIONS')
  const factAnswer = { kind: 'AUTHORED', factId: 'CF-FACILITATOR-HOURS' }
  assert.deepEqual(interpretLearnerMessage({ text: 'How much time does Sam have?', opportunity: decisionOpportunity, factAnswer }).kind, LEARNER_INTENT.INFORMATION_REQUEST)
  assert.equal(interpretLearnerMessage({ text: 'How much time does Sam have?', opportunity: decisionOpportunity, factAnswer }).servesOpportunity, false)
  assert.equal(interpretLearnerMessage({ text: 'How much time does Sam have?', opportunity: inquiryOpportunity, factAnswer }).servesOpportunity, true)
  assert.equal(interpretLearnerMessage({ text: 'Ask Priya first', opportunity: decisionOpportunity }).kind, LEARNER_INTENT.HELP_REQUEST)
  assert.equal(interpretLearnerMessage({ text: 'Postpone the materials', opportunity: decisionOpportunity }).kind, LEARNER_INTENT.DECISION)
  assert.equal(interpretLearnerMessage({ text: 'I cannot take both tasks', opportunity: decisionOpportunity }).kind, LEARNER_INTENT.REFUSAL)
  assert.equal(interpretLearnerMessage({ text: 'Use a smaller handout', opportunity: decisionOpportunity }).kind, LEARNER_INTENT.DECISION)
  assert.equal(interpretLearnerMessage({ text: 'ok sure', opportunity: decisionOpportunity }).kind, LEARNER_INTENT.UNCLEAR)
  assert.equal(interpretLearnerMessage({ text: 'Materials tomorrow morning', opportunity: decisionOpportunity }).kind, LEARNER_INTENT.PROPOSAL)
})

test('board readiness distinguishes cumulative drafts from work ready for review', () => {
  const owners = opportunityById(form, 'OPP-EXEC-BOARD-OWNERS')
  const partial = boardReviewReadiness(form, owners, { 'R2.owner': 'Priya' })
  assert.equal(partial.ready, false)
  assert.equal(partial.state, 'DRAFT_SAVED')
  const ready = boardReviewReadiness(form, owners, { 'R2.owner': 'Priya', 'R3.owner': 'You', 'R3.due': 'Day 1 morning' })
  assert.equal(ready.ready, true)
  assert.equal(ready.state, 'READY_FOR_REVIEW')
})

test('stakeholder reactions are grounded in the actual proposal and board state', () => {
  const owners = opportunityById(form, 'OPP-EXEC-BOARD-OWNERS')
  const interpretation = { kind: LEARNER_INTENT.PROPOSAL, servesOpportunity: true }
  const overloaded = stakeholderReaction({
    form, opportunity: owners, interpretation,
    action: { kind: 'ARTIFACT', payload: { text: '' } },
    boardState: { 'R2.owner': 'Sam', 'R3.owner': 'Sam' },
    worldState: world,
  })
  assert.equal(overloaded.continue, true)
  assert.match(overloaded.content, /morning available/i)
  const feasible = stakeholderReaction({
    form, opportunity: owners, interpretation,
    action: { kind: 'ARTIFACT', payload: { text: '' } },
    boardState: { 'R2.owner': 'Priya', 'R3.owner': 'You' },
    worldState: world,
  })
  assert.equal(feasible.continue, false)
  assert.doesNotMatch(feasible.content, /error|wrong/i)
})

test('feedback stimulus does not allege an error when the current board is consistent', () => {
  const feedback = opportunityById(form, 'OPP-ADAPT-FEEDBACK')
  const stimulus = stimulusForWorkState({
    form,
    opportunity: feedback,
    workState: { 'R1.due': 'Day 1 morning', 'R2.due': 'Day 2 morning', 'R3.due': 'Day 1 morning' },
  })
  assert.notEqual(stimulus, feedback.stimulus)
  assert.doesNotMatch(stimulus.template, /error|doesn't line up|does not line up/i)
})
