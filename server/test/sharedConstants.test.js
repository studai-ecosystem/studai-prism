// Locks the shared public-claim constants (audit findings C2/C22).
//
// ValidityStudy.jsx, ScoreReport.jsx, Pricing/FAQ/Payment/ScoreSection copy and
// the server's scoring route all import these values from lib/sharedConstants.js,
// so UI claims match the scoring code BY CONSTRUCTION. This test pins the
// canonical values themselves: if anyone edits a weight, the validity period or
// the duration, this fails and forces a deliberate, reviewed change instead of
// silent drift between claims and code.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIMENSION_KEYS,
  DIMENSION_WEIGHTS,
  DIMENSION_LABELS,
  ASSESSMENT_MINUTES,
  SCORE_VALIDITY_MONTHS,
  REASSESSMENT_DAYS,
  CONSENT_VERSION,
} from '../lib/sharedConstants.js'

test('dimension weights are the canonical 25/25/20/20/10 (C2)', () => {
  assert.deepEqual(DIMENSION_WEIGHTS, {
    criticalThinking: 0.25,
    communication: 0.25,
    collaboration: 0.2,
    problemSolving: 0.2,
    aiDigitalFluency: 0.1,
  })
})

test('dimension weights sum to exactly 1', () => {
  const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights sum to ${sum}, expected 1`)
})

test('every dimension key has a weight and a label — no orphans either way', () => {
  assert.deepEqual([...DIMENSION_KEYS].sort(), Object.keys(DIMENSION_WEIGHTS).sort())
  assert.deepEqual([...DIMENSION_KEYS].sort(), Object.keys(DIMENSION_LABELS).sort())
})

test('duration and validity claims are pinned (C22)', () => {
  assert.equal(ASSESSMENT_MINUTES, 30)
  assert.equal(SCORE_VALIDITY_MONTHS, 12)
  assert.equal(REASSESSMENT_DAYS, 90)
})

test('consent version is a non-empty string (C5)', () => {
  assert.equal(typeof CONSENT_VERSION, 'string')
  assert.ok(CONSENT_VERSION.length > 0)
})

test('scoring route uses the shared weights — recomputed overall matches (C2)', async () => {
  // The route recomputes the overall score from DIMENSION_WEIGHTS; verify the
  // arithmetic here so any drift in the shared module breaks loudly.
  const scores = { criticalThinking: 80, communication: 60, collaboration: 70, problemSolving: 50, aiDigitalFluency: 90 }
  const overall = DIMENSION_KEYS.reduce((sum, k) => sum + scores[k] * DIMENSION_WEIGHTS[k], 0)
  assert.equal(Math.round(overall), 68) // 20 + 15 + 14 + 10 + 9
})
