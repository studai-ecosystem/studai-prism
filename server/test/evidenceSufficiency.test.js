// Prism Campus C2.02/C2.03 — strict evidence units + capability sufficiency engine.
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEvidenceUnit, readEvidenceRow, EvidenceValidationError } from '../domain/evidence/evidenceUnit.js'
import { evaluateCapability, evaluateProfile } from '../domain/evidence/sufficiency.js'
import { DEFAULT_SUFFICIENCY_RULES, rulesFor } from '../domain/evidence/sufficiencyRules.js'
import { CAPABILITY_LEVELS, bandForRubricLevel } from '../domain/evidence/levels.js'

const CAP = 'CAP-L1-REASONING'
const fixedNow = () => new Date('2026-09-25T00:00:00Z')
let seq = 0
const idFactory = () => `evid-test-${++seq}`

function unit(overrides = {}) {
  return normalizeEvidenceUnit({
    session_id: 'sess-1',
    capability_id: CAP,
    source_type: 'DIALOGUE_TURN',
    source_turn: 1,
    behavior_anchor_id: 'ANCHOR-1',
    candidate_action: { dialogue_excerpt: 'I would compare the two options first.' },
    provenance: { source: 'JUDGE_PANEL', promptVersion: 'judge.v1' },
    rubric_level: 3,
    judge_agreement: { agreement: 0.9, samples: 3 },
    ...overrides,
  }, { now: fixedNow, idFactory }).unit
}

test('evidence unit: missing candidate action → INSUFFICIENT_EVIDENCE, level and label forced null', () => {
  const { unit: u, reasons } = normalizeEvidenceUnit({ session_id: 's', capability_id: CAP, rubric_level: 4, rubric_label: 'Advanced', provenance: { source: 'x' } }, { now: fixedNow, idFactory })
  assert.equal(u.evidence_status, 'INSUFFICIENT_EVIDENCE')
  assert.equal(u.rubric_level, null)
  assert.equal(u.rubric_label, null)
  assert.ok(reasons.includes('MISSING_CANDIDATE_ACTION'))
})

test('evidence unit: missing provenance → INSUFFICIENT_EVIDENCE', () => {
  const { unit: u, reasons } = normalizeEvidenceUnit({ session_id: 's', capability_id: CAP, rubric_level: 4, candidate_action: { a: 1 } }, { now: fixedNow, idFactory })
  assert.equal(u.evidence_status, 'INSUFFICIENT_EVIDENCE')
  assert.equal(u.rubric_level, null)
  assert.ok(reasons.includes('MISSING_PROVENANCE'))
})

test('evidence unit: nothing is defaulted (behaviour, label, agreement, blueprint, layer, turn)', () => {
  const { unit: u } = normalizeEvidenceUnit({ session_id: 's', capability_id: CAP }, { now: fixedNow, idFactory })
  for (const k of ['observable_behavior', 'rubric_level', 'rubric_label', 'judge_agreement_json', 'blueprint_id', 'capability_layer', 'source_turn', 'human_review_status']) {
    assert.equal(u[k], null, `${k} is not defaulted`)
  }
  assert.equal(u.evidence_status, 'INSUFFICIENT_EVIDENCE')
})

test('evidence unit: action + provenance but not judged → INSUFFICIENT (NOT_JUDGED)', () => {
  const u = unit({ rubric_level: null, judge_agreement: null })
  assert.equal(u.evidence_status, 'INSUFFICIENT_EVIDENCE')
  assert.ok(u.status_reasons.includes('NOT_JUDGED'))
})

test('evidence unit: judged without agreement → PROVISIONAL; low agreement → HUMAN_REVIEW_REQUIRED; good → SUFFICIENT', () => {
  assert.equal(unit({ judge_agreement: null }).evidence_status, 'PROVISIONAL')
  const low = unit({ judge_agreement: { agreement: 0.4 } })
  assert.equal(low.evidence_status, 'HUMAN_REVIEW_REQUIRED')
  assert.equal(low.human_review_status, 'REQUIRED')
  assert.equal(unit().evidence_status, 'SUFFICIENT')
  assert.equal(unit({ human_review_status: 'REQUIRED' }).evidence_status, 'HUMAN_REVIEW_REQUIRED')
})

