// P8 — commercial fit invariants: product config is frozen configuration (not
// approved prices); grants are idempotent on provider keys; webhook replays
// never duplicate; expiry gates NEW activity only; technical-failure release is
// audited with the PROPOSED policy; Campus cannot assign unapproved content;
// sponsors cannot read private preparation/practice; cost usage is tagged
// pseudonymously; funnel events carry no text or PII.
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express from 'express'
import { PRODUCTS, PRODUCT_CODES, offerView, isPurchasable, SPRINT_PRICE_PAISE } from '../domain/commerce/products.js'
import { createGrantService, isActive, assertNewActivity } from '../domain/commerce/grants.js'
import { contribution, directCost, netRevenue, costPercentiles } from '../domain/commerce/unitEconomics.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createEntitlementLedger } from '../domain/entitlements/ledger.js'
import { createEntitlementResolver } from '../domain/entitlements/resolver.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { createV1Router } from '../routes/v1/index.js'
import { ApiError } from '../domain/http/errors.js'
import { assertContentAssignable } from '../domain/campusAdmin/service.js'
import { createContentRegistry } from '../domain/content/versions.js'
import { usageTags, recordUsage } from '../services/ai/costTracker.js'
import { PRODUCT_EVENTS, PROP_RULES, sanitizeProps, createTelemetryService } from '../domain/telemetry/events.js'

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-10-01T10:00:00Z')
const DAY = 86400000
const user = { id: 'user-commerce-1', email: 'c@test.local' }

// ── P8.4 product configuration ──────────────────────────────────────────────

test('P8.4: products are frozen configuration with exactly one amount (the existing ₹499) and no live approval', () => {
  assert.ok(Object.isFrozen(PRODUCTS))
  for (const code of PRODUCT_CODES) assert.ok(Object.isFrozen(PRODUCTS[code]), `${code} frozen`)
  assert.throws(() => { PRODUCTS.PERSONAL_DEVELOPMENT_SPRINT.price = 1 }, TypeError)
  const prices = PRODUCT_CODES.map((c) => PRODUCTS[c].price).filter((p) => p != null)
  assert.deepEqual(prices, [SPRINT_PRICE_PAISE])
  assert.equal(SPRINT_PRICE_PAISE, 49900)
  assert.equal(PRODUCTS.PERSONAL_DEVELOPMENT_SPRINT.status, 'TEST_HYPOTHESIS_PENDING_APPROVAL')
  assert.deepEqual(PRODUCTS.PERSONAL_DEVELOPMENT_SPRINT.included, { formalAssessments: 1, missionsSelectable: 4, attemptsPerMission: 2, freshChallenges: 1, practiceScenes: 0 })
  assert.equal(PRODUCTS.PERSONAL_DEVELOPMENT_SPRINT.windowDays, 30)
  assert.deepEqual(PRODUCTS.FREE_FIRST_EXPERIENCE.included, { practiceScenes: 1, observations: 1, retries: 1, formalAssessments: 0, missions: 0 })
  assert.equal(PRODUCTS.FREE_FIRST_EXPERIENCE.price, null)
  assert.equal(PRODUCTS.PROFESSIONAL_PREPARATION_PACK.status, 'UNAVAILABLE_PENDING_OWNER_QUOTA')
  assert.equal(PRODUCTS.PROFESSIONAL_PREPARATION_PACK.purchasable, false)
  assert.equal(isPurchasable('PROFESSIONAL_PREPARATION_PACK'), false)
  assert.equal(isPurchasable('PERSONAL_DEVELOPMENT_SPRINT'), true)
  // No subscription anywhere in the product config.
  assert.ok(!/subscri|recurring|monthly|annual/i.test(JSON.stringify(PRODUCTS)))
})

