// Capability sufficiency engine (spec §33.2). Pure and deterministic:
// evaluateCapability(units, rules) never reads clocks, randomness or I/O.
// Two rows alone never produce SUFFICIENT; missing evidence is reported as
// INSUFFICIENT_EVIDENCE with the reasons that name the unmet rule.
import { DEFAULT_SUFFICIENCY_RULES, SUFFICIENCY_RULES_VERSION, rulesFor, withFloors } from './sufficiencyRules.js'
import { bandForRubricLevel } from './levels.js'

const ELIGIBLE = new Set(['SUFFICIENT', 'PROVISIONAL'])

function median(values) {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function opportunityKey(u) {
  if (u.source_turn != null) return `turn:${u.source_turn}`
  if (u.source_artifact_id) return `artifact:${u.source_artifact_id}`
  return `unit:${u.evidence_id}`
}

export function evaluateCapability(units = [], rawRules = DEFAULT_SUFFICIENCY_RULES, capabilityId = units[0]?.capability_id ?? null) {
  const rules = withFloors(rawRules)
  const considered = units.filter((u) => !capabilityId || u.capability_id === capabilityId)
  const eligible = considered.filter((u) =>
    ELIGIBLE.has(u.evidence_status)
    && Number.isFinite(u.rubric_level)
    && u.candidate_action_json
    && u.provenance_json)
  const needsReview = considered.filter((u) => u.evidence_status === 'HUMAN_REVIEW_REQUIRED')
  const reasons = []

  const opportunities = new Set(eligible.map(opportunityKey)).size
  const anchorCoverage = new Set(eligible.map((u) => u.behavior_anchor_id).filter(Boolean)).size
  const agreements = eligible.map((u) => u.judge_agreement_json?.agreement).filter((a) => Number.isFinite(a))
  const meanAgreement = agreements.length ? agreements.reduce((a, b) => a + b, 0) / agreements.length : null

  const base = {
    capabilityId,
    unitIds: eligible.map((u) => u.evidence_id),
    consideredUnitIds: considered.map((u) => u.evidence_id),
    opportunities,
    anchorCoverage,
    meanAgreement,
    rulesVersion: SUFFICIENCY_RULES_VERSION,
  }

  if (needsReview.length > 0 && rules.human_review_requirement !== 'NEVER') {
    return { ...base, status: 'HUMAN_REVIEW_REQUIRED', reasons: ['JUDGE_DISAGREEMENT_PENDING_REVIEW'], level: null }
  }
  if (eligible.length === 0) {
    reasons.push(considered.length === 0 ? 'NO_EVIDENCE' : 'NO_ADMISSIBLE_EVIDENCE')
    return { ...base, status: 'INSUFFICIENT_EVIDENCE', reasons, level: null }
  }

  if (eligible.length < rules.minimum_evidence_units) reasons.push('BELOW_MINIMUM_EVIDENCE_UNITS')
  if (opportunities < rules.minimum_independent_opportunities) reasons.push('BELOW_MINIMUM_INDEPENDENT_OPPORTUNITIES')
  if (reasons.length > 0) {
    return { ...base, status: 'INSUFFICIENT_EVIDENCE', reasons, level: null }
  }

  const provisionalReasons = []
  if (anchorCoverage < rules.required_anchor_coverage) provisionalReasons.push('BELOW_REQUIRED_ANCHOR_COVERAGE')
  if (meanAgreement === null) provisionalReasons.push('NO_JUDGE_AGREEMENT')
  else if (meanAgreement < rules.minimum_judge_agreement) provisionalReasons.push('BELOW_MINIMUM_JUDGE_AGREEMENT')
  if (eligible.some((u) => u.legacy_row)) provisionalReasons.push('INCLUDES_LEGACY_EVIDENCE')
  if (eligible.some((u) => u.evidence_status === 'PROVISIONAL')) provisionalReasons.push('INCLUDES_PROVISIONAL_UNITS')
  if (rules.calibration_state !== 'CALIBRATED') provisionalReasons.push('RUBRIC_NOT_CALIBRATED')
  if (rules.approval_status !== 'APPROVED') provisionalReasons.push('RULES_NOT_APPROVED')

  const rubricMedian = median(eligible.map((u) => u.rubric_level))
  const band = bandForRubricLevel(rubricMedian)
  const level = { band: band.band, label: band.label, rubricMedian }

  if (provisionalReasons.length > 0) {
    return { ...base, status: 'PROVISIONAL', reasons: provisionalReasons, level }
  }
  return { ...base, status: 'SUFFICIENT', reasons: [], level }
}

// Evaluate every capability present in `units`, plus any named in
// `capabilityIds` (those with no units come back INSUFFICIENT_EVIDENCE).
export function evaluateProfile(units = [], { capabilityIds = [], rulesForCapability = rulesFor } = {}) {
  const ids = new Set([...capabilityIds, ...units.map((u) => u.capability_id)])
  const out = {}
  for (const id of [...ids].sort()) {
    out[id] = evaluateCapability(units.filter((u) => u.capability_id === id), rulesForCapability(id), id)
  }
  return out
}