test('evidence unit: invalid input is rejected, never coerced', () => {
  assert.throws(() => normalizeEvidenceUnit({ capability_id: CAP }), EvidenceValidationError)
  assert.throws(() => normalizeEvidenceUnit({ session_id: 's', capability_id: CAP, rubric_level: 7 }), EvidenceValidationError)
  assert.throws(() => normalizeEvidenceUnit({ session_id: 's', capability_id: CAP, rubric_level: 2.5 }), EvidenceValidationError)
})

test('legacy adapter: a pre-0025 row is at most PROVISIONAL and its defaulted verification is named', () => {
  const legacy = readEvidenceRow({
    evidence_id: 'old-1', session_id: 's', capability_id: CAP, source_turn: 2, rubric_level: 3, rubric_label: 'Competent',
    confidence_status: 'VERIFIED_CONSENSUS', candidate_action: {}, provenance: { timestamp: 't' }, judge_agreement: { unanimous: true }, legacy_row: true,
  })
  assert.equal(legacy.evidence_status, 'PROVISIONAL')
  assert.equal(legacy.judge_agreement_json, null, 'defaulted agreement is not trusted')
  assert.equal(legacy.candidate_action_json, null, 'empty legacy action is treated as missing')
  assert.ok(legacy.status_reasons.includes('LEGACY_DEFAULTED_VERIFICATION'))
})

// ── Sufficiency engine ──────────────────────────────────────────────────────

test('sufficiency: no units → INSUFFICIENT_EVIDENCE (NO_EVIDENCE), no level', () => {
  const d = evaluateCapability([], DEFAULT_SUFFICIENCY_RULES, CAP)
  assert.equal(d.status, 'INSUFFICIENT_EVIDENCE')
  assert.deepEqual(d.reasons, ['NO_EVIDENCE'])
  assert.equal(d.level, null)
})

test('sufficiency: only inadmissible units → INSUFFICIENT (NO_ADMISSIBLE_EVIDENCE)', () => {
  const d = evaluateCapability([unit({ rubric_level: null }), unit({ provenance: null })])
  assert.equal(d.status, 'INSUFFICIENT_EVIDENCE')
  assert.deepEqual(d.reasons, ['NO_ADMISSIBLE_EVIDENCE'])
})

test('sufficiency: two rows alone never produce SUFFICIENT (even with calibrated, approved rules)', () => {
  const rules = { ...DEFAULT_SUFFICIENCY_RULES, calibration_state: 'CALIBRATED', approval_status: 'APPROVED' }
  const d = evaluateCapability([unit({ source_turn: 1 }), unit({ source_turn: 2 })], rules)
  assert.notEqual(d.status, 'SUFFICIENT')
  assert.ok(d.reasons.includes('BELOW_MINIMUM_EVIDENCE_UNITS'))
})

test('sufficiency: thresholds cannot be configured below the floors', () => {
  const lax = { ...DEFAULT_SUFFICIENCY_RULES, calibration_state: 'CALIBRATED', approval_status: 'APPROVED', minimum_evidence_units: 1, minimum_independent_opportunities: 1 }
  const d = evaluateCapability([unit({ source_turn: 1 }), unit({ source_turn: 2 })], lax)
  assert.notEqual(d.status, 'SUFFICIENT')
  assert.ok(d.reasons.includes('BELOW_MINIMUM_EVIDENCE_UNITS'))
  assert.equal(rulesFor('ANY', { ANY: { minimum_evidence_units: 2 } }).minimum_evidence_units, 3)
})

test('sufficiency: below the independent-opportunity threshold names that rule', () => {
  const d = evaluateCapability([unit({ source_turn: 1 }), unit({ source_turn: 1 }), unit({ source_turn: 1 })])
  assert.equal(d.status, 'INSUFFICIENT_EVIDENCE')
  assert.deepEqual(d.reasons, ['BELOW_MINIMUM_INDEPENDENT_OPPORTUNITIES'])
  assert.equal(d.opportunities, 1)
})

test('sufficiency: any unit needing review → HUMAN_REVIEW_REQUIRED, no level', () => {
  const d = evaluateCapability([unit({ source_turn: 1 }), unit({ source_turn: 2 }), unit({ source_turn: 3, judge_agreement: { agreement: 0.3 } })])
  assert.equal(d.status, 'HUMAN_REVIEW_REQUIRED')
  assert.equal(d.level, null)
})

