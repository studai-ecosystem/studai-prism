// P10.6 — retirement is inventory-first, deletion-last. Until a monitored
// drain window proves otherwise, the legacy readers and their routes stay:
// old owned reports and intentional shares keep valid consumers.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { inventoryRoutes, CLASSES } from '../../scripts/route-usage-inventory.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const exists = async (p) => access(join(ROOT, p)).then(() => true, () => false)

test('P10.6: legacy reader routes are still mounted in AppRouter', async () => {
  const router = await readFile(join(ROOT, 'src', 'app', 'AppRouter.jsx'), 'utf8')
  for (const path of ['/score', '/report/:sessionId/v2', '/report/:sessionId/employee', '/shared/:token']) {
    assert.ok(router.includes(`path="${path}"`), `${path} route retained`)
  }
})

test('P10.6: ScoreReport and StudentReportV2 readers (and the share page) still exist', async () => {
  for (const file of ['src/pages/ScoreReport.jsx', 'src/pages/StudentReportV2.jsx', 'src/features/reports/pages/SharedReportPage.jsx', 'src/pages/EmployeeReportV2.jsx']) {
    assert.ok(await exists(file), `${file} retained`)
  }
})

test('P10.6: the route inventory classifies readers as LEGACY_READER (keep) and never marks a reader for retirement', async () => {
  const inv = await inventoryRoutes()
  assert.deepEqual(Object.keys(inv.summary).sort(), [...CLASSES].sort())
  const byPath = Object.fromEntries(inv.client.map((r) => [r.path, r]))
  for (const path of ['/score', '/report/:sessionId/v2', '/report/:sessionId/employee', '/shared/:token']) {
    assert.equal(byPath[path]?.class, 'LEGACY_READER', `${path} is a reader`)
    assert.equal(byPath[path]?.retire, false)
  }
  assert.equal(byPath['/assessment']?.class, 'LEGACY_CREATION')
  assert.equal(byPath['/payment']?.class, 'LEGACY_CREATION')
  assert.equal(byPath['/app/assessment/:sessionId']?.class, 'V3')
  assert.ok(inv.server.some((r) => r.mount === '/api/v1' && r.class === 'V3'))
  assert.ok(inv.server.some((r) => r.mount === '/api/payment' && r.class === 'LEGACY_CREATION'))
  assert.equal(inv.deletionsPerformed, 0)
  assert.doesNotMatch(JSON.stringify(inv), /postgres:\/\/|Bearer /)
})
