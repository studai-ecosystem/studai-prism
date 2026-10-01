// Capability sufficiency rules (spec §33.2). One config for every capability;
// values are PROVISIONAL until measurement governance approves them (HA-C002).
// `calibration_state: 'UNCALIBRATED'` caps every capability at PROVISIONAL.

export const SUFFICIENCY_RULES_VERSION = 'sufficiency-rules.v1-provisional'

export const DEFAULT_SUFFICIENCY_RULES = Object.freeze({
  minimum_evidence_units: 3,
  minimum_independent_opportunities: 2,
  required_anchor_coverage: 1,
  minimum_judge_agreement: 0.7,
  minimum_evidence_quality: 'JUDGED_WITH_PROVENANCE',
  calibration_state: 'UNCALIBRATED',
  human_review_requirement: 'ON_DISAGREEMENT',
  approval_status: 'PROVISIONAL',
})

// Per-capability overrides (none approved yet). Keys are capability ids.
export const CAPABILITY_RULE_OVERRIDES = Object.freeze({})

// Floors no override or caller may go below (spec §33.2: two rows alone are
// never sufficient).
export const RULE_FLOORS = Object.freeze({ minimum_evidence_units: 3, minimum_independent_opportunities: 2 })

export function withFloors(rules) {
  const out = { ...rules }
  for (const [k, floor] of Object.entries(RULE_FLOORS)) {
    const v = Number(out[k])
    out[k] = Number.isFinite(v) ? Math.max(floor, v) : floor
  }
  return out
}

export function rulesFor(capabilityId, overrides = CAPABILITY_RULE_OVERRIDES) {
  return withFloors({ ...DEFAULT_SUFFICIENCY_RULES, ...(overrides[capabilityId] || {}) })
}
