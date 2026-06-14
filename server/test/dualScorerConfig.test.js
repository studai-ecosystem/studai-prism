import test from 'node:test'
import assert from 'node:assert/strict'
import { isDualScorerEnabled, levelToScore } from '../scoring/dualScorerConfig.js'
import { extractSessionFeatures } from '../scoring/features.js'

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

test('isDualScorerEnabled defaults off', () => {
  withEnv({ PRISM_V2_DUAL_SCORER: undefined }, () => assert.equal(isDualScorerEnabled(), false))
  withEnv({ PRISM_V2_DUAL_SCORER: 'true' }, () => assert.equal(isDualScorerEnabled(), true))
})

test('levelToScore maps 0-4 to 0-100', () => {
  assert.equal(levelToScore(0), 0)
  assert.equal(levelToScore(2), 50)
  assert.equal(levelToScore(4), 100)
})

test('extractSessionFeatures computes interpretable features + shadow scores', () => {
  const { features, shadowScores } = extractSessionFeatures([
    { text: 'I think we should consider the data because it could be biased. What is the budget?', responseMs: 4000 },
    { text: 'You are right, I would adjust my plan and check the trade-offs.', responseMs: 5000 },
  ])
  assert.equal(features.turns, 2)
  assert.ok(features.totalWords > 0)
  assert.equal(features.positionUpdates, 1) // "you are right" / "I would adjust"
  // shadow scores present for all dimensions, 0-100.
  for (const v of Object.values(shadowScores)) {
    assert.ok(v >= 0 && v <= 100)
  }
})

test('extractSessionFeatures handles empty input gracefully', () => {
  const { features } = extractSessionFeatures([])
  assert.equal(features.turns, 0)
})
