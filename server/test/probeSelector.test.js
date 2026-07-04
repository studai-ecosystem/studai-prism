import test from 'node:test'
import assert from 'node:assert/strict'
import { EvidenceLedger } from '../engine/evidenceLedger.js'
import { selectProbe, targetDimension, pickFacet, stopDecision } from '../engine/probeSelector.js'
import { FACETS, DIMENSIONS, STOP_RULE } from '../engine/executiveConfig.js'

test('targetDimension picks the highest weight × evidence-gap', () => {
  const l = new EvidenceLedger()
  // All coverage 0 → highest weight wins (criticalThinking @ 0.25, first in order).
  assert.equal(targetDimension(l), 'criticalThinking')
  // Cover criticalThinking fully → it should no longer be the target.
  l.applyLevels({ criticalThinking: 3 })
  l.applyLevels({ criticalThinking: 3 })
  l.applyLevels({ criticalThinking: 3 })
  assert.notEqual(targetDimension(l), 'criticalThinking')
})

test('pickFacet returns an unused facet, then rotates once all used', () => {
  assert.equal(pickFacet([], 1), FACETS[0])
  assert.equal(pickFacet([FACETS[0]], 1), FACETS[1])
  const all = [...FACETS]
  const rotated = pickFacet(all, 3)
  assert.ok(FACETS.includes(rotated)) // falls back to a rotation, still valid
})

test('selectProbe never repeats a facet across a session', () => {
  const l = new EvidenceLedger()
  const used = []
  const seen = new Set()
  for (let turn = 1; turn <= FACETS.length; turn++) {
    const probe = selectProbe(l, { nextExchange: turn, usedFacets: used, challengerTurns: [] })
    assert.ok(!seen.has(probe.facet), `facet ${probe.facet} repeated`)
    seen.add(probe.facet)
    used.push(probe.facet)
  }
  assert.equal(seen.size, FACETS.length)
})

test('challenger respects the 2-turn spacing constraint', () => {
  const l = new EvidenceLedger()
  // Force a thin "collaboration" target so a challenger is wanted.
  const challengerTurns = [5]
  // Turn 6 is within 2 of turn 5 → no challenger.
  const p6 = selectProbe(l, { nextExchange: 6, usedFacets: [], challengerTurns })
  assert.equal(p6.deployChallenger, false)
  // Turn 8 is > 2 away → challenger allowed again (when target wants pushback).
  const p8 = selectProbe(l, { nextExchange: 8, usedFacets: [], challengerTurns })
  assert.equal(typeof p8.deployChallenger, 'boolean')
})

test('challenger never fires in the opening turns (<3)', () => {
  const l = new EvidenceLedger()
  for (let turn = 1; turn <= 2; turn++) {
    const p = selectProbe(l, { nextExchange: turn, usedFacets: [], challengerTurns: [] })
    assert.equal(p.deployChallenger, false)
  }
})

test('selectProbe directive names the target dimension', () => {
  const l = new EvidenceLedger()
  const p = selectProbe(l, { nextExchange: 1, usedFacets: [], challengerTurns: [] })
  assert.match(p.directive, /EXECUTIVE DIRECTOR/)
  assert.ok(p.directive.length > 50)
})

// ── Adaptive stop / extend rule ───────────────────────────────────────────────

test('stop rule: continue before MIN_EXCHANGES', () => {
  const l = new EvidenceLedger()
  for (let i = 0; i < STOP_RULE.MIN_EXCHANGES - 1; i++) l.applyLevels({ criticalThinking: 2 })
  assert.equal(stopDecision(l, { atLimit: true }).action, 'continue')
})

test('stop rule: extend at limit when a dimension is thin', () => {
  const l = new EvidenceLedger()
  // Many exchanges but ONLY criticalThinking covered → others thin.
  for (let i = 0; i < STOP_RULE.MIN_EXCHANGES; i++) l.applyLevels({ criticalThinking: 3 })
  const d = stopDecision(l, { atLimit: true, extensionsUsed: 0 })
  assert.equal(d.action, 'extend')
  assert.ok(DIMENSIONS.includes(d.thinDimension))
})

test('stop rule: stop at limit once extensions are exhausted', () => {
  const l = new EvidenceLedger()
  for (let i = 0; i < STOP_RULE.MIN_EXCHANGES; i++) l.applyLevels({ criticalThinking: 3 })
  const d = stopDecision(l, { atLimit: true, extensionsUsed: STOP_RULE.MAX_EXTENSIONS })
  assert.equal(d.action, 'stop')
})

test('stop rule: early stop only when enabled, confident AND covered', () => {
  const l = new EvidenceLedger({ theta0_mean: 0, theta0_var: 0.64 })
  // Drive coverage ≥ target on every dimension and tighten θ (≥ MIN_EXCHANGES).
  for (let i = 0; i < STOP_RULE.MIN_EXCHANGES; i++) {
    l.applyLevels({ criticalThinking: 3, communication: 3, collaboration: 3, problemSolving: 3, aiDigitalFluency: 3 })
  }
  const offDecision = stopDecision(l, { earlyStopEnabled: false, atLimit: false })
  assert.notEqual(offDecision.action, 'stop') // early stop disabled → never stops mid-flow
  const onDecision = stopDecision(l, { earlyStopEnabled: true, atLimit: false })
  assert.equal(onDecision.action, 'stop')
  assert.equal(onDecision.reason, 'confident_and_covered')
})
