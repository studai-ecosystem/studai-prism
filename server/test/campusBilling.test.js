// C11.01–C11.07 — campus billing, contracts and integrations over the real
// /api/v1 handlers with memory repositories. Proves: contracts carry no
// prices and mint exactly one sponsorship pool (idempotent activation); the
// billable event decides when a seat is finalised; usage and invoice exports
// are ledger counts, audited and recorded append-only; approved prices only
// are shown, to billing roles only; integrations are honest (CSV available,
// SIS/SSO not connected, SSO start 501); the CSV adapter is the Phase 7
// import path; direct B2C payments stay independent. Synthetic data only —
// the one price below is a synthetic marker, never a real price (K5).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import express from 'express'
import { createV1Router } from '../routes/v1/index.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { ApiError } from '../domain/http/errors.js'
import { csvRosterAdapter, listSisAdapters } from '../domain/integrations/sis/index.js'
import { parseCsv } from '../domain/campusAdmin/csv.js'
import { listAuthProviders } from '../domain/auth/providers/index.js'
import { billableEventOf } from '../domain/entitlements/ledger.js'

process.env.PRISM_CAMPUS_ENABLED = 'true'
process.env.PRISM_APP_SHELL_V3 = 'true'

const NOW = new Date('2026-10-20T09:00:00Z')
const u = (id) => ({ id, email: `${id}@test.local`, name: `Synthetic ${id}` })
const STAFF = { owner: u('owner-b'), director: u('director-b'), officer: u('officer-b'), student: u('student-b'), outsider: u('owner-b2') }
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

