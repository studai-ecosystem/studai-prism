import test from 'node:test'
import assert from 'node:assert/strict'
import { buildItemRows } from '../db/seedItems.js'
import { SCENARIOS } from '../routes/assessment.js'
import { DIMENSION_KEYS } from '../lib/behavioralFeatures.js'

test('buildItemRows: one scenario item + one probe per dimension per scenario', () => {
  const rows = buildItemRows()
  const perScenario = 1 + DIMENSION_KEYS.length
  assert.equal(rows.length, SCENARIOS.length * perScenario)
})

test('buildItemRows: all item_ids are unique', () => {
  const rows = buildItemRows()
  const ids = new Set(rows.map((r) => r.item_id))
  assert.equal(ids.size, rows.length)
})

test('buildItemRows: scenario items have null dimension; probes carry a dimension', () => {
  const rows = buildItemRows()
  for (const r of rows) {
    if (r.kind === 'scenario') {
      assert.equal(r.dimension, null)
    } else {
      assert.equal(r.kind, 'probe')
      assert.ok(DIMENSION_KEYS.includes(r.dimension))
      assert.equal(r.facet, r.dimension)
    }
  }
})

test('buildItemRows: every row is provisional with a tier_label preserved', () => {
  const rows = buildItemRows()
  for (const r of rows) {
    assert.equal(r.status, 'provisional')
    // tier_label mirrors the scenario difficulty (may be null if a scenario
    // lacks one, but our bank sets it on every scenario).
    assert.ok(r.tier_label === null || typeof r.tier_label === 'string')
  }
})
