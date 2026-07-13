// Control Centre Phase 4 — unit tests (no database).
//
// Ship-dark contract for the Phase 4 namespaces + RBAC grants for the new
// surfaces. (The permission-key source scan in adminPhase2.test.js already
// covers the new routers' requirePermission strings.)

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
delete process.env.PRISM_ADMIN_CONSOLE

const { ROLES } = await import('../lib/adminRbac.js')
const { buildApp } = await import('../app.js')

test('Phase 4 namespaces are dark without PRISM_ADMIN_CONSOLE', async () => {
  const app = buildApp()
  const server = app.listen(0)
  const port = server.address().port
  try {
    for (const path of [
      '/api/admin/credentials', '/api/admin/credentials/signing-key',
      '/api/admin/replays', '/api/admin/teamfit/teams', '/api/admin/exports',
    ]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`)
      assert.equal(res.status, 404, `${path} must be dark`)
    }
  } finally {
    server.close()
  }
})

test('Phase 4 role grants: ops surfaces get replay/teamfit, auditor stays read-only', () => {
  for (const role of ['product_admin', 'assessment_ops']) {
    const perms = new Set(ROLES[role].permissions)
    for (const k of ['replays:read', 'replays:flag', 'teamfit:read', 'teamfit:manage', 'credentials:read']) {
      assert.ok(perms.has(k), `${role} must hold ${k}`)
    }
  }
  const research = new Set(ROLES.research_admin.permissions)
  assert.ok(research.has('teamfit:read'))
  assert.ok(!research.has('teamfit:manage'), 'research is read-only on teams')
  assert.ok(!research.has('credentials:issue'), 'research cannot issue credentials')

  const credential = new Set(ROLES.credential_admin.permissions)
  for (const k of ['credentials:read', 'credentials:issue', 'credentials:revoke', 'exports:create']) {
    assert.ok(credential.has(k), `credential_admin must hold ${k}`)
  }
  // Auditor gains the new read keys automatically and still no writes.
  const auditor = new Set(ROLES.auditor.permissions)
  assert.ok(auditor.has('replays:read'))
  assert.ok(auditor.has('teamfit:read'))
  assert.ok(!auditor.has('replays:flag'), 'flagging is a write — auditor never holds it')
})