async function world() {
  let now = NOW
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic Billing University', slug: `syn-b-${Math.random().toString(36).slice(2, 8)}`, organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const other = await repos.organizations.createOrganization({ name: 'Other Synthetic College', slug: `syn-b2-${Math.random().toString(36).slice(2, 8)}`, organizationType: 'COLLEGE', status: 'ACTIVE' })
  const cohort = await repos.organizations.createCohort({ organizationId: org.id, name: 'Synthetic 2027' })
  const m = (o, userId, role, extra = {}) => repos.memberships.upsertMembership({ organizationId: o.id, userId, role, status: 'ACTIVE', ...extra })
  await m(org, STAFF.owner.id, 'ORG_OWNER')
  await m(org, STAFF.director.id, 'PLACEMENT_DIRECTOR')
  await m(org, STAFF.officer.id, 'PLACEMENT_OFFICER', { scope: { cohortIds: [cohort.id] } })
  await m(org, STAFF.student.id, 'STUDENT')
  await m(other, STAFF.outsider.id, 'ORG_OWNER')
  const audits = []
  const campus = createCampusContext({ repos, clock: () => now, audit: (type, sid, payload) => audits.push({ type, sid, payload }) })
  const requireUser = (req, _res, next) => {
    const user = STAFF[req.get('x-test-user')]
    if (!user) return next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.'))
    req.user = user
    return next()
  }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = async (who, method, path, body) => {
    const r = await fetch(`${base}${path}`, { method, headers: { ...(who ? { 'x-test-user': who } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const setNow = (d) => { now = d }
  return { repos, org, other, campus, audits, call, setNow, close: () => server.close() }
}
const o = (w, p) => `/organizations/${w.org.id}${p}`
const draft = (over = {}) => ({ name: 'Synthetic design partner pilot', termStart: '2026-09-01', termEnd: '2027-03-31', includedSeats: 3, components: { platformFee: true, perCompletedAssessment: true }, ...over })
const resolutionFor = (w, entitlementId) => ({ allowed: true, consumptionRequired: true, entitlementId, scope: { sponsorType: 'INSTITUTION', organizationId: w.org.id } })

test('flag off: billing, integrations and SSO are dark', async () => {
  const w = await world()
  try {
    process.env.PRISM_CAMPUS_ENABLED = 'false'
    for (const p of ['/billing', '/billing/usage', '/integrations']) assert.equal((await w.call('owner', 'GET', o(w, p))).status, 404, p)
    assert.equal((await w.call(null, 'POST', '/auth/sso/start', {})).status, 404)
  } finally {
    process.env.PRISM_CAMPUS_ENABLED = 'true'
    w.close()
  }
})

test('contracts: configuration only (no amounts), one pool per contract, idempotent activation, closing stops new starts', async () => {
  const w = await world()
  try {
    const svc = w.campus.billing
    for (const bad of [
      draft({ components: { perAssessmentRate: 399 } }), draft({ name: '' }), draft({ termEnd: '2026-08-01' }),
      draft({ includedSeats: 0 }), draft({ billableEvent: 'INVOICE_PAID' }), draft({ termStart: '2026-02-30' }),
    ]) await assert.rejects(svc.createContract(w.org.id, bad, { adminId: 'ops-1' }), (e) => e.code === 'VALIDATION_FAILED')
    const c = await svc.createContract(w.org.id, draft(), { adminId: 'ops-1' })
    assert.deepEqual([c.status, c.billableEvent, c.entitlementId], ['DRAFT', 'ASSESSMENT_COMPLETED', null], 'default billable event: a completed eligible assessment')
    assert.ok(!JSON.stringify(c).match(/price|rate"|amount|currency/i), 'a contract row carries no price')
    const [a, b] = await Promise.all([svc.activateContract(c.id, { adminId: 'ops-1' }), svc.activateContract(c.id, { adminId: 'ops-2' })])
    assert.equal(a.entitlement.id, c.id)
    assert.equal(b.entitlement.id, c.id)
    const pools = await w.repos.entitlements.listEntitlements({ organizationId: w.org.id })
    assert.equal(pools.length, 1, 'concurrent activation mints one pool')
    assert.deepEqual([pools[0].sourceType, pools[0].quantity, pools[0].status, pools[0].validFrom, pools[0].validUntil, billableEventOf(pools[0])],
      ['INSTITUTION_SPONSORSHIP', 3, 'ACTIVE', '2026-09-01T00:00:00.000Z', '2027-03-31T23:59:59.999Z', 'ASSESSMENT_COMPLETED'])
    assert.equal((await svc.activateContract(c.id, { adminId: 'ops-1' })).replayed, true)
    const closed = await svc.closeContract(c.id, { adminId: 'ops-1', status: 'ENDED', reason: 'Synthetic end of pilot term' })
    assert.equal(closed.after.status, 'ENDED')
    assert.equal((await w.repos.entitlements.getEntitlement(c.id)).status, 'EXPIRED')
    await assert.rejects(svc.activateContract(c.id, { adminId: 'ops-1' }), (e) => e.code === 'CONFLICT')
    await assert.rejects(svc.closeContract(c.id, { adminId: 'ops-1', status: 'ENDED', reason: 'again and again' }), (e) => e.code === 'CONFLICT')
    const d2 = await svc.createContract(w.org.id, draft({ termEnd: '2026-10-01', termStart: '2026-09-01' }), { adminId: 'ops-1' })
    await assert.rejects(svc.activateContract(d2.id, { adminId: 'ops-1' }), (e) => e.code === 'VALIDATION_FAILED', 'an ended term cannot be activated')
    const cancelled = await svc.closeContract(d2.id, { adminId: 'ops-1', status: 'CANCELLED', reason: 'Synthetic duplicate draft' })
    assert.equal(cancelled.after.entitlementId, null)
  } finally { w.close() }
})

test('contracts: a cancel racing an activation never leaves a live pool behind', async () => {
  const w = await world()
  try {
    const svc = w.campus.billing
    for (let i = 0; i < 25; i += 1) {
      const c = await svc.createContract(w.org.id, draft({ name: `Synthetic race ${i}` }), { adminId: 'ops-1' })
      const ops = [
        () => svc.activateContract(c.id, { adminId: 'ops-1' }),
        () => svc.closeContract(c.id, { adminId: 'ops-2', status: 'CANCELLED', reason: 'Synthetic race cancel' }),
      ]
      await Promise.allSettled(i % 2 ? ops.map((f) => f()) : ops.reverse().map((f) => f()))
      const after = await w.repos.billing.getContract(c.id)
      const pool = await w.repos.entitlements.getEntitlement(c.id)
      assert.equal(after.status, 'CANCELLED', `race ${i}: the cancel always lands`)
      assert.ok(!pool || pool.status !== 'ACTIVE', `race ${i}: a cancelled contract has no active pool`)
    }
    // Activation fully done, then a cancel that read the contract while it was still a draft.
    const c = await svc.createContract(w.org.id, draft({ name: 'Synthetic stale cancel' }), { adminId: 'ops-1' })
    const staleRead = w.repos.billing.getContract
    await svc.activateContract(c.id, { adminId: 'ops-1' })
    w.repos.billing.getContract = async (id) => ({ ...(await staleRead(id)), status: 'DRAFT', entitlementId: null })
    await svc.closeContract(c.id, { adminId: 'ops-2', status: 'CANCELLED', reason: 'Synthetic stale-read cancel' })
    w.repos.billing.getContract = staleRead
    assert.equal((await w.repos.entitlements.getEntitlement(c.id)).status, 'REVOKED', 'revoked from the row the compare-and-set returned')
    // A pool is never live before its contract: it is minted SUSPENDED.
    const d = await svc.createContract(w.org.id, draft({ name: 'Synthetic mint check' }), { adminId: 'ops-1' })
    const create = w.repos.entitlements.createEntitlement
    let minted = null
    w.repos.entitlements.createEntitlement = async (input) => { minted = input.status; return create(input) }
    await svc.activateContract(d.id, { adminId: 'ops-1' })
    w.repos.entitlements.createEntitlement = create
    assert.equal(minted, 'SUSPENDED')
    assert.equal((await w.repos.entitlements.getEntitlement(d.id)).status, 'ACTIVE')
  } finally { w.close() }
})

test('billable event: a start-billed pool closes the seat at start; a completion-billed pool only at completion', async () => {
  const w = await world()
  try {
    const svc = w.campus.billing
    const started = await svc.createContract(w.org.id, draft({ billableEvent: 'ASSESSMENT_STARTED' }), { adminId: 'ops-1' })
    const completed = await svc.createContract(w.org.id, draft({ name: 'Synthetic completion contract' }), { adminId: 'ops-1' })
    await svc.activateContract(started.id, { adminId: 'ops-1' })
    await svc.activateContract(completed.id, { adminId: 'ops-1' })
    const user = STAFF.student
    for (const [c, sessionId] of [[started, 'sess-b-start'], [completed, 'sess-b-complete']]) {
      await w.campus.ledger.reserve({ resolution: resolutionFor(w, c.id), user, sessionId, idempotencyKey: `start:${c.id}` })
      await w.campus.ledger.finalizeOn('ASSESSMENT_STARTED', { entitlementId: c.id, user, sessionId })
    }
    const events = async (id) => (await w.repos.entitlements.listConsumptions(id)).map((e) => e.event)
    assert.deepEqual(await events(started.id), ['RESERVED', 'CONSUMED'])
    assert.deepEqual(await events(completed.id), ['RESERVED'])
    // The completion path always consumes; a start-billed seat is not consumed twice.
    await w.campus.ledger.consume({ entitlementId: started.id, user, sessionId: 'sess-b-start' })
    await w.campus.ledger.consume({ entitlementId: completed.id, user, sessionId: 'sess-b-complete' })
    assert.deepEqual(await events(started.id), ['RESERVED', 'CONSUMED'])
    assert.deepEqual(await events(completed.id), ['RESERVED', 'CONSUMED'])
    // A start-billed seat is never returned when the window closes.
    const rel = await w.campus.ledger.release({ entitlementId: started.id, user, sessionId: 'sess-b-start' })
    assert.equal(rel.replayed, true)
  } finally { w.close() }
})

test('billing API: billing roles only; seats and usage are ledger counts; prices only once approved', async () => {
  const w = await world()
  try {
    const c = await w.campus.billing.createContract(w.org.id, draft({ includedSeats: 5 }), { adminId: 'ops-1' })
    await w.campus.billing.createContract(w.org.id, draft({ name: 'Synthetic unsigned draft' }), { adminId: 'ops-1' })
    await w.campus.billing.activateContract(c.id, { adminId: 'ops-1' })
    for (const [who, status] of [['owner', 200], ['director', 200], ['officer', 404], ['student', 404], ['outsider', 404]]) {
      assert.equal((await w.call(who, 'GET', o(w, '/billing'))).status, status, who)
    }
    const user = STAFF.student
    await w.campus.ledger.reserve({ resolution: resolutionFor(w, c.id), user, sessionId: 'sess-b-1', idempotencyKey: 'k1' })
    await w.campus.ledger.consume({ entitlementId: c.id, user, sessionId: 'sess-b-1' })
    await w.campus.ledger.reserve({ resolution: resolutionFor(w, c.id), user: STAFF.officer, sessionId: 'sess-b-2', idempotencyKey: 'k2' })
    let s = (await w.call('owner', 'GET', o(w, '/billing'))).body.data
    assert.equal(s.contracts.length, 1, 'drafts are not shown to the institution')
    assert.deepEqual(s.contracts[0].seats, { included: 5, inUse: 2, available: 3 })
    assert.deepEqual(s.contracts[0].usage, { started: 2, billable: 1, released: 0 })
    assert.deepEqual([s.contracts[0].pricingStatus, s.contracts[0].pricing], ['NOT_SET', null])
    w.repos.db.contractPricing.set(c.id, { contractId: c.id, perAssessmentRate: 1, platformFee: null, reassessmentRate: null, currency: 'XXX', approvedBy: null, approvedAt: null })
    s = (await w.call('director', 'GET', o(w, '/billing'))).body.data
    assert.deepEqual([s.contracts[0].pricingStatus, s.contracts[0].pricing], ['AWAITING_APPROVAL', null], 'an unapproved price is never shown')
    w.repos.db.contractPricing.set(c.id, { contractId: c.id, perAssessmentRate: 1, platformFee: null, reassessmentRate: null, currency: 'XXX', approvedBy: 'finance-synthetic', approvedAt: NOW.toISOString() })
    s = (await w.call('owner', 'GET', o(w, '/billing'))).body.data
    assert.equal(s.contracts[0].pricing.perAssessmentRate, 1)
    const usage = (await w.call('owner', 'GET', o(w, '/billing/usage'))).body.data
    assert.deepEqual(usage.months, [{ period: '2026-10', started: 2, billable: 1, released: 0 }])
    assert.equal((await w.call('owner', 'GET', o(w, '/billing/usage?from=2026-11-01'))).body.data.totals.started, 0)
    assert.equal((await w.call('owner', 'GET', o(w, '/billing/usage?from=2026-11-01&to=2026-10-01'))).status, 422)
    assert.equal((await w.call('owner', 'GET', o(w, '/billing/usage?foo=1'))).status, 422)
    const otherC = await w.campus.billing.createContract(w.other.id, draft(), { adminId: 'ops-1' })
    assert.equal((await w.call('owner', 'GET', o(w, `/billing/usage?contractId=${otherC.id}`))).status, 404, 'another organization\'s contract')
  } finally { w.close() }
})

test('invoice export: billable count for a period, formula-safe, audited, recorded append-only; prices only when approved', async () => {
  const w = await world()
  try {
    const c = await w.campus.billing.createContract(w.org.id, draft({ name: '=cmd|synthetic' }), { adminId: 'ops-1' })
    await w.campus.billing.activateContract(c.id, { adminId: 'ops-1' })
    await w.campus.ledger.reserve({ resolution: resolutionFor(w, c.id), user: STAFF.student, sessionId: 'sess-i-1', idempotencyKey: 'ki' })
    await w.campus.ledger.consume({ entitlementId: c.id, user: STAFF.student, sessionId: 'sess-i-1' })
    const body = { contractId: c.id, periodStart: '2026-10-01', periodEnd: '2026-10-31' }
    assert.equal((await w.call('officer', 'POST', o(w, '/billing/invoice-exports'), body)).status, 404)
    assert.equal((await w.call('owner', 'POST', o(w, '/billing/invoice-exports'), { ...body, periodEnd: '2026-09-01' })).status, 422)
    assert.equal((await w.call('owner', 'POST', o(w, '/billing/invoice-exports'), { ...body, periodStart: '2025-01-01' })).status, 422, 'at most a year')
    const x = await w.call('owner', 'POST', o(w, '/billing/invoice-exports'), body)
    assert.equal(x.status, 200)
    assert.match(x.body.data.csv, /^Contract,Period start,Period end,Billable event,Billable assessments,Included seats,Seats in use\r\n'=cmd\|synthetic,2026-10-01,2026-10-31,Assessment completed,1,3,1/)
    assert.ok(!/Rate per billable assessment/.test(x.body.data.csv), 'no price columns without approval')
    assert.equal(x.body.data.export.billableCount, 1)
    const recorded = await w.repos.billing.listInvoiceExports(w.org.id)
    assert.deepEqual(recorded.map((r) => [r.contractId, r.billableCount, r.createdBy]), [[c.id, 1, STAFF.owner.id]])
    assert.throws(() => { w.repos.db.invoiceExports[0].billableCount = 9 }, TypeError, 'export records are immutable')
    assert.ok((await w.repos.campusAdmin.listOrgAudit(w.org.id)).some((e) => e.action === 'billing.invoice_exported' && e.targetId === c.id))
    const none = await w.call('owner', 'POST', o(w, '/billing/invoice-exports'), { ...body, periodStart: '2026-11-01', periodEnd: '2026-11-30' })
    assert.equal(none.body.data.export.billableCount, 0)
    w.repos.db.contractPricing.set(c.id, { contractId: c.id, perAssessmentRate: 1, platformFee: null, reassessmentRate: null, currency: 'XXX', approvedBy: 'finance-synthetic', approvedAt: NOW.toISOString() })
    assert.match((await w.call('owner', 'POST', o(w, '/billing/invoice-exports'), body)).body.data.csv, /Rate per billable assessment,Currency\r\n1,XXX/)
  } finally { w.close() }
})

test('integrations: honest status; SSO is an interface returning 501; the CSV adapter is the Phase 7 import path', async () => {
  const w = await world()
  try {
    const r = await w.call('owner', 'GET', o(w, '/integrations'))
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.data.items.map((i) => [i.id, i.status]), [['sis-csv', 'AVAILABLE'], ['sis-direct', 'NOT_CONNECTED'], ['sso', 'NOT_CONNECTED']])
    assert.deepEqual(r.body.data.signIn, [{ id: 'password', name: 'Email and password' }])
    assert.equal((await w.call('officer', 'GET', o(w, '/integrations'))).status, 404)
    const sso = await w.call(null, 'POST', '/auth/sso/start', {})
    assert.deepEqual([sso.status, sso.body.error.code], [501, 'NOT_IMPLEMENTED'])
    assert.deepEqual(listAuthProviders().map((p) => [p.id, p.status]), [['password', 'ENABLED'], ['sso', 'NOT_CONFIGURED']])
    assert.deepEqual(listSisAdapters().map((a) => [a.id, a.status]), [['csv', 'AVAILABLE']])
    const text = 'email,name\r\nsyn.a@test.local,"Synthetic, A"\r\n'
    assert.deepEqual(csvRosterAdapter.readRows(text), parseCsv(text))
    assert.match(read('../domain/campusAdmin/service.js'), /validateImport\(csvRosterAdapter\.readRows\(csv\)/, 'the Phase 7 import reads rows through the SIS adapter')
  } finally { w.close() }
})

test('independence: the B2C ₹499 payment route is unchanged and never meets campus billing; billing code never touches payments', () => {
  const payment = read('../routes/payment.js')
  assert.match(payment, /PRICE_PAISE\s*=\s*49900/)
  assert.ok(!/domain\/(billing|entitlements)|campus/i.test(payment), 'the payment route knows nothing about campus sponsorship')
  const billingDir = new URL('../domain/billing/', import.meta.url)
  for (const f of readdirSync(billingDir)) {
    const src = readFileSync(new URL(f, billingDir), 'utf8')
    assert.ok(!/v1_payments|razorpay|routes\/payment|PERSONAL_PURCHASE/i.test(src), `${f} must not touch direct payments`)
  }
  for (const f of ['../routes/v1/billing.js', '../routes/admin/organizations.js']) {
    assert.ok(!/v1_payments|razorpay|createEntitlement\(\{[^}]*mode/i.test(read(f)), `${f} must not touch direct payments`)
  }
  // No application path writes a price (K5): the pricing table is read-only in code.
  assert.ok(!/INSERT INTO campus_contract_pricing|UPDATE campus_contract_pricing/i.test(read('../domain/billing/repository.js')))
})
