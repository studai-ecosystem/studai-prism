// Track 1 — Skill Velocity (flag PRISM_VELOCITY, default OFF).
//
// Growth measurement on the candidate timeline. Model, assumptions, and the
// exact N/threshold rules enforced here are documented in
// server/psychometrics/GROWTH.md — keep the two in sync.
//
// HONESTY RULES (gate-enforced):
//   * >=3 measurement points AND |slope| > Z * SE(slope) before ANY growth
//     statement. 2 points = show both scores + "trend after next assessment".
//     1 point = no trend language at all. Never extrapolate.
//   * Scores are only comparable on the same scale_version (or with an
//     equating transform on record — none exist yet). Mixed scales render
//     "not directly comparable", never a trend (T1.4).

import { DIMENSION_KEYS } from './sharedConstants.js'

export function isVelocityEnabled() {
  return process.env.PRISM_VELOCITY === 'true'
}

export const TREND_Z = 1.96 // two-sided 95% — documented in GROWTH.md
export const MIN_POINTS_FOR_TREND = 3
export const COHORT_MIN_FOR_PERCENTILE = 20 // growth percentiles need cohort N (python job)

// ── θ extraction (T1.1) ──────────────────────────────────────────────────────
// Per-dimension θ (+SE) for one completed assessment.
//   Executive sessions: EvidenceLedger posterior (theta.mean/var) is the
//   overall; per-dimension θ maps the dimension score onto the level scale.
//   v1 panel sessions: dimension score/25 → level-scale θ; SE from the
//   panel's per-dimension vote dispersion (reliability.perDimensionBand/25),
//   floored so a lucky unanimous panel never claims impossible precision.
const SE_FLOOR = 0.25 // level-scale units; documented in GROWTH.md
const SE_DEFAULT = 0.6 // no dispersion info at all

export function thetaFromReport(report) {
  const scores = report?.scores || {}
  const band = report?.reliability?.perDimensionBand || {}
  const dimensions = {}
  for (const dim of DIMENSION_KEYS) {
    const score = Number(scores[dim])
    if (!Number.isFinite(score)) continue
    const theta = +(score / 25).toFixed(3) // 0-100 → 0-4 level scale
    const dispersion = Number(band[dim])
    const se = Number.isFinite(dispersion)
      ? +Math.max(SE_FLOOR, dispersion / 25).toFixed(3)
      : SE_DEFAULT
    dimensions[dim] = { theta, se }
  }
  let overall
  if (report?.theta && Number.isFinite(report.theta.mean)) {
    // Executive posterior (already on the level scale).
    overall = { theta: +Number(report.theta.mean).toFixed(3), se: +Math.sqrt(Math.max(report.theta.var || 0, SE_FLOOR ** 2)).toFixed(3) }
  } else if (Number.isFinite(Number(scores.overall))) {
    const ses = Object.values(dimensions).map((d) => d.se)
    const meanSe = ses.length ? ses.reduce((s, v) => s + v, 0) / ses.length : SE_DEFAULT
    overall = { theta: +(Number(scores.overall) / 25).toFixed(3), se: +meanSe.toFixed(3) }
  } else {
    return null
  }
  return {
    overall,
    dimensions,
    source: report?.theta ? 'ledger' : 'panel',
  }
}

// ── growth fit (T1.2, mirrored by calibration/jobs/growth_curve.py) ──────────
// Measurement-error-weighted linear fit: weight_i = 1/se_i². Returns
// { slope, slopeSe, intercept, n } on the level scale per attempt.
export function growthFit(points) {
  const pts = (Array.isArray(points) ? points : [])
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.theta) && Number.isFinite(p?.se) && p.se > 0)
  if (pts.length < 2) return null
  const w = pts.map((p) => 1 / (p.se * p.se))
  const W = w.reduce((s, v) => s + v, 0)
  const mx = pts.reduce((s, p, i) => s + w[i] * p.x, 0) / W
  const my = pts.reduce((s, p, i) => s + w[i] * p.theta, 0) / W
  const sxx = pts.reduce((s, p, i) => s + w[i] * (p.x - mx) ** 2, 0)
  if (sxx <= 0) return null
  const sxy = pts.reduce((s, p, i) => s + w[i] * (p.x - mx) * (p.theta - my), 0)
  const slope = sxy / sxx
  const slopeSe = Math.sqrt(1 / sxx)
  return { slope: +slope.toFixed(4), slopeSe: +slopeSe.toFixed(4), intercept: +(my - slope * mx).toFixed(4), n: pts.length }
}

