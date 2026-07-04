import test from 'node:test'
import assert from 'node:assert/strict'
import { sumToTheta, thetaToTier, anchorsToTheta, heuristicTheta, ANCHORS } from '../engine/entryEstimator.js'
import { isExecutiveEnabled, isEarlyStopEnabled, LEDGER } from '../engine/executiveConfig.js'

test('sumToTheta maps 0..12 linearly onto [-1.2, +1.2]', () => {
  assert.equal(sumToTheta(0).theta0_mean, -1.2)
  assert.equal(sumToTheta(12).theta0_mean, 1.2)
  assert.equal(sumToTheta(6).theta0_mean, 0)
  assert.equal(sumToTheta(0).theta0_var, LEDGER.PRIOR_VARIANCE)
})

test('sumToTheta clamps out-of-range sums', () => {
  assert.equal(sumToTheta(-5).theta0_mean, -1.2)
  assert.equal(sumToTheta(99).theta0_mean, 1.2)
})

test('thetaToTier buckets the continuous prior', () => {
  assert.equal(thetaToTier(1.0), 'advanced')
  assert.equal(thetaToTier(0), 'intermediate')
  assert.equal(thetaToTier(-1.0), 'foundational')
})

test('anchorsToTheta sums the four 0-3 anchors', () => {
  const full = {}
  for (const a of ANCHORS) full[a] = 3
  const est = anchorsToTheta(full)
  assert.equal(est.anchorSum, 12)
  assert.equal(est.theta0_mean, 1.2)
  assert.equal(est.gradedBy, 'ai')
})

test('anchorsToTheta clamps bad anchor values', () => {
  const est = anchorsToTheta({ structure: 9, specificity: -2, reasoning: 'x', self_reflection: 1 })
  // 3 (clamped) + 0 + 0 + 1 = 4
  assert.equal(est.anchorSum, 4)
})

test('heuristicTheta returns a valid prior without AI', () => {
  const est = heuristicTheta('I had to decide quickly with little information. I weighed the trade-offs because time was short, and in hindsight I would have asked more questions first.')
  assert.equal(est.gradedBy, 'heuristic')
  assert.ok(est.theta0_mean >= -1.2 && est.theta0_mean <= 1.2)
  assert.equal(est.theta0_var, LEDGER.PRIOR_VARIANCE)
})

// ── Flag gating (zero behavior change when off) ───────────────────────────────

function withEnv(vars, fn) {
  const prev = {}
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try { return fn() } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('isExecutiveEnabled defaults off', () => {
  withEnv({ PRISM_V2_EXECUTIVE: undefined }, () => assert.equal(isExecutiveEnabled(), false))
  withEnv({ PRISM_V2_EXECUTIVE: 'false' }, () => assert.equal(isExecutiveEnabled(), false))
  withEnv({ PRISM_V2_EXECUTIVE: 'true' }, () => assert.equal(isExecutiveEnabled(), true))
})

test('isEarlyStopEnabled defaults off', () => {
  withEnv({ PRISM_V2_EARLY_STOP: undefined }, () => assert.equal(isEarlyStopEnabled(), false))
  withEnv({ PRISM_V2_EARLY_STOP: 'true' }, () => assert.equal(isEarlyStopEnabled(), true))
})
