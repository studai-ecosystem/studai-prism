// Prism v2 (MASA-2) — Phase 1 Adaptive Entry Estimator.
//
// Replaces the v1 tier bucket with a continuous Bayesian PRIOR ability estimate
// θ₀ ~ N(μ₀, σ₀²) on a standardized scale (population mean 0, SD 1). The writing
// sample is scored on 4 micro-anchors (0–3 each, sum 0–12) which maps LINEARLY
// to μ₀ ∈ [-1.2, +1.2]; σ₀² is wide on purpose (0.64 ≈ SD 0.8) because the
// conversation — not the writing sample — is the real measurement.
//
// A legacy `tier` label is still returned so v1 scenario selection keeps working
// until IRT difficulty exists. The heuristic fallback never blocks the flow.

import { LEDGER, DIMENSIONS } from './executiveConfig.js'

const ANCHORS = ['structure', 'specificity', 'reasoning', 'self_reflection']
const ANCHOR_MAX = 3
const SUM_MAX = ANCHORS.length * ANCHOR_MAX // 12

// Map the 0–12 rubric sum linearly onto μ₀ ∈ [-1.2, +1.2].
export function sumToTheta(sum) {
  const clamped = Math.max(0, Math.min(SUM_MAX, Number(sum) || 0))
  const mean = (clamped / SUM_MAX) * 2.4 - 1.2
  return { theta0_mean: +mean.toFixed(4), theta0_var: LEDGER.PRIOR_VARIANCE }
}

// θ mean → legacy tier label (keeps v1 scenario picker working).
export function thetaToTier(mean) {
  if (mean >= 0.5) return 'advanced'
  if (mean >= -0.4) return 'intermediate'
  return 'foundational'
}

// Heuristic prior from raw text — used when no AI keys / the rater fails.
// Mirrors the v1 heuristicTier signals but emits a continuous θ.
export function heuristicTheta(answer) {
  const text = String(answer || '').trim()
  const words = text ? text.split(/\s+/).length : 0
  const sentences = (text.match(/[.!?]+/g) || []).length
  const reflective = /\b(because|however|although|therefore|trade[- ]?off|consider|reflect|in hindsight|would have|learned|alternativ)/i.test(text)
  let sum = 0
  if (words >= 40) sum += 3
  if (words >= 80) sum += 2
  if (sentences >= 3) sum += 3
  if (reflective) sum += 4
  const { theta0_mean } = sumToTheta(sum)
  // Heuristic priors are weaker → keep the wide default variance.
  return { theta0_mean, theta0_var: LEDGER.PRIOR_VARIANCE, gradedBy: 'heuristic' }
}

// Combine the four 0–3 anchor scores into a θ prior.
export function anchorsToTheta(anchors) {
  let sum = 0
  for (const a of ANCHORS) {
    const v = Math.max(0, Math.min(ANCHOR_MAX, Math.round(Number(anchors?.[a]) || 0)))
    sum += v
  }
  const { theta0_mean, theta0_var } = sumToTheta(sum)
  return { theta0_mean, theta0_var, gradedBy: 'ai', anchorSum: sum }
}

export { ANCHORS, DIMENSIONS }
