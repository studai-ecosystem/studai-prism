// Campus Phase 9 C9.02/C9.07 — the form equivalence registry on the admin
// plane (database required, like every /api/admin suite). Proves: every pair
// starts PENDING; only equivalence:decide may decide; APPROVED needs cited
// evidence and a second administrator's approval (single-use); every
// decision lands in the admin audit trail and the append-only history.

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const TEST_DB = process.env.TEST_DATABASE_URL
const skip = !TEST_DB
if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB
  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'growth-equivalence-db-test-secret'
  process.env.PRISM_ADMIN_CONSOLE = 'true'
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-growth-eq-db-'))
  delete process.env.PRISM_PG_STORE
}

const { migrateUp } = skip ? {} : await import('../db/migrate.js')
const { query, closePool } = skip ? {} : await import('../db/pool.js')
const { buildApp } = skip ? {} : await import('../app.js')
const adminAuth = skip ? {} : await import('../lib/adminAuth.js')
const { seedRbac } = skip ? {} : await import('../lib/adminRbac.js')

async function mintAdmin(roleKeys) {
  const adminId = randomUUID()
  const email = `geq-${roleKeys[0]}-${adminId.slice(0, 8)}@test.local`
  await query(`INSERT INTO admin_users (admin_id, email, name, password_hash, state) VALUES ($1,$2,$3,'x','active')`, [adminId, email, roleKeys[0]])
  for (const rk of roleKeys) {
    await query('INSERT INTO admin_user_roles (admin_id, role_id) SELECT $1, role_id FROM admin_roles WHERE role_key = $2', [adminId, rk])
  }
  const session = await adminAuth.createAdminSession({ admin_id: adminId, email }, { ip: '10.88.0.9', get: () => 'growth-eq-tests' })
  return { adminId, token: adminAuth.signAccessToken({ admin_id: adminId, email }, session.sessionId), csrf: session.csrfToken }
}

test('form equivalence registry: PENDING by default, dual-approved APPROVED, audited history', { skip }, async (t) => {
  await migrateUp()
  await seedRbac()
  const app = buildApp()
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { server.close(); await closePool() })
  const call = async (method, path, actor, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${actor.token}`, ...(method !== 'GET' ? { 'x-admin-csrf': actor.csrf } : {}) },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    let json = null
    try { json = await res.json() } catch { /* empty */ }
    return { status: res.status, json }
  }

  const psy = await mintAdmin(['psychometric_admin'])
  const raiser = await mintAdmin(['super_admin'])
  const decider = await mintAdmin(['super_admin'])
  const product = await mintAdmin(['product_admin'])

  assert.equal((await call('GET', '/api/admin/equivalence', product)).status, 403)
  const list = await call('GET', '/api/admin/equivalence', psy)
  assert.equal(list.status, 200)
  assert.ok(list.json.pairs.length > 0, 'pairs are seeded from the frozen catalog')
  const pair = list.json.pairs.find((p) => p.formA.id !== p.formB.id && p.status === 'PENDING') || list.json.pairs.find((p) => p.status === 'PENDING')
  assert.ok(pair, 'a PENDING pair exists')
  const body = { formAId: pair.formB.id, formBId: pair.formA.id, status: 'APPROVED', evidenceRef: `equating-run-${randomUUID().slice(0, 6)}`, reason: 'Frozen equating run reviewed by two people' }

  assert.equal((await call('POST', '/api/admin/equivalence/decisions', product, body)).status, 403, 'needs equivalence:decide')
  assert.equal((await call('POST', '/api/admin/equivalence/decisions', psy, { ...body, evidenceRef: '' })).status, 400)
  assert.equal((await call('POST', '/api/admin/equivalence/decisions', psy, { ...body, reason: 'short' })).status, 400)
  const noApproval = await call('POST', '/api/admin/equivalence/decisions', psy, body)
  assert.equal(noApproval.status, 409)
  assert.equal(noApproval.json.code, 'APPROVAL_REQUIRED')

  const entityId = `${pair.formA.id}|${pair.formB.id}`
  const raised = await call('POST', '/api/admin/admins/approvals', raiser, { action: 'approve_form_equivalence', entityType: 'form_pair', entityId, reason: 'Growth comparison for the December cohort' })
  assert.equal(raised.status, 201)
  assert.equal((await call('POST', `/api/admin/admins/approvals/${raised.json.approvalId}/decide`, decider, { decision: 'approved', reason: 'Evidence reviewed' })).status, 200)
  const approved = await call('POST', '/api/admin/equivalence/decisions', psy, body)
  assert.equal(approved.status, 200, JSON.stringify(approved.json))
  assert.equal(approved.json.pair.status, 'APPROVED')
  assert.equal((await call('POST', '/api/admin/equivalence/decisions', psy, body)).status, 409, 'an approval is single-use')

  const rejected = await call('POST', '/api/admin/equivalence/decisions', psy, { ...body, status: 'REJECTED', reason: 'Later DIF review found a problem' })
  assert.equal(rejected.status, 200)
  const history = await call('GET', `/api/admin/equivalence/decisions?formAId=${encodeURIComponent(pair.formA.id)}&formBId=${encodeURIComponent(pair.formB.id)}`, psy)
  assert.deepEqual(history.json.decisions.map((d) => d.status).slice(-2), ['APPROVED', 'REJECTED'])
  assert.ok(history.json.decisions.at(-2).approvalId, 'the approval is recorded with the decision')
  const audit = await query("SELECT COUNT(*) FROM admin_audit_events WHERE action = 'form_equivalence_decided' AND entity_id = $1", [entityId])
  assert.equal(Number(audit.rows[0].count), 2, 'admin audit trail records each decision')
})
