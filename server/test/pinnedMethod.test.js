import test from 'node:test'
import assert from 'node:assert/strict'
import { UNIVERSAL_SNAPSHOT, buildRunPin } from '../domain/assessments/draftSegments.js'
import { createSliceEvaluator, buildEvaluatorMessages } from '../domain/evidence/sliceEvaluator.js'
import { resolvePinnedMethod } from '../domain/assessments/frozenMethod.js'
import { capabilityInfo } from '../domain/assessments/catalog.js'
import { normalizeEvidenceUnit } from '../domain/evidence/evidenceUnit.js'
import { buildStudentReportV3 } from '../domain/reports/v3/build.js'
import { CORE_TEAMREADY_A_V1_FORM_ID } from '../domain/assessments/universalForm.js'

test('allocation resolves the explicitly selected original form and rejects an inconsistent form reference', () => {
  const original = resolvePinnedMethod(buildRunPin({ formId: CORE_TEAMREADY_A_V1_FORM_ID, scenarioId: UNIVERSAL_SNAPSHOT.id }))
  assert.equal(original.snapshot.version, '0.1.0-draft')
  assert.equal(original.snapshot.form.formId, CORE_TEAMREADY_A_V1_FORM_ID)
  assert.equal(original.snapshot.form.opportunities.find((o) => o.id === 'OPP-EXEC-BOARD-FINAL').reviewReadiness.edited.length, 3)
  assert.throws(() => buildRunPin({ formId: 'unknown-form-version', scenarioId: UNIVERSAL_SNAPSHOT.id }), (err) => err.code === 'PINNED_METHOD_UNAVAILABLE')
})

test('missing required pinned behaviour anchors reject evaluation before any provider call or evidence write', async () => {
  const snapshot = structuredClone(UNIVERSAL_SNAPSHOT)
  delete snapshot.form.rubric.anchorsByBehaviour.QUESTION_ASSUMPTION
  let calls = 0
  let writes = 0
  const evaluator = createSliceEvaluator({
    complete: async () => { calls += 1; throw new Error('provider must not be reached') },
    recordUnit: async () => { writes += 1; throw new Error('writer must not be reached') },
  })
  await assert.rejects(evaluator.evaluateRun({
    sessionId: 'synthetic-pinned-method',
    snapshot,
    pin: buildRunPin({ formId: UNIVERSAL_SNAPSHOT.form.formId, scenarioId: snapshot.id }),
    actions: [],
    apply: false,
  }), (err) => err.code === 'PINNED_METHOD_UNAVAILABLE')
  assert.equal(calls, 0)
  assert.equal(writes, 0)
})

test('prompt construction cannot substitute catalogue anchors for a missing pinned behaviour', () => {
  const snapshot = structuredClone(UNIVERSAL_SNAPSHOT)
  const opportunity = snapshot.opportunities[0]
  delete snapshot.form.rubric.anchorsByBehaviour[opportunity.behaviourId]
  assert.throws(() => buildEvaluatorMessages({ snapshot, opportunity, actions: [] }),
    (err) => err.code === 'PINNED_METHOD_UNAVAILABLE')
})

test('missing presented stimulus is a review-context failure before inference, not a weakness', async () => {
  const pin = buildRunPin({ formId: UNIVERSAL_SNAPSHOT.form.formId, scenarioId: UNIVERSAL_SNAPSHOT.id })
  let calls = 0
  const evaluator = createSliceEvaluator({ complete: async () => { calls += 1 }, recordUnit: async () => { throw new Error('Compute must not write.') } })
  const action = {
    actionId: 'synthetic-context-outage', kind: 'MESSAGE', actorKind: 'CANDIDATE', state: 'APPLIED', sequence: 1,
    payload: { text: 'Ask Priya first' },
    result: { evaluationContext: { situation: { applicableFacts: [] }, workState: { before: {}, after: {} } } },
  }
  await assert.rejects(evaluator.evaluateRun({ sessionId: 'synthetic-context-run', pin, snapshot: UNIVERSAL_SNAPSHOT, actions: [action] }),
    (error) => error.code === 'EVALUATION_CONTEXT_INCOMPLETE')
  assert.equal(calls, 0)
})