// ── trend decision (T1.3 + T1.4) ─────────────────────────────────────────────
// entries: [{attemptNo, scaleVersion, theta, se}] ordered by attempt.
// equatingTransforms: map 'fromScale->toScale' → fn (none exist yet — the
// parameter exists so the guard logic is testable).
export function trendDecision(entries, { z = TREND_Z, equatingTransforms = {} } = {}) {
  const pts = (Array.isArray(entries) ? entries : []).filter((e) => Number.isFinite(e?.theta))
  if (pts.length === 0) return { state: 'none' }
  // T1.4: hard equating guard — all compared scores must share a scale_version
  // or have a transform on record. Otherwise: not comparable, never a trend.
  const scales = [...new Set(pts.map((p) => p.scaleVersion || 'unknown'))]
  if (scales.length > 1) {
    const base = scales[0]
    const transformable = scales.slice(1).every((s) => equatingTransforms[`${s}->${base}`])
    if (!transformable) {
      return { state: 'not_comparable', scales, message: 'Scores span different reporting scales with no equating transform on record — shown separately, not as a trend.' }
    }
  }
  if (pts.length === 1) {
    return { state: 'single', message: 'One measurement point — no trend is possible from a single assessment.' }
  }
  if (pts.length < MIN_POINTS_FOR_TREND) {
    return { state: 'need_more', message: 'Trend available after your next assessment.' }
  }
  const fit = growthFit(pts.map((p) => ({ x: p.attemptNo, theta: p.theta, se: p.se || SE_DEFAULT })))
  if (!fit) return { state: 'need_more', message: 'Trend available after your next assessment.' }
  const distinguishable = Math.abs(fit.slope) > z * fit.slopeSe
  return {
    state: distinguishable ? 'trend' : 'flat',
    fit,
    z,
    message: distinguishable
      ? `Growth of ${fit.slope > 0 ? '+' : ''}${fit.slope} levels/attempt (SE ${fit.slopeSe}) — distinguishable from zero at the ${z}-sigma threshold.`
      : 'No growth distinguishable from zero yet — the trajectory is within measurement uncertainty.',
  }
}

// ── velocity view (T1.3) ─────────────────────────────────────────────────────
// timelineRows: assessment_timeline rows (attempt_no, scale_version,
// final_theta, completed_at, is_synthetic). Renders trajectory + per-dimension
// decisions. Candidate-facing: their own points always render; trend honesty
// rules apply per dimension AND overall.
export function velocityView(timelineRows) {
  const rows = (Array.isArray(timelineRows) ? timelineRows : [])
    .filter((r) => r?.final_theta)
    .sort((a, b) => (a.attempt_no || 0) - (b.attempt_no || 0))
  const attempts = rows.map((r) => ({
    attemptNo: r.attempt_no,
    completedAt: r.completed_at,
    scaleVersion: r.scale_version,
    isSynthetic: r.is_synthetic === true,
    overall: r.final_theta.overall || null,
    dimensions: r.final_theta.dimensions || {},
  }))
  const series = (pick) => attempts
    .map((a) => {
      const point = pick(a)
      return point ? { attemptNo: a.attemptNo, scaleVersion: a.scaleVersion, theta: point.theta, se: point.se } : null
    })
    .filter(Boolean)
  const overallEntries = series((a) => a.overall)
  const view = {
    practice: false,
    attempts,
    overall: { points: overallEntries, decision: trendDecision(overallEntries) },
    dimensions: {},
    note: 'Growth is stated only from three or more equated measurement points with a slope distinguishable from zero (see GROWTH.md).',
  }
  for (const dim of DIMENSION_KEYS) {
    const entries = series((a) => a.dimensions[dim])
    view.dimensions[dim] = { points: entries, decision: trendDecision(entries) }
  }
  return view
}
