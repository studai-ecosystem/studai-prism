import test from 'node:test'
import assert from 'node:assert/strict'
import { modalLevel, modalLevelsForTurn, recencyWeight, aggregateDimensionScores } from '../scoring/aggregate.js'
import { quantile, buildConformal, intervalFor, ciNeedsReview } from '../scoring/conformal.js'
import { maxDimensionGap, reconcile } from '../scoring/reconciler.js'
import { SCORER, DIMENSIONS } from '../scoring/dualScorerConfig.js'
import { runDualScorer } from '../scoring/dualScorer.js'

// ── modal level + NA rule ─────────────────────────────────────────────────────

test('modalLevel returns the most frequent level', () => {
  assert.equal(modalLevel([3, 3, 2, 3, 4]), 3)
})

test('modalLevel is NA if ANY vote is NA (Vantage rule)', () => {
  assert.equal(modalLevel([4, 4, 'NA', 4]), 'NA')
})

test('modalLevel ties break toward the lower level', () => {
  assert.equal(modalLevel([2, 2, 3, 3]), 2)
})

test('modalLevelsForTurn covers all dimensions', () => {
  const out = modalLevelsForTurn([
    { criticalThinking: 3, communication: 2, collaboration: 'NA', problemSolving: 1, aiDigitalFluency: 'NA' },
    { criticalThinking: 3, communication: 3, collaboration: 'NA', problemSolving: 1, aiDigitalFluency: 'NA' },
  ])
  assert.equal(out.criticalThinking, 3)
  assert.equal(out.collaboration, 'NA')
})

// ── aggregation ───────────────────────────────────────────────────────────────

test('recencyWeight ramps 0.6 → 1.0', () => {
  assert.equal(recencyWeight(1, 5), 0.6)
  assert.equal(recencyWeight(5, 5), 1)
  assert.equal(recencyWeight(1, 1), 1) // single turn
})

test('aggregateDimensionScores skips NA and excludes unstable turns', () => {
  const turns = [
    { exchangeNo: 1, stable: true, asrConfidence: 1, levels: { criticalThinking: 4, communication: 'NA', collaboration: 2, problemSolving: 2, aiDigitalFluency: 'NA' } },
    { exchangeNo: 2, stable: false, asrConfidence: 1, levels: { criticalThinking: 0, communication: 0, collaboration: 0, problemSolving: 0, aiDigitalFluency: 0 } }, // dropped
    { exchangeNo: 3, stable: true, asrConfidence: 1, levels: { criticalThinking: 4, communication: 4, collaboration: 2, problemSolving: 2, aiDigitalFluency: 'NA' } },
  ]
  const { scores, evidenceCounts } = aggregateDimensionScores(turns)
  // criticalThinking from two level-4 stable turns → 100.
  assert.equal(scores.criticalThinking, 100)
  // communication only rated (4) on turn 3 → 100; turn1 NA skipped.
  assert.equal(scores.communication, 100)
  assert.equal(evidenceCounts.aiDigitalFluency, 0) // never rated → 0
  assert.equal(scores.aiDigitalFluency, 0)
})

// ── conformal ─────────────────────────────────────────────────────────────────

test('quantile interpolates', () => {
  assert.equal(quantile([0, 10], 0.5), 5)
  assert.equal(quantile([1, 2, 3, 4], 0), 1)
})

test('buildConformal is provisional below the pair threshold', () => {
  const c = buildConformal([{ panel: 80, human: 78 }])
  assert.equal(c.provisional, true)
  assert.equal(c.halfWidth, SCORER.CI_FALLBACK)
})

test('buildConformal computes a real half-width with enough pairs', () => {
  const pairs = Array.from({ length: SCORER.CI_MIN_PAIRS }, (_, i) => ({ panel: 80, human: 80 + (i % 5) }))
  const c = buildConformal(pairs, 0.9)
  assert.equal(c.provisional, false)
  assert.ok(c.halfWidth >= 0)
})

test('intervalFor clamps to [0,100] and ciNeedsReview flags wide bands', () => {
  const ci = intervalFor(95, { halfWidth: 20, provisional: false })
  assert.equal(ci.high, 100)
  assert.equal(ci.low, 75)
  assert.equal(ciNeedsReview(intervalFor(50, { halfWidth: 20 })), true) // width 40 > 24
  assert.equal(ciNeedsReview(intervalFor(50, { halfWidth: 5 })), false)
})