test('P8.6: the offer view carries the finance tax treatment as configured, null means to be confirmed, never a baked-in rate', () => {
  const none = offerView('PERSONAL_DEVELOPMENT_SPRINT', { taxTreatment: null })
  assert.equal(none.taxTreatment, null)
  assert.equal(none.amount, 49900)
  assert.equal(none.policy.status, 'PROPOSED')
  const set = offerView('PERSONAL_DEVELOPMENT_SPRINT', { taxTreatment: 'Inclusive of applicable GST' })
  assert.equal(set.taxTreatment, 'Inclusive of applicable GST')
  assert.equal(offerView('PROFESSIONAL_PREPARATION_PACK').purchasable, false)
  assert.equal(offerView('PROFESSIONAL_PREPARATION_PACK').amount, null)
  assert.equal(offerView('nope'), null)
})

// ── P8.5 grants: idempotency, expiry, release ───────────────────────────────

function world() {
  let now = NOW
  const repos = createMemoryCampusRepos({ clock: () => now })
  const audits = []
  const ledger = createEntitlementLedger({ repos, clock: () => now, audit: (...a) => audits.push(a) })
  const commerce = createGrantService({ repos, ledger, clock: () => now, audit: (type, sid, payload) => audits.push([type, sid, payload]) })
  return { repos, ledger, commerce, audits, setNow: (d) => { now = d } }
}

test('P8.5: same provider event key → same grant; a different key for the same order → same grant; a new order → a new grant', async () => {
  const w = world()
  const a = await w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:payment:pay_1', purchaseRef: 'order_1' })
  const b = await w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:payment:pay_1', purchaseRef: 'order_1' })
  assert.equal(a.created, true)
  assert.equal(b.created, false)
  assert.equal(a.grant.id, b.grant.id)
  const c = await w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:event:evt_9', purchaseRef: 'order_1' })
  assert.equal(c.grant.id, a.grant.id, 'the purchase reference also de-duplicates')
  const d = await w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:payment:pay_2', purchaseRef: 'order_2' })
  assert.notEqual(d.grant.id, a.grant.id)
  assert.equal((await w.commerce.listForUser(user.id)).length, 2)
  assert.equal(a.grant.fundingSource, 'PAID')
  assert.equal(a.grant.productVersion, '0.1')
  assert.equal(a.grant.policyVersion, 'offer-policy.v0.1-proposed')
  assert.equal(a.grant.validUntil, new Date(NOW.getTime() + 30 * DAY).toISOString())
  assert.equal(w.audits.filter(([t]) => t === 'commerce.grant.created').length, 2, 'one audit per CREATED grant, none for replays')
})

test('P8.5: concurrent grants for one payment collapse to one row', async () => {
  const w = world()
  const results = await Promise.all(Array.from({ length: 5 }, () => w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:payment:pay_c', purchaseRef: 'order_c' })))
  assert.equal(new Set(results.map((r) => r.grant.id)).size, 1)
  assert.equal(results.filter((r) => r.created).length, 1)
})

test('P8.5: a PAID grant for an unpurchasable product is refused; DEV grants are marked DEV', async () => {
  const w = world()
  await assert.rejects(w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'k', productCode: 'PROFESSIONAL_PREPARATION_PACK' }), (e) => e instanceof ApiError && e.code === 'CONFLICT')
  await assert.rejects(w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'k', productCode: 'MYSTERY' }), (e) => e.code === 'VALIDATION_FAILED')
  const dev = await w.commerce.grantForDev({ userId: user.id, reference: 'sess-1' })
  assert.equal(dev.grant.fundingSource, 'DEV')
  assert.equal((await w.commerce.grantForDev({ userId: user.id, reference: 'sess-1' })).grant.id, dev.grant.id)
})

