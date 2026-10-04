// P4.1–P4.5 — the CORE-TEAMREADY-A universal form: content package shape,
// coverage floor per family, dependent groups, immutability, resolvable fact
// ids and the 20 proposed behaviour ids.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CORE_TEAMREADY_A, BEHAVIOUR_IDS, FAMILY, familiesCovered, worldStateFor, validateBoardPatch, CORE_TEAMREADY_A_FORM_ID } from '../domain/assessments/universalForm.js'
import { PRIMARY_CAPABILITY_IDS } from '../domain/assessments/catalog.js'
import { DRAFT_UNIVERSAL } from '../domain/assessments/timingPolicy.js'
import { DRAFT_CORE_TEAMREADY_A_HANDOVER, UNIVERSAL_SNAPSHOT, buildRunPin, snapshotHash, draftBankScenarios } from '../domain/assessments/draftSegments.js'
import { answerFactQuestion } from '../domain/assessments/factBoundary.js'

const EXPECTED_BEHAVIOURS = [
  'QUESTION_ASSUMPTION', 'COMPARE_ALTERNATIVES', 'CHECK_EVIDENCE', 'STATE_UNCERTAINTY',
  'STATE_MAIN_POINT', 'ADAPT_TO_AUDIENCE', 'CHECK_UNDERSTANDING', 'CLARIFY_REQUEST',
  'UNDERSTAND_CONCERN', 'DISAGREE_CONSTRUCTIVELY', 'NEGOTIATE_BOUNDARY', 'ACKNOWLEDGE_CONTRIBUTION',
  'UPDATE_WITH_EVIDENCE', 'REPLAN_CONSTRAINT', 'SEEK_HELP', 'REPAIR_MISTAKE',
  'PRIORITIZE_WORK', 'ASSIGN_RESPONSIBILITY', 'CHECK_DEPENDENCY', 'DEFINE_COMPLETION',
]

test('P4.1: the form is an original DRAFT package with every authoring section present', () => {
  const f = CORE_TEAMREADY_A
  assert.equal(f.status, 'DRAFT')
  assert.equal(f.version, '0.1.0-draft')
  assert.equal(f.blueprintId, 'CORE-TEAMREADY-A')
  assert.deepEqual(f.approvalHistory.map((h) => h.state), ['DRAFT'])
  assert.equal(f.licensing.source, 'ORIGINAL')
  assert.equal(f.timing.policyRef, DRAFT_UNIVERSAL.version)
  assert.equal(f.participants.filter((p) => p.actorKind === 'AI_PARTICIPANT').length, 2)
  assert.ok(f.thirdPersonMessage.optional)
  assert.equal(f.stages.length, 6)
  assert.deepEqual(f.stages.map((s) => s.label), ['Understand', 'Choose and coordinate', 'Respond to changed constraints', 'Check a recommendation', 'Resolve handover ambiguity', 'Finish usable work'])
  for (const key of ['briefing', 'publicFacts', 'conditionalFacts', 'worldChanges', 'opportunities', 'behaviours', 'board', 'rubric', 'exemplars', 'accessibilityVariants', 'licensing', 'confounds', 'approvalHistory']) assert.ok(f[key], key)
  // Public facts named in the blueprint, each with an id.
  const texts = f.publicFacts.map((x) => x.text).join(' ')
  for (const needle of ['24 participants', 'Two facilitators', 'two working days', 'basic equipment', 'Three preparation tasks', 'reach']) assert.match(texts, new RegExp(needle, 'i'))
  assert.ok(f.publicFacts.every((x) => /^F-[A-Z-]+$/.test(x.id)))
  // The AI-judgment opportunity is explicitly labelled AI-generated.
  const ai = f.opportunities.find((o) => o.id === 'OPP-REASON-CHECK-RECOMMENDATION')
  assert.equal(ai.aiGenerated, true)
  assert.match(ai.stimulus.template, /AI-generated/)
  assert.equal(ai.stimulus.actorKind, 'SYSTEM')
})

