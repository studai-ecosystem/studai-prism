import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('P10.3: release candidate reconciliation is read-only, aggregate-only and takes no connection-string argument', async () => {
  const source = await readFile(new URL('../../scripts/reconcile-release-candidate.mjs', import.meta.url), 'utf8')
  assert.match(source, /BEGIN READ ONLY/)
  assert.match(source, /rawRowsIncluded: false/)
  assert.match(source, /process\.env\.PRISM_RECONCILE_DATABASE_URL/)
  assert.doesNotMatch(source, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i)
  assert.doesNotMatch(source, /SELECT \*/)
})