test('P8.5: expiry and exhaustion block NEW activity with clear codes; report reads are untouched', async () => {
  const w = world()
  const { grant } = await w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:payment:pay_e', purchaseRef: 'order_e' })
  assert.equal(isActive(grant, NOW), true)
  assert.deepEqual(assertNewActivity({ grant, activity: 'FORMAL_ASSESSMENT', used: 0, now: NOW }), { remaining: 1 })
  assert.throws(() => assertNewActivity({ grant, activity: 'FORMAL_ASSESSMENT', used: 1, now: NOW }), (e) => e.code === 'ALLOWANCE_EXHAUSTED' && e.status === 409)
  assert.deepEqual(assertNewActivity({ grant, activity: 'MISSION_ATTEMPT', used: 7, now: NOW }), { remaining: 1 }, '4 missions × 2 attempts')
  assert.throws(() => assertNewActivity({ grant, activity: 'MISSION_ATTEMPT', used: 8, now: NOW }), (e) => e.code === 'ALLOWANCE_EXHAUSTED')
  assert.throws(() => assertNewActivity({ grant, activity: 'PRACTICE_SCENE', used: 0, now: NOW }), (e) => e.code === 'ENTITLEMENT_REQUIRED', 'not included → not exhausted, not included')
  const after = new Date(NOW.getTime() + 31 * DAY)
  assert.equal(isActive(grant, after), false)
  assert.throws(() => assertNewActivity({ grant, activity: 'FORMAL_ASSESSMENT', used: 0, now: after }), (e) => e.code === 'PACKAGE_EXPIRED' && e.status === 409 && /Reports you already received stay available/.test(e.message))
  // Report reads never consult the grant: the report module has no reference
  // to the commerce plane, and the campus context still serves history/reports
  // for a user whose only grant has expired.
  w.setNow(after)
  const report = { sessionId: 'legacy-r1', userId: user.id, scores: {}, generatedAt: NOW.toISOString() }
  const campus = createCampusContext({
    repos: w.repos, clock: () => after,
    legacy: { listEntitlements: async () => [], listSessionIds: async () => ['legacy-r1'], getSession: async () => ({ id: 'legacy-r1', userId: user.id, completed: true }), getReport: async () => report, getEntitlement: async () => null, createEntitlement: async () => null, paths: { purchase: '/payment', start: () => '/x', resume: () => '/x', report: () => '/x' } },
  })
  const history = await campus.history.list(user, { id: 'personal', type: 'PERSONAL' }, {})
  assert.ok(Array.isArray(history.items), 'history still lists after package expiry')
  const reportSource = await readFile(join(SERVER_ROOT, 'domain', 'reports', 'v3', 'service.js'), 'utf-8')
  assert.ok(!/commerce|product_grants|assertNewActivity|PACKAGE_EXPIRED/.test(reportSource), 'report reads do not consult package expiry')
  const historySource = await readFile(join(SERVER_ROOT, 'domain', 'student', 'history.js'), 'utf-8')
  assert.ok(!/commerce|product_grants|PACKAGE_EXPIRED/.test(historySource))
})

test('P8.5: reserve → release for technical failure is audited with policy PROPOSED and issues no refund; replay is a no-op', async () => {
  const w = world()
  const ent = await w.repos.entitlements.createEntitlement({ userId: user.id, sourceType: 'PERSONAL_PURCHASE', productCode: 'PERSONAL_DEVELOPMENT_SPRINT', quantity: 1, validFrom: NOW.toISOString(), status: 'ACTIVE' })
  const resolver = createEntitlementResolver({ repos: w.repos, clock: () => NOW, legacyLookup: async () => [] })
  const resolution = await resolver.resolveEntitlement({ user, workspace: { id: 'personal', type: 'PERSONAL' } })
  const { consumption } = await w.commerce.reserve({ resolution, user, sessionId: 'sess-tf', idempotencyKey: 'begin-1' })
  assert.equal((await w.repos.entitlements.getEntitlement(ent.id)).consumedQuantity, 1)
  // Repeated Begin with the same key never takes a second seat.
  const again = await w.commerce.reserve({ resolution, user, sessionId: 'sess-tf', idempotencyKey: 'begin-1' })
  assert.equal(again.replayed, true)
  await assert.rejects(w.commerce.releaseForTechnicalFailure(consumption.id, 'x'), (e) => e.code === 'VALIDATION_FAILED')
  await assert.rejects(w.commerce.releaseForTechnicalFailure('missing-id', 'evaluator unavailable'), (e) => e.code === 'NOT_FOUND')
  const released = await w.commerce.releaseForTechnicalFailure(consumption.id, 'evaluator unavailable (REPORT_PROCESSING_FAILED)', { actorId: 'ops-1' })
  assert.equal(released.policy, 'PROPOSED')
  assert.equal(released.refundIssued, false)
  assert.equal((await w.repos.entitlements.getEntitlement(ent.id)).consumedQuantity, 0, 'the seat is reissued')
  const audit = w.audits.find(([t]) => t === 'entitlement.released_technical_failure')
  assert.ok(audit, 'release is audited')
  assert.equal(audit[2].policy, 'PROPOSED')
  assert.equal(audit[2].refundIssued, false)
  assert.equal(audit[2].reservationId, consumption.id)
  const replay = await w.commerce.releaseForTechnicalFailure(consumption.id, 'evaluator unavailable (REPORT_PROCESSING_FAILED)')
  assert.equal(replay.replayed, true)
  assert.equal(w.audits.filter(([t]) => t === 'entitlement.released_technical_failure').length, 1)
})

