// C11.05 — the admin console's campus organizations routes over memory
// repositories: admin RBAC (organizations:read / contracts:manage), reasons
// required, every mutation audited, idempotent activation, no price input
// accepted, membership counts only (no student identities). Synthetic data.
import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createOrganizationsAdminRouter } from '../routes/admin/organizations.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ROLES } from '../lib/adminRbac.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'

async function world() {
  const repos = createMemoryCampusRepos({ clock: () => new Date('2026-10-20T09:00:00Z') })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic Ops University', slug: 'syn-ops-u', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  for (const [userId, role] of [['owner-o', 'ORG_OWNER'], ['stu-o-1', 'STUDENT'], ['stu-o-2', 'STUDENT']]) await repos.memberships.upsertMembership({ organizationId: org.id, userId, role, status: 'ACTIVE' })
  const campus = createCampusContext({ repos, clock: () => new Date('2026-10-20T09:00:00Z'), audit: () => {} })
  const audits = []
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const role = req.get('x-admin-role')
    if (role) req.admin = { id: `admin-${role}`, permissions: new Set(ROLES[role].permissions) }
    next()
  })
  app.use('/api/admin/organizations', createOrganizationsAdminRouter({ campus, audit: async (_req, entry) => { audits.push(entry) } }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/admin/organizations`
  const call = async (role, method, path, body) => {
    const r = await fetch(`${base}${path}`, { method, headers: { ...(role ? { 'x-admin-role': role } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  return { repos, org, call, audits, close: () => server.close() }
}
const draft = { name: 'Synthetic ops contract', termStart: '2026-09-01', termEnd: '2027-03-31', includedSeats: 4, components: { platformFee: true }, reason: 'Signed synthetic order form' }

test('admin organizations: RBAC, reasons, audit, idempotent activation, counts only', async () => {
  const w = await world()
  try {
    assert.equal((await w.call(null, 'GET', '/')).status, 401)
    assert.equal((await w.call('content_admin', 'GET', '/')).status, 403)
    const list = await w.call('support_admin', 'GET', '/')
    assert.equal(list.status, 403, 'support staff do not see institutions')
    const ok = await w.call('product_admin', 'GET', '/')
    assert.deepEqual(ok.body.rows.map((r) => [r.name, r.activeContracts]), [['Synthetic Ops University', 0]])
    assert.equal((await w.call('auditor', 'GET', `/${w.org.id}`)).status, 200, 'the read-only auditor sees operations data')
    assert.equal((await w.call('product_admin', 'POST', `/${w.org.id}/contracts`, draft)).status, 403, 'contracts need contracts:manage')
    assert.equal((await w.call('finance_admin', 'POST', `/${w.org.id}/contracts`, { ...draft, components: { perAssessmentRate: 399 } })).status, 400, 'no amounts in the console')
    assert.equal((await w.call('finance_admin', 'POST', `/${w.org.id}/contracts`, { ...draft, reason: '' })).status, 400, 'a reason is required')
    const created = await w.call('finance_admin', 'POST', `/${w.org.id}/contracts`, draft)
    assert.equal(created.status, 201)
    const id = created.body.contract.id
    assert.equal((await w.call('finance_admin', 'POST', `/contracts/${id}/activate`, { reason: 'short' })).status, 400)
    const act = await w.call('finance_admin', 'POST', `/contracts/${id}/activate`, { reason: 'Signed synthetic pilot agreement' })
    assert.deepEqual([act.status, act.body.contract.status, act.body.replayed], [200, 'ACTIVE', false])
    const again = await w.call('finance_admin', 'POST', `/contracts/${id}/activate`, { reason: 'Signed synthetic pilot agreement' })
    assert.equal(again.body.replayed, true)
    assert.deepEqual(w.audits.map((a) => a.action), ['campus_contract_created', 'campus_contract_activated'], 'a replay writes no second audit row')
    assert.equal(w.audits[1].reason, 'Signed synthetic pilot agreement')
    const detail = (await w.call('product_admin', 'GET', `/${w.org.id}`)).body
    assert.deepEqual(detail.memberships.byRole.STUDENT.ACTIVE, 2)
    assert.ok(!JSON.stringify(detail).includes('stu-o-1'), 'membership counts only, never student identities')
    assert.deepEqual(detail.entitlements.map((e) => [e.source, e.seats.included, e.billableEvent]), [['CONTRACT', 4, 'ASSESSMENT_COMPLETED']])
    const closed = await w.call('finance_admin', 'POST', `/contracts/${id}/close`, { status: 'ENDED', reason: 'Synthetic term finished early' })
    assert.equal(closed.body.contract.status, 'ENDED')
    assert.equal((await w.call('finance_admin', 'POST', `/contracts/${id}/close`, { status: 'ENDED', reason: 'Synthetic term finished early' })).status, 409)
    assert.equal((await w.call('product_admin', 'GET', '/not-a-uuid')).status, 404)
  } finally { w.close() }
})
