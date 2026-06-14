import test from 'node:test'
import assert from 'node:assert/strict'
import { EvidenceLedger } from '../engine/evidenceLedger.js'
import { LEDGER } from '../engine/executiveConfig.js'

// Golden-value tests for the precision-weighted Gaussian θ update.
//   var'  = 1 / (1/var + 1/0.35)
//   mean' = var' * (mean/var + y/0.35)
// with observation y = (L/4)*2 - 1.

test('levelToObservation maps 0..4 onto [-1, +1]', () => {
  assert.equal(EvidenceLedger.levelToObservation(0), -1)
  assert.equal(EvidenceLedger.levelToObservation(2), 0)
  assert.equal(EvidenceLedger.levelToObservation(4), 1)
})

test('single update from neutral prior matches closed-form math', () => {
  const l = new EvidenceLedger({ theta0_mean: 0, theta0_var: 0.64 })
  l.applyLevels({ criticalThinking: 4 }) // y = +1
  // var' = 1/(1/0.64 + 1/0.35) = 1/(1.5625 + 2.857142857) = 1/4.419642857
  const expVar = 1 / (1 / 0.64 + 1 / 0.35)
  // mean' = var' * (0/0.64 + 1/0.35) = var' * 2.857142857
  const expMean = expVar * (0 / 0.64 + 1 / 0.35)
  assert.ok(Math.abs(l.theta.var - expVar) < 1e-5, `var ${l.theta.var} vs ${expVar}`)
  assert.ok(Math.abs(l.theta.mean - expMean) < 1e-5, `mean ${l.theta.mean} vs ${expMean}`)
})

test('variance strictly decreases with each rated observation', () => {
  const l = new EvidenceLedger({ theta0_mean: 0, theta0_var: 0.64 })
  const v0 = l.theta.var
  l.applyLevels({ communication: 3 })
  const v1 = l.theta.var
  l.applyLevels({ communication: 3 })
  const v2 = l.theta.var
  assert.ok(v1 < v0)
  assert.ok(v2 < v1)
})

test('repeated high levels pull the mean upward toward +1', () => {
  const l = new EvidenceLedger({ theta0_mean: 0, theta0_var: 0.64 })
  for (let i = 0; i < 5; i++) l.applyLevels({ problemSolving: 4 })
  assert.ok(l.theta.mean > 0.6, `mean rose to ${l.theta.mean}`)
  assert.ok(l.theta.mean < 1, 'mean stays below the +1 observation ceiling')
})

test('NA levels add no evidence and do not move θ', () => {
  const l = new EvidenceLedger({ theta0_mean: 0.2, theta0_var: 0.5 })
  const before = { ...l.theta }
  l.applyLevels({ criticalThinking: 'NA', communication: 'NA', collaboration: 'NA', problemSolving: 'NA', aiDigitalFluency: 'NA' })
  assert.deepEqual(l.theta, before)
  assert.equal(l.coverageOf('criticalThinking'), 0)
  assert.equal(l.exchange_count, 1) // exchange still counts
})

test('coverage reaches 1.0 after COVERAGE_TARGET rated turns', () => {
  const l = new EvidenceLedger()
  for (let i = 0; i < LEDGER.COVERAGE_TARGET; i++) l.applyLevels({ collaboration: 2 })
  assert.equal(l.coverageOf('collaboration'), 1)
})

test('snapshot round-trips through EvidenceLedger.from', () => {
  const l = new EvidenceLedger({ theta0_mean: 0.1, theta0_var: 0.6 })
  l.applyLevels({ criticalThinking: 3, communication: 2 })
  const snap = l.snapshot()
  const l2 = EvidenceLedger.from(snap)
  assert.deepEqual(l2.theta, l.theta)
  assert.equal(l2.coverageOf('criticalThinking'), l.coverageOf('criticalThinking'))
  assert.equal(l2.exchange_count, l.exchange_count)
})
