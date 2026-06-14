// Prism v2 (MASA-2) — Phase 2 conformal prediction interval (pure functions).
//
// Split-conformal: given a calibration set of |panel − human| nonconformity
// scores, the (1−α) quantile is the CI half-width. Until ≥ CI_MIN_PAIRS pairs
// exist we return a provisional ± CI_FALLBACK band labelled 'provisional'.
//
// The CI is printed on the report (replaces the hardcoded ±3). Wide-CI sessions
// are exactly the ones routed to human review — fairness + quality in one knob.

import { SCORER } from './dualScorerConfig.js'

// Quantile (linear interpolation) of a numeric array at p∈[0,1].
export function quantile(sorted, p) {
  if (!sorted.length) return 0
  const a = [...sorted].sort((x, y) => x - y)
  const idx = (a.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return a[lo]
  return a[lo] + (a[hi] - a[lo]) * (idx - lo)
}

// Build a calibration table from (panel, human) score pairs.
//   pairs: [{ panel, human }]
// Returns { halfWidth, n, provisional } at 90% coverage.
export function buildConformal(pairs, coverage = 0.9) {
  const valid = (pairs || []).filter(
    (p) => Number.isFinite(p?.panel) && Number.isFinite(p?.human),
  )
  if (valid.length < SCORER.CI_MIN_PAIRS) {
    return { halfWidth: SCORER.CI_FALLBACK, n: valid.length, provisional: true }
  }
  const nonconf = valid.map((p) => Math.abs(p.panel - p.human))
  const half = quantile(nonconf, coverage)
  return { halfWidth: Math.round(half), n: valid.length, provisional: false }
}

// Produce the CI for a session's overall score from a conformal table.
export function intervalFor(overall, conformal) {
  const h = conformal?.halfWidth ?? SCORER.CI_FALLBACK
  return {
    point: Math.round(overall),
    low: Math.max(0, Math.round(overall - h)),
    high: Math.min(100, Math.round(overall + h)),
    halfWidth: h,
    provisional: Boolean(conformal?.provisional),
    coverage: 0.9,
  }
}

// Is this CI wide enough to warrant a human look?
export function ciNeedsReview(ci) {
  return (ci?.high - ci?.low) > SCORER.CI_MAX_WIDTH
}
