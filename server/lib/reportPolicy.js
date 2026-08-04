// Charter §6 — composite (overall) score policy: profile-first external product.
//
// From MASTER-2026-08-04 onward, NEW reports never expose the composite on any
// external or ordinary-operational surface. The composite is still computed
// internally for research and calibration, but it lives under `report.composite`
// (an internal namespace) instead of `report.scores.overall`, and every serving
// boundary strips it. Access is restricted to the audited research plane
// (routes/pilot.js incident file, permission psychometrics:read).
//
// Legacy reports (issued before this policy) carry `scores.overall` inside
// their frozen blobs. They are IMMUTABLE and continue to render as originally
// issued — detection is structural: a report with `composite` is profile-first;
// a report with a numeric `scores.overall` and no `composite` is legacy.
//
// Charter §7.2 / §8 — evidence sufficiency: a dimension whose evidence floor
// was not met is reported as `Insufficient evidence` (score = null), never a
// fabricated number. The internal composite is then computed over the scored
// dimensions with renormalized weights and marked as such.

import { DIMENSION_KEYS, DIMENSION_WEIGHTS } from './sharedConstants.js'

export const REPORT_POLICY_VERSION = 'profile-first-v1'

function clampScore(n) {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

// The internal composite of a report, whatever its shape (research plane use).
export function compositeOf(report) {
  if (report && typeof report === 'object') {
    if (typeof report.composite?.value === 'number') return report.composite.value
    if (typeof report.scores?.overall === 'number') return report.scores.overall
  }
  return null
}

// True when this report was issued under the profile-first policy.
export function isProfileFirstReport(report) {
  return Boolean(report && typeof report === 'object' && 'composite' in report)
}

// Weighted composite over the NUMERIC dimension scores only, weights
// renormalized when a dimension is insufficient (null). Never invents a score
// for an unscored dimension.
export function computeInternalComposite(scores) {
  const scored = DIMENSION_KEYS.filter((k) => typeof scores?.[k] === 'number')
  if (!scored.length) return { value: null, basis: [], weightsRenormalized: false }
  const weightSum = scored.reduce((s, k) => s + DIMENSION_WEIGHTS[k], 0)
  const value = clampScore(
    scored.reduce((s, k) => s + scores[k] * DIMENSION_WEIGHTS[k], 0) / weightSum,
  )
  return { value, basis: scored, weightsRenormalized: scored.length !== DIMENSION_KEYS.length }
}

// Applies the issuance policy to a freshly scored report (MUTATES `report`):
//   1. §7.2/§8 — dimensions listed insufficient are nulled (never fabricated);
//   2. §6      — the composite moves from scores.overall to report.composite
//                (internal, research-only), together with the composite-derived
//                percentile and composite-level confidence interval;
//   3. the report is stamped with the policy version.
export function finalizeReportForIssuance(report, sufficiency = { insufficient: [], perDimension: {}, policyVersion: null }) {
  const insufficient = Array.isArray(sufficiency.insufficient) ? sufficiency.insufficient : []
  for (const dim of insufficient) {
    if (DIMENSION_KEYS.includes(dim)) report.scores[dim] = null
  }
  const composite = computeInternalComposite(report.scores)
  report.composite = {
    ...composite,
    // Composite-derived values are composite exposure — they move inside too.
    percentile: typeof report.percentile === 'number' ? report.percentile : null,
    confidenceInterval: report.confidenceInterval || null,
    access: 'research',
  }
  delete report.scores.overall
  delete report.percentile
  delete report.percentiles
  delete report.confidenceInterval
  report.insufficientEvidence = insufficient
  report.evidenceSufficiency = {
    policyVersion: sufficiency.policyVersion || null,
    perDimension: sufficiency.perDimension || {},
  }
  report.reportPolicy = REPORT_POLICY_VERSION
  return report
}

// External serving boundary (candidate / buyer / verify / email surfaces).
// Profile-first reports lose the internal composite namespace; LEGACY reports
// pass through BYTE-IDENTICAL — they render as originally issued (charter §6).
export function toExternalReport(report) {
  if (!isProfileFirstReport(report)) return report
  const { composite, ...external } = report
  return external
}

// Ordinary operational-admin serving boundary (charter §6: "Do not expose it
// through ordinary operational-admin views"). Unlike the external boundary,
// this strips the composite from EVERY shape, legacy included — the admin
// console is a live view, not an issued artifact. Research access goes through
// the audited psychometrics plane instead.
export function toOperationalReport(report) {
  if (!report || typeof report !== 'object') return report
  const clone = JSON.parse(JSON.stringify(report))
  delete clone.composite
  if (clone.scores && typeof clone.scores === 'object') delete clone.scores.overall
  delete clone.percentile
  delete clone.percentiles
  if (clone.correction && typeof clone.correction === 'object') delete clone.correction.previousOverall
  return clone
}
