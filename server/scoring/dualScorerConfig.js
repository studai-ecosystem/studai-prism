// Prism v2 (MASA-2) — Phase 2 Dual-Channel Scorer configuration & flags.
//
// Scoring runs async post-submit. When PRISM_V2_DUAL_SCORER is OFF the existing
// v1 single-call / v1-lite panel scorer (assessment.js) produces the report
// unchanged. When ON, the dual-channel scorer runs:
//   Channel A — turn-level k-vote judge ensemble (modal level per dim)
//   Channel B — interpretable behavioral feature model (SHADOW until trained)
//   Reconciler — |A−B| > τ → re-evaluate → human-review queue
//   Conformal — calibrated CI printed on the report
//
//   PRISM_V2_DUAL_SCORER=true   master flag (default off)
//   PRISM_JUDGE_K_A             votes on judge model A (default 20)
//   PRISM_JUDGE_K_B             votes on judge model B (default 5)
//   PRISM_JUDGE_MODEL_B         optional 2nd-family model id (default = model A)
//   PRISM_CONSISTENCY_SAMPLE    fraction of turns to consistency-check (default 0.2)

export function isDualScorerEnabled() {
  return process.env.PRISM_V2_DUAL_SCORER === 'true'
}

export const DIMENSIONS = [
  'criticalThinking',
  'communication',
  'collaboration',
  'problemSolving',
  'aiDigitalFluency',
]

export const DIMENSION_WEIGHTS = {
  criticalThinking: 0.25,
  communication: 0.25,
  collaboration: 0.2,
  problemSolving: 0.2,
  aiDigitalFluency: 0.1,
}

export const SCORER = {
  K_A: Number(process.env.PRISM_JUDGE_K_A) || 20, // votes on model A
  K_B: Number(process.env.PRISM_JUDGE_K_B) || 5, // votes on model B (different family)
  TEMPERATURE: 0.7,
  CONSISTENCY_SAMPLE: Number(process.env.PRISM_CONSISTENCY_SAMPLE) || 0.2,
  CONSISTENCY_BAND: 1, // a modal-level shift > this band on re-judge => unstable
  RECONCILE_TAU: 12, // |channelA − channelB| (points) that triggers re-evaluation
  CI_MAX_WIDTH: 24, // conformal CI width (points) above which → human review
  CI_FALLBACK: 6, // provisional ± band until ≥30 human-rated pairs exist
  CI_MIN_PAIRS: 30, // calibration pairs needed before real conformal CI
  REVIEW_HOLD_HOURS: 24,
}

// Map a 0-4 level to a 0-100 dimension contribution.
export function levelToScore(level) {
  return Math.max(0, Math.min(100, (level / 4) * 100))
}
