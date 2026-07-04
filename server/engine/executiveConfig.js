// Prism v2 (MASA-2) — Phase 1 Executive Engine configuration & feature flags.
//
// Every v2 behavior ships behind a flag that DEFAULTS OFF so v1 stays
// reproducible. Phase 1 introduces the rubric-steered Executive Engine
// (Entry Estimator + EvidenceLedger + adaptive probe selection).
//
//   PRISM_V2_EXECUTIVE=true   master flag for the Phase 1 engine (default off)
//   PRISM_V2_EARLY_STOP=true  allow the adaptive stop rule to END a test early
//                             (default off — Phase 1 ships extend-only)
//   PRISM_MICRO_RATER_MODEL   optional override model for the per-turn rater
//
// When PRISM_V2_EXECUTIVE is off, none of the engine code runs and the existing
// director path (server/lib/director.js) drives the conversation unchanged.

export function isExecutiveEnabled() {
  return process.env.PRISM_V2_EXECUTIVE === 'true'
}

export function isEarlyStopEnabled() {
  return process.env.PRISM_V2_EARLY_STOP === 'true'
}

// ── Psychometric constants (single source of truth; mirrored in tests) ────────

// The five scored dimensions, in canonical order (front-loads higher weights).
export const DIMENSIONS = [
  'criticalThinking',
  'communication',
  'collaboration',
  'problemSolving',
  'aiDigitalFluency',
]

// Overall-score weights (must match sanitizeReport in assessment.js).
export const DIMENSION_WEIGHTS = {
  criticalThinking: 0.25,
  communication: 0.25,
  collaboration: 0.2,
  problemSolving: 0.2,
  aiDigitalFluency: 0.1,
}

// EvidenceLedger / theta update parameters.
export const LEDGER = {
  OBS_VARIANCE: 0.35, // per-rated-turn observation variance (precision weight)
  PRIOR_VARIANCE: 0.64, // θ₀ variance from the entry estimator (σ₀ ≈ 0.8)
  COVERAGE_TARGET: 3, // rated turns for full (1.0) coverage on a dimension
}

// Adaptive stop / extend rule thresholds.
export const STOP_RULE = {
  MIN_EXCHANGES: 6, // never evaluate the stop rule before this many turns
  THETA_VAR_STOP: 0.25, // stop early when θ variance falls below this (if early-stop on)
  COVERAGE_STOP: 0.6, // ...and every dimension's coverage is ≥ this
  COVERAGE_EXTEND: 0.4, // extend (extra probe) when any dimension is below this at the limit
  MAX_EXTENSIONS: 2, // hard cap on extra probes
}

// Facets a probe can target within a scenario (richer than the dimension alone).
// The selector rotates through un-probed facets so the conversation doesn't
// repeat the same angle. 'tradeoff' etc. are scenario-agnostic prompt hooks.
export const FACETS = ['first-step', 'cost', 'risk', 'people', 'metric', 'tradeoff']