test('P4.4: exactly the 20 proposed behaviour ids, four per family, each with five private anchors', () => {
  assert.deepEqual([...BEHAVIOUR_IDS].sort(), [...EXPECTED_BEHAVIOURS].sort())
  for (const famId of PRIMARY_CAPABILITY_IDS) assert.equal(CORE_TEAMREADY_A.behaviours.filter((b) => b.capabilityId === famId).length, 4, famId)
  for (const b of CORE_TEAMREADY_A.behaviours) assert.deepEqual(Object.keys(b.anchors), ['1', '2', '3', '4', '5'])
  for (const id of BEHAVIOUR_IDS) assert.ok(CORE_TEAMREADY_A.rubric.anchorsByBehaviour[id])
  // Every behaviour is targeted by at least one opportunity.
  const targeted = new Set(CORE_TEAMREADY_A.opportunities.flatMap((o) => o.behaviourIds))
  for (const id of BEHAVIOUR_IDS) assert.ok(targeted.has(id), `${id} is never afforded`)
})

test('P4.5: at least two DISTINCT required opportunity groups per family; the dependent board+explanation pairs share a group', () => {
  const required = CORE_TEAMREADY_A.opportunities.filter((o) => o.required)
  const cov = familiesCovered(CORE_TEAMREADY_A, required)
  for (const famId of PRIMARY_CAPABILITY_IDS) assert.ok((cov.get(famId)?.size || 0) >= 2, `${famId} has ${cov.get(famId)?.size || 0} distinct groups`)
  const initial = CORE_TEAMREADY_A.opportunities.filter((o) => o.groupId === 'G-INITIAL-BOARD')
  assert.deepEqual(initial.map((o) => o.id), ['OPP-EXEC-BOARD-OWNERS', 'OPP-COMM-PLAN-EXPLAIN'])
  assert.deepEqual(initial[1].dependsOn, ['OPP-EXEC-BOARD-OWNERS'])
  const final = CORE_TEAMREADY_A.opportunities.filter((o) => o.groupId === 'G-FINAL')
  assert.equal(final.length, 2)
  assert.deepEqual(final[1].dependsOn, ['OPP-EXEC-BOARD-FINAL'])
  // Every opportunity names a stage, a family and at least one behaviour of that family.
  const stageIds = new Set(CORE_TEAMREADY_A.stages.map((s) => s.id))
  for (const o of CORE_TEAMREADY_A.opportunities) {
    assert.ok(stageIds.has(o.stageId), o.id)
    assert.ok(Object.values(FAMILY).includes(o.capabilityId), o.id)
    for (const b of o.behaviourIds) assert.equal(CORE_TEAMREADY_A.behaviours.find((x) => x.id === b).capabilityId, o.capabilityId, `${o.id}:${b}`)
  }
  // The matrix named in the blueprint: two required per family at minimum.
  for (const famId of PRIMARY_CAPABILITY_IDS) assert.ok(required.filter((o) => o.capabilityId === famId).length >= 2)
})

test('P4.7: every fact id a stimulus or world change references resolves; conditional facts stay hidden until revealed', () => {
  const base = worldStateFor(CORE_TEAMREADY_A)
  for (const o of CORE_TEAMREADY_A.opportunities) {
    const after = worldStateFor(CORE_TEAMREADY_A, { appliedWorldChangeIds: CORE_TEAMREADY_A.worldChanges.map((w) => w.id) })
    for (const id of o.stimulus.factIds) assert.ok(after.facts[id], `${o.id} references ${id}`)
    for (const m of o.stimulus.template.matchAll(/\{\{([A-Z0-9-]+)\}\}/g)) assert.ok(o.stimulus.factIds.includes(m[1]), `${o.id} token ${m[1]} not declared`)
  }
  for (const cf of CORE_TEAMREADY_A.conditionalFacts) assert.equal(base.facts[cf.id], undefined)
  assert.ok(worldStateFor(CORE_TEAMREADY_A, { revealedFactIds: ['CF-PRINTING'] }).facts['CF-PRINTING'])
  // World change updates facts without touching the board schema.
  const changed = worldStateFor(CORE_TEAMREADY_A, { appliedWorldChangeIds: ['WC-FACILITATOR-UNAVAILABLE'] })
  assert.match(changed.facts['F-FACILITATORS'].text, /unavailable/)
  assert.ok(changed.facts['F-FACILITATOR-CHANGE'])
  assert.equal(changed.facts['F-PARTICIPANTS'].text, base.facts['F-PARTICIPANTS'].text)
  assert.equal(CORE_TEAMREADY_A.worldChanges[0].preservesBoard, true)
  const availability = answerFactQuestion({ form: CORE_TEAMREADY_A, worldState: changed, text: 'What is Sam availability now?' })
  assert.equal(availability.kind, 'ALREADY_GIVEN')
  assert.match(availability.text, /cannot work on preparation during the afternoon of Day 1/)
})

