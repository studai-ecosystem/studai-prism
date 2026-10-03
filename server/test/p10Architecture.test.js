import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inventoryRoutes } from '../../scripts/route-usage-inventory.mjs'

test('P10.1: active-new architecture has one player, one Report V3 route and one history projection', async () => {
  const inventory = await inventoryRoutes()
  const active = inventory.client.filter((route) => route.class === 'ACTIVE_NEW')
  assert.deepEqual(active.filter((route) => route.path === '/app/assessment/:sessionId').map((route) => route.path), ['/app/assessment/:sessionId'])
  assert.deepEqual(active.filter((route) => route.path === '/app/reports/:sessionId').map((route) => route.path), ['/app/reports/:sessionId'])
  assert.deepEqual(active.filter((route) => route.path === '/app/assessments').map((route) => route.path), ['/app/assessments'])
  assert.equal(active.some((route) => /score|workspace\/:sessionId|report\/:sessionId/.test(route.path)), false)
})

test('P10.1: new allocation invokes one readiness-gated session service and carries no alternate score/new-player dispatch', async () => {
  const source = await readFile(new URL('../domain/assessments/sessionService.js', import.meta.url), 'utf8')
  assert.equal((source.match(/assertAllocatable\(/g) || []).length, 1)
  assert.equal((source.match(/ledger\.reserve\(/g) || []).length, 1)
  assert.ok(source.indexOf('assertAllocatable(') < source.indexOf('ledger.reserve('))
  assert.doesNotMatch(source, /\b(overallScore|compositeScore|fourthPlayer|alternateScore)\b/)
})
