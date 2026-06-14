import test from 'node:test'
import assert from 'node:assert/strict'
import { scenarioUuid, scenarioItemId, probeItemId } from '../lib/itemIds.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

test('item ids are valid UUIDs', () => {
  assert.match(scenarioUuid('group-project'), UUID_RE)
  assert.match(scenarioItemId('group-project'), UUID_RE)
  assert.match(probeItemId('group-project', 'communication'), UUID_RE)
})

test('item ids are deterministic (stable across calls)', () => {
  assert.equal(scenarioItemId('fest-budget'), scenarioItemId('fest-budget'))
  assert.equal(
    probeItemId('fest-budget', 'criticalThinking'),
    probeItemId('fest-budget', 'criticalThinking'),
  )
})

test('scenario, scenario-item and probe ids are all distinct', () => {
  const key = 'group-project'
  const a = scenarioUuid(key)
  const b = scenarioItemId(key)
  const c = probeItemId(key, 'communication')
  assert.notEqual(a, b)
  assert.notEqual(b, c)
  assert.notEqual(a, c)
})

test('probe ids differ per dimension and per scenario', () => {
  assert.notEqual(
    probeItemId('group-project', 'communication'),
    probeItemId('group-project', 'collaboration'),
  )
  assert.notEqual(
    probeItemId('group-project', 'communication'),
    probeItemId('fest-budget', 'communication'),
  )
})