test('allocated method, instructions, evidence and report anchors stay frozen when the current catalogue changes', async () => {
  const pin = JSON.parse(JSON.stringify(buildRunPin({ formId: UNIVERSAL_SNAPSHOT.form.formId, scenarioId: UNIVERSAL_SNAPSHOT.id })))
  const method = resolvePinnedMethod(pin)
  const opportunity = method.snapshot.opportunities[0]
  const text = 'Please confirm the expected attendance before we choose the room.'
  const action = { actionId: 'synthetic-action', actorKind: 'CANDIDATE', state: 'APPLIED', kind: 'MESSAGE', sequence: 1, payload: { text } }
  const catalogue = capabilityInfo(opportunity.capabilityId).anchors[2]
  const previous = catalogue.criteria
  catalogue.criteria = 'Current catalogue B must not reinterpret the historical method.'
  try {
    let seen
    const evaluator = createSliceEvaluator({
      complete: async ({ messages }) => {
        seen = messages[0].content
        const target = JSON.parse(/OPPORTUNITY \(JSON\)\s*([^\r\n]+)/.exec(seen)[1])
        return { content: JSON.stringify({ units: [{ opportunityId: target.id, capabilityId: target.capabilityId, behaviourId: target.behaviourId, sourceActionId: action.actionId, excerpt: text, anchorLevel: 2, observedBehavior: 'Requested attendance before choosing a room.' }] }) }
      },
      recordUnit: async (u) => normalizeEvidenceUnit(u).unit,
    })
    // Evaluate the complete pinned snapshot; only the answered opportunity
    // is in the ledger. Source context is the context the learner actually saw.
    action.result = { evaluationContext: {
      situation: { applicableFacts: method.snapshot.form.publicFacts },
      stimulus: { opportunityId: opportunity.id, messages: [{ speaker: 'Synthetic colleague', content: 'What needs checking before choosing the room?' }] }, workState: { before: {}, after: {} },
    } }
    const result = await evaluator.evaluateRun({
      sessionId: 'synthetic-frozen-report', snapshot: method.snapshot, pin, actions: [action],
      opportunities: [{ opportunityId: opportunity.id, state: 'EVALUATION_PENDING', actionIds: [action.actionId] }],
    })
    const unit = result.units[0]
    const expected = method.snapshot.form.rubric.anchorsByBehaviour[opportunity.behaviourId][2]
    assert.ok(seen.includes(expected))
    assert.ok(!seen.includes(catalogue.criteria))
    assert.equal(unit.provenance_json.resolvedRubric.contentHash, method.rubricHash)
    const report = buildStudentReportV3({ sessionId: unit.session_id, units: [unit], turns: [text] })
    assert.equal(report.moments[0].rubricAnchor.criteria, expected)
    assert.ok(!JSON.stringify(report).includes(catalogue.criteria))
    const changed = structuredClone(method.snapshot)
    changed.form.rubric.anchorsByBehaviour[opportunity.behaviourId][2] = 'A different current rubric B.'
    await assert.rejects(evaluator.evaluateRun({ sessionId: 'synthetic', snapshot: changed, pin, actions: [], apply: false }),
      (err) => err.code === 'PINNED_METHOD_UNAVAILABLE')
  } finally { catalogue.criteria = previous }
})

test('a changed form reference or snapshot hash cannot silently re-evaluate a historical run', async () => {
  const pin = buildRunPin({ formId: UNIVERSAL_SNAPSHOT.form.formId, scenarioId: UNIVERSAL_SNAPSHOT.id })
  for (const changed of [{ ...pin, formId: 'different-form' }, { ...pin, snapshotHash: 'different-hash' }, { ...pin, rubricRef: 'different-rubric' }, { ...pin, methodSnapshot: undefined }]) {
    assert.throws(() => resolvePinnedMethod(changed), (err) => err.code === 'PINNED_METHOD_UNAVAILABLE')
  }
})