test('P8.5: mission selection is bounded to the package (four, chosen once) and refused after expiry', async () => {
  const w = world()
  const { grant } = await w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:payment:pay_m', purchaseRef: 'order_m' })
  await assert.rejects(w.commerce.selectMissions({ userId: user.id, grantId: grant.id, missionIds: ['m1', 'm2', 'm3', 'm4', 'm5'] }), (e) => e.code === 'VALIDATION_FAILED')
  await assert.rejects(w.commerce.selectMissions({ userId: 'someone-else', grantId: grant.id, missionIds: ['m1'] }), (e) => e.code === 'NOT_FOUND')
  const chosen = await w.commerce.selectMissions({ userId: user.id, grantId: grant.id, missionIds: ['m1', 'm2', 'm2', 'm3'] })
  assert.deepEqual(chosen.selectedMissionIds, ['m1', 'm2', 'm3'])
  await assert.rejects(w.commerce.selectMissions({ userId: user.id, grantId: grant.id, missionIds: ['m4'] }), (e) => e.code === 'CONFLICT')
  const { grant: g2 } = await w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:payment:pay_m2', purchaseRef: 'order_m2' })
  w.setNow(new Date(NOW.getTime() + 31 * DAY))
  await assert.rejects(w.commerce.selectMissions({ userId: user.id, grantId: g2.id, missionIds: ['m1'] }), (e) => e.code === 'PACKAGE_EXPIRED')
})

// ── P8.5 webhook replay over the real payment router ────────────────────────

