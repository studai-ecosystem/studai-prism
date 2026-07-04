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
  const foundational = ACTIVE_SCENARIOS.filter((s) => s.difficulty === 'foundational').map((s) => s.id)
  const excludeAllButOne = foundational.slice(0, -1)
  const remaining = foundational[foundational.length - 1]
  for (let i = 0; i < 50; i++) {
    assert.equal(pickScenario('foundational', excludeAllButOne).id, remaining)
  }
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
