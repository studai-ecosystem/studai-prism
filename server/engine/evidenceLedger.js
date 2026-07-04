// Prism v2 (MASA-2) — Phase 1 EvidenceLedger.
//
// A server-side running record of how much usable skill-evidence a candidate
// has produced per dimension, plus a Bayesian ability estimate θ that tightens
// every rated turn. It is the input to the adaptive probe selector and the
// adaptive stop rule.
//
// θ update (precision-weighted Gaussian, per rated turn):
//   a rated level L∈{0..4} becomes an observation y = (L/4)*2 - 1 ∈ [-1, +1]
//   with observation variance σ²_obs (LEDGER.OBS_VARIANCE).
//     var'  = 1 / (1/var + 1/σ²_obs)
//     mean' = var' * (mean/var + y/σ²_obs)
// "NA" levels contribute no evidence and do not move θ.
//
// coverage(dim) = min(1, evidence_count(dim) / COVERAGE_TARGET).

import { DIMENSIONS, LEDGER } from './executiveConfig.js'

function emptyDims() {
  const d = {}
  for (const dim of DIMENSIONS) d[dim] = { evidence_count: 0, last_quality: null, coverage: 0, anchors_hit: [] }
  return d
}

export class EvidenceLedger {
  // prior: { theta0_mean, theta0_var } from the entry estimator.
  constructor(prior = {}) {
    this.dimensions = emptyDims()
    this.theta = {
      mean: Number.isFinite(prior.theta0_mean) ? prior.theta0_mean : 0,
      var: Number.isFinite(prior.theta0_var) ? prior.theta0_var : LEDGER.PRIOR_VARIANCE,
    }
    this.exchange_count = 0
  }

  // Rehydrate a ledger from a persisted plain object (session cache / store).
  static from(obj) {
    const l = new EvidenceLedger()
    if (obj && typeof obj === 'object') {
      l.dimensions = { ...emptyDims(), ...(obj.dimensions || {}) }
      if (obj.theta && Number.isFinite(obj.theta.mean) && Number.isFinite(obj.theta.var)) {
        l.theta = { mean: obj.theta.mean, var: obj.theta.var }
      }
      l.exchange_count = Number.isFinite(obj.exchange_count) ? obj.exchange_count : 0
    }
    return l
  }

  // Map a 0-4 level onto a standardized observation in [-1, +1].
  static levelToObservation(level) {
    return (level / 4) * 2 - 1
  }

  // Single precision-weighted Gaussian update of θ from one observation.
  _updateTheta(y) {
    const obsVar = LEDGER.OBS_VARIANCE
    const newVar = 1 / (1 / this.theta.var + 1 / obsVar)
    const newMean = newVar * (this.theta.mean / this.theta.var + y / obsVar)
    this.theta = { mean: +newMean.toFixed(6), var: +newVar.toFixed(6) }
  }

  // Fold one turn's micro-rating levels ({dim: 0-4|"NA"}) into the ledger.
  // Each non-NA dimension level adds evidence (coverage) and moves θ.
  applyLevels(levels) {
    this.exchange_count += 1
    if (!levels || typeof levels !== 'object') return this
    for (const dim of DIMENSIONS) {
      const lvl = levels[dim]
      if (lvl === 'NA' || lvl === null || lvl === undefined) continue
      const n = Math.max(0, Math.min(4, Math.round(Number(lvl))))
      const slot = this.dimensions[dim]
      slot.evidence_count += 1
      slot.last_quality = n
      slot.coverage = Math.min(1, slot.evidence_count / LEDGER.COVERAGE_TARGET)
      slot.anchors_hit.push(n)
      this._updateTheta(EvidenceLedger.levelToObservation(n))
    }
    return this
  }

  coverageOf(dim) {
    return this.dimensions[dim]?.coverage ?? 0
  }

  // { dim: coverage } snapshot (for ability_estimates.coverage + reporting).
  coverageMap() {
    const m = {}
    for (const dim of DIMENSIONS) m[dim] = this.coverageOf(dim)
    return m
  }

  minCoverage() {
    return Math.min(...DIMENSIONS.map((d) => this.coverageOf(d)))
  }

  // Plain-object snapshot for persistence (session cache / ability_estimates).
  snapshot() {
    return {
      dimensions: this.dimensions,
      theta: { ...this.theta },
      exchange_count: this.exchange_count,
      coverage: this.coverageMap(),
    }
  }
}