test('P8.5/T53: webhook replay and reordering produce one grant; bad signatures are refused; unconfigured is closed', async () => {
  const saved = { ...process.env }
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-commerce-'))
  process.env.JWT_SECRET = 'commerce-test-secret'
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_fixture'
  delete process.env.PRISM_PG_STORE
  delete process.env.PRISM_DUMMY_PAYMENTS
  const { buildApp } = await import('../app.js')
  const { setCommerceServiceForTests } = await import('../domain/commerce/index.js')
  const w = world()
  setCommerceServiceForTests(w.commerce)
  const app = buildApp()
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const body = (eventId, event = 'payment.captured') => JSON.stringify({
      event, payload: { payment: { entity: { id: 'pay_fixture_1', order_id: 'order_fixture_1', notes: { userId: user.id, productCode: 'PERSONAL_DEVELOPMENT_SPRINT' } } } }, created_at: 1, id: eventId,
    })
    const send = async (raw, signature) => fetch(`${base}/api/payment/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'x-razorpay-signature': signature } : {}) }, body: raw,
    })
    const sig = (raw) => crypto.createHmac('sha256', 'whsec_test_fixture').update(raw).digest('hex')

    assert.equal((await send(body('evt_1'))).status, 400, 'missing signature refused')
    assert.equal((await send(body('evt_1'), 'deadbeef')).status, 400, 'wrong signature refused')
    const first = body('evt_1')
    const r1 = await send(first, sig(first))
    assert.equal(r1.status, 200)
    assert.equal((await r1.json()).duplicate, false)
    // Replayed delivery, then a reordered authorized event for the same payment.
    const r2 = await send(first, sig(first))
    assert.equal(r2.status, 200)
    assert.equal((await r2.json()).duplicate, true)
    const reordered = body('evt_0', 'payment.authorized')
    const r3 = await send(reordered, sig(reordered))
    assert.equal(r3.status, 200)
    assert.equal((await r3.json()).duplicate, true)
    assert.equal((await w.commerce.listForUser(user.id)).length, 1, 'exactly one grant')
    // Unrelated events acknowledge without granting.
    const refund = JSON.stringify({ event: 'refund.created', payload: { payment: { entity: { id: 'pay_fixture_2', notes: { userId: user.id } } } } })
    const r4 = await send(refund, sig(refund))
    assert.equal(r4.status, 200)
    assert.equal((await w.commerce.listForUser(user.id)).length, 1)

    delete process.env.RAZORPAY_WEBHOOK_SECRET
    assert.equal((await send(first)).status, 503, 'closed without a secret outside dummy mode')
    process.env.PRISM_DUMMY_PAYMENTS = 'true'
    const dummy = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_dummy_1', order_id: 'order_dummy_1', notes: { userId: user.id } } } } })
    assert.equal((await send(dummy)).status, 200, 'dummy fixture path accepts a reviewed fixture body')
    assert.equal((await send(dummy)).status, 200)
    assert.equal((await w.commerce.listForUser(user.id)).length, 2)
  } finally {
    setCommerceServiceForTests(null)
    server.close()
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  }
})

test('P8.5: /api/payment/config publishes the offer with tax treatment from the server and the professional pack unpurchasable', async () => {
  const saved = { ...process.env }
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-commerce-cfg-'))
  process.env.JWT_SECRET = 'commerce-test-secret'
  delete process.env.PRISM_TAX_TREATMENT
  const { buildApp } = await import('../app.js')
  const server = buildApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  try {
    const cfg = await (await fetch(`http://127.0.0.1:${server.address().port}/api/payment/config`)).json()
    assert.equal(cfg.amount, 49900)
    assert.equal(cfg.offer.code, 'PERSONAL_DEVELOPMENT_SPRINT')
    assert.equal(cfg.offer.amount, 49900)
    assert.equal(cfg.offer.taxTreatment, null)
    assert.equal(cfg.offer.windowDays, 30)
    assert.equal(cfg.offer.policy.status, 'PROPOSED')
    const pro = cfg.offers.find((o) => o.code === 'PROFESSIONAL_PREPARATION_PACK')
    assert.equal(pro.purchasable, false)
    assert.equal(pro.amount, null)
    assert.ok(!('taxRate' in cfg.offer), 'no tax rate is published to the client')
  } finally {
    server.close()
    Object.assign(process.env, saved)
  }
})

// ── P8.7 Campus: content approval gate + sponsor isolation ──────────────────

test('P8.7: a DRAFT governed form cannot be assigned (409 CONTENT_NOT_APPROVED); APPROVED_FOR_PILOT can; unknown forms pass through', () => {
  const authored = [{ formId: 'draft-core-teamready-a:0.1.0-draft', contentId: 'draft-core-teamready-a', blueprintId: 'B', version: '0.1.0-draft', title: 'T', kind: 'UNIVERSAL_FORM', approvalHistory: [{ state: 'DRAFT', at: null, by: null, reason: 'initial' }], opportunities: 1, stages: 1 }]
  const registry = createContentRegistry({ authored })
  assert.throws(() => assertContentAssignable('draft-core-teamready-a:0.1.0-draft', registry), (e) => e.code === 'CONTENT_NOT_APPROVED' && e.status === 409)
  assert.equal(assertContentAssignable('legacy-frozen-form:1.0', registry), null)
  assert.equal(assertContentAssignable(null, registry), null)
  registry.transition({ formId: 'draft-core-teamready-a:0.1.0-draft', to: 'REVIEW', actor: { permissions: ['content:publish'] }, reason: 'ready for a review pass' })
  assert.throws(() => assertContentAssignable('draft-core-teamready-a:0.1.0-draft', registry), (e) => e.code === 'CONTENT_NOT_APPROVED')
  registry.transition({ formId: 'draft-core-teamready-a:0.1.0-draft', to: 'APPROVED_FOR_PILOT', actor: { permissions: ['content:publish'] }, reason: 'pilot approval recorded' })
  assert.equal(assertContentAssignable('draft-core-teamready-a:0.1.0-draft', registry), 'APPROVED_FOR_PILOT')
})