// ── reconciler ────────────────────────────────────────────────────────────────

test('maxDimensionGap finds the largest per-dim difference', () => {
  const { gap, dimension } = maxDimensionGap(
    { criticalThinking: 80, communication: 70 },
    { criticalThinking: 60, communication: 68 },
  )
  assert.equal(gap, 20)
  assert.equal(dimension, 'criticalThinking')
})

test('reconcile: big gap on first pass → reevaluate', () => {
  const d = reconcile({ criticalThinking: 80 }, { criticalThinking: 60 }, intervalFor(75, { halfWidth: 5 }), { reevaluated: false })
  assert.equal(d.action, 'reevaluate')
})

test('reconcile: persistent gap after re-eval → human_review', () => {
  const d = reconcile({ criticalThinking: 80 }, { criticalThinking: 60 }, intervalFor(75, { halfWidth: 5 }), { reevaluated: true })
  assert.equal(d.action, 'human_review')
})

test('reconcile: wide CI → human_review even when scores agree', () => {
  const d = reconcile({ criticalThinking: 80 }, { criticalThinking: 80 }, intervalFor(75, { halfWidth: 20 }), {})
  assert.equal(d.action, 'human_review')
  assert.equal(d.reason, 'wide_confidence_interval')
})

test('reconcile: agreement + tight CI + no instability → Strong/release', () => {
  const d = reconcile({ criticalThinking: 80 }, { criticalThinking: 82 }, intervalFor(80, { halfWidth: 4, provisional: false }), { unstableTurns: 0 })
  assert.equal(d.action, 'release')
  assert.equal(d.reliability, 'Strong')
})

test('reconcile: provisional CI downgrades Strong → Standard', () => {
  const d = reconcile({ criticalThinking: 80 }, { criticalThinking: 82 }, intervalFor(80, { halfWidth: 6, provisional: true }), { unstableTurns: 0 })
  assert.equal(d.reliability, 'Standard')
})

// ── orchestrator: re-evaluation pass ─────────────────────────────────────────
// A mock judge that returns a fixed level for every dimension. We disable the
// random consistency sample so call counts are deterministic.
function mockCtx(level, counter) {
  const content = JSON.stringify(Object.fromEntries(DIMENSIONS.map((d) => [d, level])))
  return {
    modelA: 'mock-a',
    modelB: 'mock-b',
    createCompletion: async () => {
      counter.calls += 1
      return { choices: [{ message: { content } }] }
    },
  }
}

const TURNS = [
  { text: 'turn one substance', exchangeNo: 1, responseId: null, asrConfidence: 1 },
  { text: 'turn two substance', exchangeNo: 2, responseId: null, asrConfidence: 1 },
]

test('runDualScorer: agreement → release in a single pass (no re-eval)', async () => {
  const origRandom = Math.random
  Math.random = () => 0.99 // never trigger the consistency sample
  try {
    const counter = { calls: 0 }
    // panel returns level 2 → score 50 for every dim; reference agrees at 50.
    const ref = Object.fromEntries(DIMENSIONS.map((d) => [d, 50]))
    const res = await runDualScorer(mockCtx(2, counter), TURNS, ref)
    assert.equal(res.action, 'release')
    assert.equal(res.meta.reevaluated, false)
    assert.equal(res.scores.criticalThinking, 50)
    counter.singlePassCalls = counter.calls
    globalThis.__singlePassCalls = counter.calls
  } finally {
    Math.random = origRandom
  }
})

test('runDualScorer: big disagreement runs ONE re-eval pass then queues review', async () => {
  const origRandom = Math.random
  Math.random = () => 0.99
  try {
    const counter = { calls: 0 }
    // panel insists on level 2 (score 50); reference says 100 → gap 50 > τ.
    // Re-eval re-scores (still 50) → persistent disagreement → human_review.
    const ref = Object.fromEntries(DIMENSIONS.map((d) => [d, 100]))
    const res = await runDualScorer(mockCtx(2, counter), TURNS, ref)
    assert.equal(res.meta.reevaluated, true)
    assert.equal(res.action, 'human_review')
    assert.equal(res.reconcile.reason, 'persistent_disagreement')
    // The re-evaluation pass means the panel was actually run a second time.
    assert.ok(counter.calls > (globalThis.__singlePassCalls || 0))
  } finally {
    Math.random = origRandom
  }
})