test('P4.1: content is deep-frozen; a run pin hashes the whole form and the segment references the form', () => {
  assert.ok(Object.isFrozen(CORE_TEAMREADY_A))
  assert.ok(Object.isFrozen(CORE_TEAMREADY_A.opportunities[0].stimulus))
  assert.ok(Object.isFrozen(CORE_TEAMREADY_A.board.rows[0]))
  assert.throws(() => { 'use strict'; CORE_TEAMREADY_A.opportunities[0].stimulus.template = 'x' })
  assert.throws(() => { 'use strict'; CORE_TEAMREADY_A.publicFacts.push({}) })
  assert.equal(DRAFT_CORE_TEAMREADY_A_HANDOVER.formRef.formId, CORE_TEAMREADY_A_FORM_ID)
  assert.equal(DRAFT_CORE_TEAMREADY_A_HANDOVER.formRef.stageId, 'RESOLVE_HANDOVER')
  const pin = buildRunPin({ formId: CORE_TEAMREADY_A_FORM_ID, scenarioId: CORE_TEAMREADY_A.id })
  assert.equal(pin.snapshotHash, snapshotHash(CORE_TEAMREADY_A))
  assert.notEqual(pin.snapshotHash, buildRunPin({ formId: 'x' }).snapshotHash)
  assert.equal(UNIVERSAL_SNAPSHOT.universal, true)
  assert.equal(UNIVERSAL_SNAPSHOT.opportunities.length, CORE_TEAMREADY_A.opportunities.length)
})

test('P4.3: the seeded board is incomplete and TEMPLATE-attributed; patches are validated without completing fields', () => {
  const b = CORE_TEAMREADY_A.board
  assert.deepEqual([...b.fields], ['task', 'owner', 'due', 'dependency', 'status', 'rationale'])
  assert.ok(b.rows.every((r) => r.actorKind === 'TEMPLATE'))
  assert.equal(b.rows.filter((r) => r.owner === null).length, 2)
  assert.deepEqual(validateBoardPatch(CORE_TEAMREADY_A, { 'R2.owner': 'Priya', 'R3.due': 'Day 1 afternoon', 'R2.dependency': 'R3', 'R2.status': 'PLANNED', 'R2.rationale': 'Materials need the list first.' }), { ok: true, errors: [] })
  assert.equal(validateBoardPatch(CORE_TEAMREADY_A, { 'R2.owner': 'Nobody' }).ok, false)
  assert.equal(validateBoardPatch(CORE_TEAMREADY_A, { 'R9.owner': 'Priya' }).ok, false)
  assert.equal(validateBoardPatch(CORE_TEAMREADY_A, { 'R2.task': 'Something else' }).ok, false, 'task identity is not editable')
  assert.equal(validateBoardPatch(CORE_TEAMREADY_A, { 'R2.dependency': 'R2' }).ok, false)
  assert.equal(validateBoardPatch(CORE_TEAMREADY_A, { 'R2.status': 'MAYBE' }).ok, false)
})

test('P4.4: exemplars include the eight required kinds and several workable alternatives; the bank view carries nothing private', () => {
  const kinds = new Set(CORE_TEAMREADY_A.exemplars.map((e) => e.kind))
  for (const k of ['CONCISE_EFFECTIVE', 'VERBOSE_EMPTY', 'SPOKEN_PHRASING', 'NON_NATIVE_CONSTRUCTION', 'RESPECTFUL_REFUSAL', 'UNCERTAIN_CAREFUL', 'REPAIRED_MISTAKE']) assert.ok(kinds.has(k), k)
  assert.ok(CORE_TEAMREADY_A.exemplars.filter((e) => e.kind.startsWith('WORKABLE_ALTERNATIVE')).length >= 3)
  process.env.PRISM_DRAFT_CONTENT = 'true'
  try {
    const bank = draftBankScenarios()[CORE_TEAMREADY_A.id]
    assert.ok(bank)
    const raw = JSON.stringify(bank)
    for (const secret of ['anchors', 'rubric', 'opportunities', 'behaviourIds', 'conditionalFacts', 'exemplars', 'clarification']) assert.equal(raw.includes(secret), false, `bank view must not carry ${secret}`)
    assert.equal(bank.probingTree.turns.length, 6)
  } finally { delete process.env.PRISM_DRAFT_CONTENT }
  assert.deepEqual(draftBankScenarios(), {})
})