test('P8.7: over /api/v1 a campus owner gets 409 CONTENT_NOT_APPROVED for the DRAFT universal form', async () => {
  process.env.PRISM_CAMPUS_ENABLED = 'true'
  const now = new Date('2026-10-05T09:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u-p8', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const cohort = await repos.organizations.createCohort({ organizationId: org.id, name: 'Cohort P8' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: 'owner-p8', role: 'ORG_OWNER', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: 'student-p8', role: 'STUDENT', status: 'ACTIVE' })
  await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: 'student-p8' })
  // The universal DRAFT form appears in the bank exactly as PRISM_DRAFT_CONTENT exposes it.
  const { draftBankScenarios } = await import('../domain/assessments/draftSegments.js')
  const savedFlag = process.env.PRISM_DRAFT_CONTENT
  process.env.PRISM_DRAFT_CONTENT = 'true'
  const bank = draftBankScenarios()
  if (savedFlag === undefined) delete process.env.PRISM_DRAFT_CONTENT; else process.env.PRISM_DRAFT_CONTENT = savedFlag
  const campus = createCampusContext({ repos, clock: () => now, users: { findById: async (id) => ({ id, name: id, email: `${id}@test.local` }), findByEmail: async () => null }, scenarioSource: async () => ({ generalScenarios: [{ id: 'syn-general-a' }], bankScenarios: bank }), audit: () => {} })
  const requireUser = (req, _res, next) => { const id = req.get('x-test-user'); if (!id) return next(new ApiError('UNAUTHENTICATED', 'Sign in.')); req.user = { id, email: `${id}@test.local` }; next() }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = (who, method, path, body) => fetch(`${base}${path}`, { method, headers: { 'x-test-user': who, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  try {
    const cat = await (await call('owner-p8', 'GET', `/organizations/${org.id}/assessment-catalog`)).json()
    const draftDef = cat.data.items.find((d) => d.id === 'draft-core-teamready-a')
    assert.ok(draftDef, 'the draft universal form is in the catalog behind PRISM_DRAFT_CONTENT')
    const window = { windowStart: '2026-10-05T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z' }
    const res = await call('owner-p8', 'POST', `/organizations/${org.id}/assignments`, { definitionId: draftDef.id, cohortIds: [cohort.id], ...window })
    assert.equal(res.status, 409)
    const json = await res.json()
    assert.equal(json.error.code, 'CONTENT_NOT_APPROVED')
    // The frozen legacy pool is still assignable.
    const ok = await call('owner-p8', 'POST', `/organizations/${org.id}/assignments`, { definitionId: cat.data.items.find((d) => d.id !== 'draft-core-teamready-a').id, cohortIds: [cohort.id], ...window })
    assert.equal(ok.status, 201)
    // Sponsor isolation: no campus route reads private preparation/practice/self-report.
    for (const path of [`/organizations/${org.id}/students/student-p8/preparation`, `/organizations/${org.id}/students/student-p8/practice`, `/organizations/${org.id}/students/student-p8/self-report`, `/organizations/${org.id}/preparation`, `/organizations/${org.id}/previews`]) {
      assert.equal((await call('owner-p8', 'GET', path)).status, 404, path)
    }
  } finally {
    server.close()
  }
})

test('P8.7: no Campus read surface references private preparation, practice-allowance, self-report or preview tables', async () => {
  const PRIVATE = /preparation_attempts|preparation_turns|action_cards|application_checkins|practice_allowances|preview_attempts|SELF_REPORT_CHECKIN|listCheckinHistory|listAttemptHistory\(/
  const campusSurfaces = [
    join(SERVER_ROOT, 'domain', 'campusAdmin', 'service.js'), join(SERVER_ROOT, 'domain', 'campusAdmin', 'repository.pg.js'),
    join(SERVER_ROOT, 'domain', 'analytics', 'service.js'), join(SERVER_ROOT, 'routes', 'v1', 'campusAdmin.js'), join(SERVER_ROOT, 'routes', 'v1', 'analytics.js'),
    join(SERVER_ROOT, 'domain', 'reports', 'v3', 'service.js'),
  ]
  for (const f of campusSurfaces) {
    const src = await readFile(f, 'utf-8')
    assert.ok(!PRIVATE.test(src), `${f} must not read private learner tables`)
  }
  // And the preparation repository never joins an organization.
  for (const entry of await readdir(join(SERVER_ROOT, 'domain', 'preparation'))) {
    const src = await readFile(join(SERVER_ROOT, 'domain', 'preparation', entry), 'utf-8')
    assert.ok(!/organization_id|organizationId/.test(src), `${entry} is PERSONAL-only`)
  }
})

// ── P8.8 cost tags + unit economics ─────────────────────────────────────────

test('P8.8: usage records carry mode, hashed run id, method version and product code; raw run ids never appear', () => {
  const tags = usageTags({ mode: 'PRACTICE', runId: 'session-secret-123', methodVersion: 'v3-slice-0.1', productCode: 'PERSONAL_DEVELOPMENT_SPRINT' })
  assert.equal(tags.mode, 'PRACTICE')
  assert.equal(tags.methodVersion, 'v3-slice-0.1')
  assert.equal(tags.productCode, 'PERSONAL_DEVELOPMENT_SPRINT')
  assert.match(tags.runIdHash, /^[0-9a-f]{24}$/)
  assert.ok(!JSON.stringify(tags).includes('session-secret-123'))
  assert.deepEqual(usageTags({ mode: 'bogus', productCode: 'lower', methodVersion: 'bad space' }), { mode: null, runIdHash: null, methodVersion: null, productCode: null })
  const cost = recordUsage({ task: 'evaluate', modelId: 'some.unpriced-model', response: { usage: { inputTokens: 10, outputTokens: 5 } }, sessionId: 'run-x', tags: { mode: 'FORMAL', methodVersion: 'm1', productCode: 'PERSONAL_DEVELOPMENT_SPRINT' } })
  assert.equal(cost, null, 'unknown rate → null, never zero')
})

test('P8.8: contribution follows the formula; unknown components stay partial; margin withheld for zero/unknown denominator; no double counting', () => {
  const full = contribution({ netRevenue: { collected: 499, taxes: 76, refunds: 0 }, costs: { dialogue: 10, evaluation: 20, verification: 5, audio: 0, infrastructure: 4, paymentFees: 12, reviewSupport: 15, retryRecovery: 3 } })
  assert.equal(full.netRevenue.amount, 423)
  assert.equal(full.directCost.amount, 69)
  assert.equal(full.contribution, 354)
  assert.equal(full.contributionMargin, +(354 / 423).toFixed(4))
  assert.equal(full.status, 'known')
  assert.equal(full.basis, 'ACTUAL')
  const partial = contribution({ netRevenue: { collected: 499, taxes: 76, refunds: 0 }, costs: { dialogue: 10, evaluation: null } , basis: 'HYPOTHESIS' })
  assert.equal(partial.status, 'partial')
  assert.equal(partial.contributionMargin, null, 'margin withheld when any component is unknown')
  assert.equal(partial.basis, 'HYPOTHESIS')
  const zero = contribution({ netRevenue: { collected: 0, taxes: 0, refunds: 0 }, costs: { dialogue: 1, evaluation: 1, verification: 0, audio: 0, infrastructure: 0, paymentFees: 0, reviewSupport: 0, retryRecovery: 0 } })
  assert.equal(zero.contribution, -2)
  assert.equal(zero.contributionMargin, null, 'no margin for a zero denominator')
  assert.equal(netRevenue({}).status, 'unknown')
  assert.equal(directCost({}).status, 'unknown')
  assert.throws(() => directCost({ paymentFees: 1, gatewayFee: 1 }), /counted twice|unknown cost component/)
  assert.deepEqual(costPercentiles([0.3, null, 0.1, 0.2, 0.9]), { n: 4, unknown: 1, p50: 0.3, p95: 0.9 })
})

// ── P8.9 funnel events without text or PII ──────────────────────────────────

test('P8.9: preview/offer/purchase events exist and carry only pseudonymous ids, enums and counts', async () => {
  for (const e of ['preview_started', 'preview_completed', 'preview_claimed', 'offer_viewed', 'checkout_started', 'purchase_completed', 'purchase_failed']) assert.ok(PRODUCT_EVENTS.includes(e), e)
  for (const key of Object.keys(PROP_RULES)) assert.ok(!/text|answer|email|name|token|payment|amount|price|transcript|note/i.test(key), `prop ${key} looks like content/PII`)
  const { props, dropped } = sanitizeProps({ productCode: 'PERSONAL_DEVELOPMENT_SPRINT', fundingSource: 'PAID', outcome: 'OBSERVED', count: 1, answer: 'my sentence', email: 'a@b.c', paymentId: 'pay_1', amount: 499, previewToken: 'abc.def.ghi' })
  assert.deepEqual(props, { productCode: 'PERSONAL_DEVELOPMENT_SPRINT', fundingSource: 'PAID', outcome: 'OBSERVED', count: 1 })
  assert.deepEqual(dropped.sort(), ['amount', 'answer', 'email', 'paymentId', 'previewToken'])
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const telemetry = createTelemetryService({ repos, clock: () => NOW, hashActor: () => null })
  await telemetry.record({ user: null, workspace: null, event: 'preview_completed', props: { outcome: 'OBSERVED', answer: 'leak' } })
  const [row] = await repos.productEvents.list({ event: 'preview_completed' })
  assert.equal(row.actorHash, null)
  assert.ok(!JSON.stringify(row).includes('leak'))
  // The client allow-list mirrors the server one for the funnel events.
  const client = await readFile(join(SERVER_ROOT, '..', 'src', 'lib', 'telemetry.js'), 'utf-8')
  for (const e of ['preview_completed', 'offer_viewed', 'checkout_started', 'purchase_completed']) assert.ok(client.includes(`'${e}'`), `client tracks ${e}`)
})

test('P8: the migrations are additive with reversals and the payment constant is unchanged', async () => {
  const dir = join(SERVER_ROOT, 'db', 'migrations')
  for (const name of ['0048_product_grants', '0049_preview_attempts']) {
    const up = await readFile(join(dir, `${name}.sql`), 'utf-8')
    const down = await readFile(join(dir, `${name}.down.sql`), 'utf-8')
    assert.ok(!/DROP TABLE(?! IF EXISTS)/.test(up) && !/ALTER TABLE \w+ DROP/.test(up), `${name} up is additive`)
    assert.match(down, /DROP TABLE IF EXISTS/)
  }
  const up48 = await readFile(join(dir, '0048_product_grants.sql'), 'utf-8')
  assert.match(up48, /purchase_ref\s+TEXT UNIQUE/)
  assert.match(up48, /provider_event_key\s+TEXT UNIQUE/)
  const payment = await readFile(join(SERVER_ROOT, 'routes', 'payment.js'), 'utf-8')
  assert.match(payment, /PRICE_PAISE\s*=\s*49900/)
  assert.ok(!/subscription/i.test(payment))
})
