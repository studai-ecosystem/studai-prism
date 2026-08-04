// Scenario bank calibration freeze (audit C11 — remediation Phase 3).
//
// The build rules freeze the bank at ≤ 8 active scenarios until the first IRT
// calibration run succeeds. These tests pin that: the active pool is EXACTLY 8
// with tier coverage, selection can never serve a retired scenario, and retired
// scenarios still resolve for historical sessions.

import test from 'node:test'
import assert from 'node:assert/strict'
import { SCENARIOS, ACTIVE_SCENARIOS, pickScenario } from '../routes/assessment.js'

const KEPT = [
  'group-project', 'fest-budget', 'clinic-triage',
  'delayed-launch', 'supplier-failure', 'brand-crisis',
  'ethical-ai', 'team-restructure',
]

test('C11: exactly 8 active scenarios — the frozen calibration bank', () => {
  assert.equal(ACTIVE_SCENARIOS.length, 8)
  assert.deepEqual([...ACTIVE_SCENARIOS.map((s) => s.id)].sort(), [...KEPT].sort())
})

test('C11: every difficulty tier keeps at least 2 active scenarios', () => {
  for (const tier of ['foundational', 'intermediate', 'advanced']) {
    const n = ACTIVE_SCENARIOS.filter((s) => s.difficulty === tier).length
    assert.ok(n >= 2, `tier ${tier} has only ${n} active scenarios`)
  }
})

test('C11: pickScenario never serves a retired scenario (500 draws, all tiers)', () => {
  const active = new Set(ACTIVE_SCENARIOS.map((s) => s.id))
  for (const tier of [undefined, 'foundational', 'intermediate', 'advanced']) {
    for (let i = 0; i < 125; i++) {
      const s = pickScenario(tier)
      assert.ok(active.has(s.id), `picked retired/unknown scenario ${s.id} (tier=${tier})`)
    }
  }
})

test('C11: pickScenario respects exclusions within the active pool', () => {
  // Near-tier pools (cohort feedback 2026-08): a foundational candidate draws
  // from foundational + intermediate. Excluding all but one of that pool must
  // deterministically serve the remaining scenario.
  const nearPool = ACTIVE_SCENARIOS
    .filter((s) => ['foundational', 'intermediate'].includes(s.difficulty))
    .map((s) => s.id)
  const excludeAllButOne = nearPool.slice(0, -1)
  const remaining = nearPool[nearPool.length - 1]
  for (let i = 0; i < 50; i++) {
    assert.equal(pickScenario('foundational', excludeAllButOne).id, remaining)
  }
})

test('near-tier pools: foundational never draws advanced (and vice versa) while unseen remain', () => {
  for (let i = 0; i < 200; i++) {
    assert.notEqual(pickScenario('foundational').difficulty, 'advanced')
    assert.notEqual(pickScenario('advanced').difficulty, 'foundational')
  }
})

test('near-tier pools: a foundational candidate can be served intermediate scenarios', () => {
  const seen = new Set()
  for (let i = 0; i < 400; i++) seen.add(pickScenario('foundational').difficulty)
  assert.ok(seen.has('foundational') && seen.has('intermediate'))
})

test('exhausted near-tier pool falls back bank-wide before repeating', () => {
  // A foundational candidate who has seen all 6 near-tier scenarios gets the
  // unseen advanced ones next — never an immediate repeat.
  const nearIds = ACTIVE_SCENARIOS
    .filter((s) => ['foundational', 'intermediate'].includes(s.difficulty))
    .map((s) => s.id)
  for (let i = 0; i < 50; i++) {
    const s = pickScenario('foundational', nearIds)
    assert.equal(s.difficulty, 'advanced', `expected an unseen advanced scenario, got ${s.id}`)
  }
  // Only when the WHOLE bank is seen does the pool allow repeats.
  const allIds = ACTIVE_SCENARIOS.map((s) => s.id)
  const repeat = pickScenario('foundational', allIds)
  assert.ok(nearIds.includes(repeat.id), 'repeats come from the candidate\u2019s own near-tier pool')
})

test('C11: retired scenarios remain resolvable for historical sessions', () => {
  const retired = SCENARIOS.filter((s) => s.retired)
  assert.equal(retired.length, 8)
  // The full array still carries them (findScenario searches SCENARIOS, not
  // the active pool), so a pre-freeze session revives correctly.
  for (const s of retired) {
    assert.ok(SCENARIOS.find((x) => x.id === s.id))
    assert.ok(!ACTIVE_SCENARIOS.find((x) => x.id === s.id))
  }
})
