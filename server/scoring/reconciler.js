// Prism v2 (MASA-2) — Phase 2 reconciler (pure decision logic).
//
// Compares Channel A (panel) vs a reference (Channel B once trained, else the
// v1 single-call score running in shadow). Decides whether the report can be
// released, needs a re-evaluation pass, or must go to the human-review queue.

import { DIMENSIONS, SCORER } from './dualScorerConfig.js'

// Largest absolute per-dimension gap between two score maps.
export function maxDimensionGap(a, b) {
  let max = 0
  let dim = null
  for (const d of DIMENSIONS) {
    const av = Number(a?.[d])
    const bv = Number(b?.[d])
    if (!Number.isFinite(av) || !Number.isFinite(bv)) continue
    const gap = Math.abs(av - bv)
    if (gap > max) { max = gap; dim = d }
  }
  return { gap: max, dimension: dim }
}

// Decide reliability + next action.
//   panelScores  — Channel A dimension scores (authoritative)
//   refScores    — reference scores (v1 shadow or Channel B)
//   ci           — conformal interval for the overall score
//   opts.reevaluated — true if this is already the re-evaluation pass
//   opts.unstableTurns — count of turns dropped for instability
// Returns { reliability, action, reason, gap }.
//   reliability: 'Strong' | 'Standard' | 'Reviewed'
//   action: 'release' | 'reevaluate' | 'human_review'
export function reconcile(panelScores, refScores, ci, opts = {}) {
  const { gap, dimension } = maxDimensionGap(panelScores, refScores)
  const wideCI = ci && (ci.high - ci.low) > SCORER.CI_MAX_WIDTH

  // First pass with a big disagreement → run one re-evaluation.
  if (gap > SCORER.RECONCILE_TAU && !opts.reevaluated) {
    return { reliability: 'Reviewed', action: 'reevaluate', reason: 'dimension_disagreement', gap, dimension }
  }

  // Still divergent after re-eval, OR the CI is too wide → human review.
  if ((gap > SCORER.RECONCILE_TAU && opts.reevaluated) || wideCI) {
    return {
      reliability: 'Reviewed',
      action: 'human_review',
      reason: wideCI ? 'wide_confidence_interval' : 'persistent_disagreement',
      gap,
      dimension,
    }
  }

  // Clean agreement + tight CI. "Strong" when no instability was seen.
  const reliability = (opts.unstableTurns || 0) === 0 && !ci?.provisional ? 'Strong' : 'Standard'
  return { reliability, action: 'release', reason: 'agreement', gap, dimension }
}