test('sufficiency: thresholds met but rules uncalibrated/unapproved → PROVISIONAL with named reasons', () => {
  const d = evaluateCapability([unit({ source_turn: 1 }), unit({ source_turn: 2 }), unit({ source_turn: 3, rubric_level: 4 })])
  assert.equal(d.status, 'PROVISIONAL')
  assert.ok(d.reasons.includes('RUBRIC_NOT_CALIBRATED'))
  assert.ok(d.reasons.includes('RULES_NOT_APPROVED'))
  assert.equal(d.level.band, 'DEVELOPING')
  assert.equal(d.level.rubricMedian, 3)
})

test('sufficiency: missing anchors / agreement / provisional units each keep it PROVISIONAL', () => {
  const rules = { ...DEFAULT_SUFFICIENCY_RULES, calibration_state: 'CALIBRATED', approval_status: 'APPROVED' }
  const noAnchor = evaluateCapability([1, 2, 3].map((t) => unit({ source_turn: t, behavior_anchor_id: null })), rules)
  assert.deepEqual(noAnchor.reasons, ['BELOW_REQUIRED_ANCHOR_COVERAGE'])
  const noAgreement = evaluateCapability([1, 2, 3].map((t) => unit({ source_turn: t, judge_agreement: null })), rules)
  assert.ok(noAgreement.reasons.includes('NO_JUDGE_AGREEMENT'))
  assert.ok(noAgreement.reasons.includes('INCLUDES_PROVISIONAL_UNITS'))
})

test('sufficiency: legacy rows cap a capability at PROVISIONAL', () => {
  const rules = { ...DEFAULT_SUFFICIENCY_RULES, calibration_state: 'CALIBRATED', approval_status: 'APPROVED' }
  const units = [unit({ source_turn: 1 }), unit({ source_turn: 2 }), { ...unit({ source_turn: 3 }), legacy_row: true }]
  const d = evaluateCapability(units, rules)
  assert.equal(d.status, 'PROVISIONAL')
  assert.ok(d.reasons.includes('INCLUDES_LEGACY_EVIDENCE'))
})

test('sufficiency: SUFFICIENT only when every rule is met, rules calibrated and approved', () => {
  const rules = { ...DEFAULT_SUFFICIENCY_RULES, calibration_state: 'CALIBRATED', approval_status: 'APPROVED' }
  const d = evaluateCapability([1, 2, 3].map((t) => unit({ source_turn: t, rubric_level: 5 })), rules)
  assert.equal(d.status, 'SUFFICIENT')
  assert.deepEqual(d.reasons, [])
  assert.equal(d.level.band, 'STRONG')
  assert.equal(d.unitIds.length, 3)
})

test('sufficiency: deterministic — same input, same output, order independent', () => {
  const units = [unit({ source_turn: 3 }), unit({ source_turn: 1 }), unit({ source_turn: 2 })]
  const a = evaluateCapability(units)
  const b = evaluateCapability([...units].reverse())
  assert.deepEqual({ ...a, unitIds: [...a.unitIds].sort(), consideredUnitIds: [] }, { ...b, unitIds: [...b.unitIds].sort(), consideredUnitIds: [] })
  assert.deepEqual(evaluateCapability(units), a)
})

test('sufficiency: evaluateProfile covers named capabilities with no units as INSUFFICIENT', () => {
  const p = evaluateProfile([unit()], { capabilityIds: ['CAP-L1-COMMUNICATION'] })
  assert.equal(p['CAP-L1-COMMUNICATION'].status, 'INSUFFICIENT_EVIDENCE')
  assert.ok(p[CAP])
})

test('levels: provisional label vocabulary and rubric → band mapping', () => {
  assert.deepEqual(CAPABILITY_LEVELS.map((l) => l.label), ['Insufficient evidence', 'Early evidence', 'Developing', 'Demonstrated', 'Strongly demonstrated'])
  assert.equal(bandForRubricLevel(NaN).band, 'INSUFFICIENT')
  assert.equal(bandForRubricLevel(1).band, 'EARLY')
  assert.equal(bandForRubricLevel(3).band, 'DEVELOPING')
  assert.equal(bandForRubricLevel(4).band, 'DEMONSTRATED')
  assert.equal(bandForRubricLevel(5).band, 'STRONG')
})
