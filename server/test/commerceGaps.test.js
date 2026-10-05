// P8 gap-closing pass — the spec items c2a38dd left open, each tied to a source
// test id: T53 (payment scenarios, client success ≠ grant), T54 (release
// policy), T55 (expiry during an active run), T57 (grandfathering snapshot),
// T58 (soft budget never interrupts a paid run), T59 (synthetic previews out of
// metrics), P8.2 (display name / research permission never near scoring),
// P8.6 (bundle blocked while content is draft), P8.7 (engagement recorded),
// P8.9 (serializer rejects sensitive payloads).
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import express from 'express'
import { offerAvailability, offerView, TAX_PENDING_LABEL, PRODUCTS } from '../domain/commerce/products.js'
import { liveOfferView, liveOfferAvailability } from '../domain/commerce/index.js'
import { createGrantService, isActive, assertNewActivity } from '../domain/commerce/grants.js'
import { evaluateSoftBudget, readSoftBudget } from '../domain/commerce/softBudget.js'
import { createPreviewService } from '../domain/commerce/preview.js'
import { contribution, costPercentiles } from '../domain/commerce/unitEconomics.js'
import { createMemoryCampusRepos } from '../domain/campusStore/index.js'
import { createEntitlementLedger } from '../domain/entitlements/ledger.js'
import { createEntitlementResolver } from '../domain/entitlements/resolver.js'
import { createCampusContext } from '../domain/campusStore/context.js'
import { createV1Router } from '../routes/v1/index.js'
import { ApiError } from '../domain/http/errors.js'
import { sanitizeProps, PROP_RULES, PRODUCT_EVENTS } from '../domain/telemetry/events.js'
import { validateEvent, ALLOWED_PAYLOAD_KEYS, LEGACY_EVENT_ALIASES, CANONICAL_EVENTS } from '../domain/metrics/events.js'
import { MISSION_LIBRARY } from '../domain/development/missionLibrary.js'

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-10-01T10:00:00Z')
const DAY = 86400000
const user = { id: 'user-gap-1', email: 'g@test.local' }
const GOOD = 'Nia, can you take the room booking by Friday? Dev, please hand the invitations list to Nia before you leave tomorrow. What else do we still need to know?'
const APPROVED_TERMS_FIXTURE = {
  taxTreatment: 'Synthetic finance-reviewed tax presentation',
  policy: { status: 'APPROVED', recovery: 'Synthetic approved failed-service reissue terms', review: 'Synthetic approved review terms', refund: 'Synthetic approved refund terms' },
}

function world() {
  let now = NOW
  const repos = createMemoryCampusRepos({ clock: () => now })
  const audits = []
  const ledger = createEntitlementLedger({ repos, clock: () => now, audit: (...a) => audits.push(a) })
  const commerce = createGrantService({ repos, ledger, clock: () => now, audit: (type, sid, payload) => audits.push([type, sid, payload]) })
  return { repos, ledger, commerce, audits, setNow: (d) => { now = d }, now: () => now }
}

async function appWorld({ env = {} } = {}) {
  const saved = { ...process.env }
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-p8gap-'))
  process.env.JWT_SECRET = 'p8gap-test-secret'
  delete process.env.PRISM_PG_STORE
  delete process.env.PRISM_DUMMY_PAYMENTS
  delete process.env.PRISM_OFFER_PRICE_APPROVED
  delete process.env.PRISM_TAX_TREATMENT
  Object.assign(process.env, env)
  const { buildApp } = await import('../app.js')
  const { setCommerceServiceForTests } = await import('../domain/commerce/index.js')
  const w = world()
  setCommerceServiceForTests(w.commerce)
  const server = buildApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const jwt = (await import('jsonwebtoken')).default
  const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET)
  const close = () => {
    setCommerceServiceForTests(null)
    server.close()
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  }
  return { w, base, token, close }
}

// ── P8.6 bundle availability ────────────────────────────────────────────────

test('P8.6: the sprint is NOT purchasable while fewer than four missions are reviewed, the form is draft or the price is unapproved; every blocker is named', () => {
  const none = offerAvailability('PERSONAL_DEVELOPMENT_SPRINT', { missions: [], formStates: ['DRAFT'], priceApproved: false })
  assert.equal(none.purchasable, false)
  assert.deepEqual(none.blockers.map((b) => b.code), ['PRICE_NOT_APPROVED', 'CONTENT_NOT_REVIEWED', 'FORM_NOT_REVIEWED', 'TAX_PRESENTATION_NOT_CONFIGURED', 'RECOVERY_POLICY_NOT_APPROVED'])
  assert.equal(none.priceStatus, 'PROPOSED')
  assert.equal(none.reviewedMissions, 0)
  assert.equal(none.requiredMissions, 4)
  const threeReviewed = offerAvailability('PERSONAL_DEVELOPMENT_SPRINT', { ...APPROVED_TERMS_FIXTURE, missions: [{ status: 'PUBLISHED' }, { status: 'APPROVED_FOR_PILOT' }, { status: 'PUBLISHED' }, { status: 'DRAFT' }], formStates: ['APPROVED_FOR_PILOT'], priceApproved: true })
  assert.deepEqual(threeReviewed.blockers.map((b) => b.code), ['CONTENT_NOT_REVIEWED'])
  assert.match(threeReviewed.blockers[0].message, /3 of the 4/)
  const ready = offerAvailability('PERSONAL_DEVELOPMENT_SPRINT', { ...APPROVED_TERMS_FIXTURE, missions: Array(4).fill({ status: 'PUBLISHED' }), formStates: ['APPROVED_FOR_PILOT'], priceApproved: true })
  assert.equal(ready.purchasable, true)
  assert.deepEqual(ready.blockers, [])
  assert.equal(ready.priceStatus, 'APPROVED')
  // Not-for-sale products never become purchasable by content alone.
  const pro = offerAvailability('PROFESSIONAL_PREPARATION_PACK', { missions: Array(10).fill({ status: 'PUBLISHED' }), formStates: ['APPROVED_FOR_INTENDED_USE'], priceApproved: true })
  assert.equal(pro.purchasable, false)
  assert.equal(pro.blockers[0].code, 'NOT_FOR_SALE')
  assert.equal(offerAvailability('FREE_FIRST_EXPERIENCE').purchasable, false)
})

test('paid offers remain unavailable with reviewed content and price until tax presentation and recovery terms are ready', () => {
  const contentReady = { missions: Array(4).fill({ status: 'PUBLISHED' }), formStates: ['APPROVED_FOR_PILOT'], priceApproved: true, taxTreatment: null }
  const pending = offerAvailability('PERSONAL_DEVELOPMENT_SPRINT', contentReady)
  assert.equal(pending.purchasable, false)
  assert.deepEqual(pending.blockers.map((b) => b.code), ['TAX_PRESENTATION_NOT_CONFIGURED', 'RECOVERY_POLICY_NOT_APPROVED'])
  const onlyTax = offerAvailability('PERSONAL_DEVELOPMENT_SPRINT', { ...contentReady, taxTreatment: APPROVED_TERMS_FIXTURE.taxTreatment })
  assert.deepEqual(onlyTax.blockers.map((b) => b.code), ['RECOVERY_POLICY_NOT_APPROVED'])
  for (const policy of [
    { ...APPROVED_TERMS_FIXTURE.policy, status: 'PROPOSED' },
    { ...APPROVED_TERMS_FIXTURE.policy, refund: 'pending approval' },
    { ...APPROVED_TERMS_FIXTURE.policy, recovery: '' },
  ]) {
    assert.equal(offerAvailability('PERSONAL_DEVELOPMENT_SPRINT', { ...contentReady, ...APPROVED_TERMS_FIXTURE, policy }).purchasable, false)
  }
  const configured = liveOfferAvailability('PERSONAL_DEVELOPMENT_SPRINT', { priceApproved: true, taxTreatment: APPROVED_TERMS_FIXTURE.taxTreatment, policy: APPROVED_TERMS_FIXTURE.policy })
  assert.ok(configured.blockers.some((b) => b.code === 'RECOVERY_POLICY_NOT_APPROVED'), 'live wiring ignores a caller policy override; actual server policy is still proposed')
})

test('P8.6: in THIS build the live offer is honestly unpurchasable (draft missions), the tax label says finance has not approved, test mode is explicit', () => {
  const reviewed = MISSION_LIBRARY.filter((m) => ['PUBLISHED', 'APPROVED_FOR_PILOT', 'APPROVED_FOR_INTENDED_USE'].includes(m.status)).length
  assert.ok(reviewed < 4, `only ${reviewed} reviewed mission(s) exist; the four-mission bundle cannot be sold yet`)
  const live = liveOfferView('PERSONAL_DEVELOPMENT_SPRINT', { taxTreatment: null, priceApproved: false })
  assert.equal(live.purchasable, false)
  assert.equal(live.availability.reviewedMissions, reviewed, 'the live view counts the real reviewed missions (latest version per mission id)')
  assert.ok(live.availability.reviewedMissions >= 1, 'the published legacy mission counts as reviewed')
  assert.ok(live.availability.blockers.some((b) => b.code === 'CONTENT_NOT_REVIEWED'))
  assert.equal(live.taxLabel, TAX_PENDING_LABEL)
  assert.equal(live.testMode, true)
  assert.equal(live.amount, 49900, 'the configured amount is still shown, labelled PROPOSED')
  assert.equal(live.priceStatus, 'PROPOSED')
  // Even with the price approved, draft content keeps the bundle closed.
  const approvedPrice = liveOfferAvailability('PERSONAL_DEVELOPMENT_SPRINT', { priceApproved: true })
  assert.equal(approvedPrice.purchasable, false)
  assert.deepEqual(approvedPrice.blockers.map((b) => b.code).includes('PRICE_NOT_APPROVED'), false)
  // Finance-configured treatment replaces the pending label; no rate is ever derived.
  const withTax = offerView('PERSONAL_DEVELOPMENT_SPRINT', { taxTreatment: 'Inclusive of applicable GST', availability: { purchasable: true, priceStatus: 'APPROVED', blockers: [] } })
  assert.equal(withTax.taxLabel, 'Inclusive of applicable GST')
  assert.ok(!('taxRate' in withTax))
  assert.ok(!/\d+\s*%/.test(JSON.stringify(PRODUCTS)), 'no percentage anywhere in the product config')
})

test('P8.6/T53: create-order refuses an unpurchasable bundle with 409 and the same blockers the checkout shows; config publishes them', async () => {
  const { base, token, close } = await appWorld()
  try {
    const cfg = await (await fetch(`${base}/api/payment/config`)).json()
    assert.equal(cfg.offer.purchasable, false)
    assert.equal(cfg.offer.taxLabel, TAX_PENDING_LABEL)
    assert.ok(cfg.offer.availability.blockers.length >= 1)
    const res = await fetch(`${base}/api/payment/create-order`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    assert.equal(res.status, 409)
    const body = await res.json()
    assert.equal(body.code, 'OFFER_NOT_PURCHASABLE')
    assert.deepEqual(body.blockers.map((b) => b.code), cfg.offer.availability.blockers.map((b) => b.code))
    assert.equal((await fetch(`${base}/api/payment/create-order`, { method: 'POST' })).status, 401)
  } finally {
    close()
  }
})

// ── P8.5 / T53 / T54 / T55 payment and allowance scenarios ───────────────────

test('T53: client success is not a grant — a forged verify is refused and leaves no grant; an abandoned checkout grants nothing', async () => {
  const { w, base, token, close } = await appWorld({ env: { RAZORPAY_KEY_SECRET: 'rzp_test_secret_fixture', RAZORPAY_KEY_ID: 'rzp_test_id_fixture' } })
  try {
    const forged = await fetch(`${base}/api/payment/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ razorpay_order_id: 'order_abandoned', razorpay_payment_id: 'pay_forged', razorpay_signature: 'ab'.repeat(32) }),
    })
    assert.equal(forged.status, 400)
    assert.equal((await w.commerce.listForUser(user.id)).length, 0, 'no grant from a client-side "success"')
    assert.equal((await fetch(`${base}/api/payment/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401)
    // Abandoned checkout: nothing was verified, nothing is granted.
    assert.equal((await w.commerce.listForUser(user.id)).length, 0)
    // A correctly signed verify (the provider's signature over order|payment) grants exactly once.
    const sig = crypto.createHmac('sha256', 'rzp_test_secret_fixture').update('order_ok|pay_ok').digest('hex')
    const ok = await fetch(`${base}/api/payment/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ razorpay_order_id: 'order_ok', razorpay_payment_id: 'pay_ok', razorpay_signature: sig }),
    })
    assert.equal(ok.status, 200)
    const okBody = await ok.json()
    assert.ok(okBody.grantId)
    // Network loss after payment → the client retries verify: same grant, not a second one.
    const again = await (await fetch(`${base}/api/payment/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ razorpay_order_id: 'order_ok', razorpay_payment_id: 'pay_ok', razorpay_signature: sig }),
    })).json()
    assert.equal(again.grantId, okBody.grantId)
    assert.equal((await w.commerce.listForUser(user.id)).length, 1)
  } finally {
    close()
  }
})

test('T53: provider delay (webhook before verify) and network loss (webhook only) both end with exactly one grant', async () => {
  const { w, base, token, close } = await appWorld({ env: { RAZORPAY_KEY_SECRET: 'rzp_test_secret_fixture', RAZORPAY_KEY_ID: 'rzp_test_id_fixture', RAZORPAY_WEBHOOK_SECRET: 'whsec_fixture' } })
  try {
    const hook = (paymentId, orderId) => JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, notes: { userId: user.id } } } } })
    const send = (raw) => fetch(`${base}/api/payment/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': crypto.createHmac('sha256', 'whsec_fixture').update(raw).digest('hex') }, body: raw })
    // Provider delay: the webhook lands first.
    assert.equal((await send(hook('pay_delay', 'order_delay'))).status, 200)
    const sig = crypto.createHmac('sha256', 'rzp_test_secret_fixture').update('order_delay|pay_delay').digest('hex')
    const verify = await (await fetch(`${base}/api/payment/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ razorpay_order_id: 'order_delay', razorpay_payment_id: 'pay_delay', razorpay_signature: sig }),
    })).json()
    const grants = await w.commerce.listForUser(user.id)
    assert.equal(grants.length, 1)
    assert.equal(verify.grantId, grants[0].id, 'verify returns the grant the webhook created')
    // Network loss after payment: only the webhook ever arrives (twice).
    assert.equal((await send(hook('pay_lost', 'order_lost'))).status, 200)
    assert.equal((await (await send(hook('pay_lost', 'order_lost'))).json()).duplicate, true)
    assert.equal((await w.commerce.listForUser(user.id)).length, 2)
    const lost = (await w.commerce.listForUser(user.id)).find((g) => g.purchaseRef === 'order_lost')
    assert.equal(lost.fundingSource, 'PAID')
    assert.equal(lost.productVersion, '0.1')
    assert.equal(lost.policyVersion, 'offer-policy.v0.1-proposed')
    assert.ok(lost.validUntil)
  } finally {
    close()
  }
})

test('T55: expiry during an allowed active run finalizes the already-reserved seat; only a NEW start is blocked; concurrent starts take one seat', async () => {
  const w = world()
  const ent = await w.repos.entitlements.createEntitlement({ userId: user.id, sourceType: 'PERSONAL_PURCHASE', productCode: 'PERSONAL_DEVELOPMENT_SPRINT', quantity: 1, validFrom: NOW.toISOString(), validUntil: new Date(NOW.getTime() + 30 * DAY).toISOString(), status: 'ACTIVE' })
  const resolver = createEntitlementResolver({ repos: w.repos, clock: () => w.now(), legacyLookup: async () => [] })
  const resolution = await resolver.resolveEntitlement({ user, workspace: { id: 'personal', type: 'PERSONAL' } })
  // Concurrent starts with the same Begin key: one reservation.
  const results = await Promise.all([1, 2, 3].map(() => w.commerce.reserve({ resolution, user, sessionId: 'sess-run', idempotencyKey: 'begin-run' })))
  assert.equal(results.filter((r) => !r.replayed).length, 1)
  assert.equal((await w.repos.entitlements.getEntitlement(ent.id)).consumedQuantity, 1)
  // The window ends while the run is in progress …
  w.setNow(new Date(NOW.getTime() + 31 * DAY))
  const { grant } = await w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:payment:pay_run', purchaseRef: 'order_run' })
  // … the completion billable event still closes the seat (never a mid-run interruption) …
  const done = await w.commerce.finalizeOn('ASSESSMENT_COMPLETED', { entitlementId: ent.id, user, sessionId: 'sess-run' })
  assert.equal(done.replayed, false)
  assert.equal(done.consumption.event, 'CONSUMED')
  // … repeated finish/retry cannot consume twice …
  const replay = await w.commerce.finalizeOn('ASSESSMENT_COMPLETED', { entitlementId: ent.id, user, sessionId: 'sess-run' })
  assert.equal(replay.replayed, true)
  assert.equal((await w.repos.entitlements.getEntitlement(ent.id)).consumedQuantity, 1)
  // … and only a NEW start on the expired pool is refused, with the clear code.
  const later = await resolver.resolveEntitlement({ user, workspace: { id: 'personal', type: 'PERSONAL' } })
  await assert.rejects(w.commerce.reserve({ resolution: later, user, sessionId: 'sess-new', idempotencyKey: 'begin-new' }), (e) => /ENTITLEMENT_(EXPIRED|REQUIRED)/.test(e.code))
  const expiredGrant = { ...grant, validUntil: new Date(NOW.getTime() + 30 * DAY).toISOString() }
  assert.equal(isActive(expiredGrant, w.now()), false)
  assert.throws(() => assertNewActivity({ grant: expiredGrant, activity: 'FORMAL_ASSESSMENT', used: 0, now: w.now() }), (e) => e.code === 'PACKAGE_EXPIRED' && /Reports you already received stay available/.test(e.message))
})

test('T57: existing entitlement rows are grandfathered byte-for-byte — the legacy store shape and the campus ledger row shape are unchanged by the grant plane', async () => {
  const saved = { ...process.env }
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'prism-p8-grandfather-'))
  delete process.env.PRISM_PG_STORE
  try {
    const store = await import('../lib/store.js')
    const legacy = await store.createEntitlement({ sessionId: 'legacy-sess-1', paymentId: 'pay_legacy', orderId: 'order_legacy', amount: 49900, mode: 'paid', userId: user.id, userEmail: user.email })
    const { createdAt, ...rest } = await store.getEntitlement('legacy-sess-1')
    // Frozen snapshot of the pre-P8 entitlement record: same keys, same values, nothing added.
    assert.deepEqual(rest, { sessionId: 'legacy-sess-1', paymentId: 'pay_legacy', orderId: 'order_legacy', amount: 49900, mode: 'paid', userId: user.id, userEmail: user.email, consumed: false })
    assert.deepEqual(Object.keys(legacy).sort(), ['amount', 'consumed', 'createdAt', 'mode', 'orderId', 'paymentId', 'sessionId', 'userEmail', 'userId'])
    // Campus ledger row: a grant for the same user adds nothing to the entitlement row.
    const w = world()
    const row = await w.repos.entitlements.createEntitlement({ userId: user.id, sourceType: 'INSTITUTION_CONTRACT', organizationId: 'org-1', productCode: 'LEGACY_ASSESSMENT', quantity: 5, validFrom: NOW.toISOString(), status: 'ACTIVE', metadata: { billableEvent: 'ASSESSMENT_STARTED' } })
    const before = JSON.stringify(await w.repos.entitlements.getEntitlement(row.id))
    await w.commerce.grantFromPayment({ userId: user.id, providerEventKey: 'razorpay:payment:pay_gf', purchaseRef: 'order_gf' })
    assert.equal(JSON.stringify(await w.repos.entitlements.getEntitlement(row.id)), before, 'the contract row is byte-identical after a grant')
    assert.equal((await w.repos.entitlements.getEntitlement(row.id)).quantity, 5)
    assert.equal((await w.repos.entitlements.getEntitlement(row.id)).metadata.billableEvent, 'ASSESSMENT_STARTED')
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  }
})

test('T54/finance: product grants and the legacy payment ledger are not in the session erasure cascade; retention policy names them', async () => {
  const planner = await readFile(join(SERVER_ROOT, 'lib', 'privacyPlanner.js'), 'utf-8')
  assert.ok(!/product_grants/.test(planner), 'erasure does not cascade-delete finance grants')
  const migration = await readFile(join(SERVER_ROOT, 'db', 'migrations', '0048_product_grants.sql'), 'utf-8')
  assert.match(migration, /retained under policy/i)
  const retention = await readFile(join(SERVER_ROOT, 'lib', 'retentionEnforcement.js'), 'utf-8')
  assert.match(retention, /payment_records/, 'the retention registry names the finance records')
})

// ── T58 soft budgets ─────────────────────────────────────────────────────────

test('T58: a soft budget alerts and limits NEW starts only; it never interrupts an active paid run or changes evidence/evaluator; unknown spend is unknown', () => {
  assert.equal(readSoftBudget({}), null)
  assert.equal(readSoftBudget({ PRISM_SOFT_BUDGET_USD: 'abc' }), null)
  assert.equal(readSoftBudget({ PRISM_SOFT_BUDGET_USD: '120.5' }), 120.5)
  const off = evaluateSoftBudget({ spentUsd: 999, budgetUsd: null })
  assert.equal(off.state, 'UNCONFIGURED')
  assert.equal(off.allowNewStart, true)
  const unknown = evaluateSoftBudget({ spentUsd: null, budgetUsd: 100 })
  assert.equal(unknown.state, 'UNKNOWN_SPEND')
  assert.equal(unknown.allowNewStart, true)
  assert.equal(unknown.alert, true)
  assert.equal(evaluateSoftBudget({ spentUsd: 10, budgetUsd: 100 }).state, 'OK')
  assert.equal(evaluateSoftBudget({ spentUsd: 85, budgetUsd: 100 }).state, 'ALERT')
  for (const spent of [100, 150]) {
    const over = evaluateSoftBudget({ spentUsd: spent, budgetUsd: 100, activeRun: true })
    assert.equal(over.state, 'NEW_STARTS_LIMITED')
    assert.equal(over.allowNewStart, false)
    assert.equal(over.interruptActiveRun, false, 'a paid run in progress is never cut short')
    assert.equal(over.activeRunProtected, true)
    assert.equal(over.evidenceCriteriaChanged, false)
    assert.equal(over.evaluatorChanged, false)
  }
  // Cost summaries: p50/p95 over actual per-run costs, unknown runs counted not zeroed.
  assert.deepEqual(costPercentiles([0.4, null, 0.2, 0.9, 0.3]), { n: 4, unknown: 1, p50: 0.4, p95: 0.9 })
  // Hypotheses and actual revenue are labelled apart.
  assert.equal(contribution({ netRevenue: { collected: 499, taxes: 0, refunds: 0 }, costs: { dialogue: 1 }, basis: 'HYPOTHESIS' }).basis, 'HYPOTHESIS')
  assert.equal(contribution({ netRevenue: { collected: 499, taxes: 0, refunds: 0 }, costs: { dialogue: 1 } }).basis, 'ACTUAL')
})

// ── T59 synthetic previews ───────────────────────────────────────────────────

test('T59: synthetic preview rows are excluded from the preview metrics query and reported as excluded, never as zero activity', async () => {
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const real = createPreviewService({ repos, clock: () => NOW, synthetic: () => false })
  const synthetic = createPreviewService({ repos, clock: () => NOW, synthetic: () => true })
  const r = await real.start({ answer: GOOD })
  await real.retry({ previewToken: r.previewToken, answer: GOOD })
  await real.claim({ previewToken: r.previewToken, user: { id: 'u-real' } })
  await real.start({ answer: GOOD })
  const s = await synthetic.start({ answer: GOOD })
  await synthetic.claim({ previewToken: s.previewToken, user: { id: 'u-synth' } })
  const m = await real.metrics()
  assert.deepEqual(m, { started: 2, claimed: 1, retried: 1, syntheticExcluded: 1 })
  // A guessed attempt id cannot read or claim anything (404, not 422 hinting at shape).
  const guessed = s.previewToken.split('.')[0]
  await assert.rejects(real.read({ previewToken: guessed }), (e) => e.code === 'NOT_FOUND')
  await assert.rejects(real.claim({ previewToken: guessed, user: { id: 'u-real' } }), (e) => e.code === 'NOT_FOUND')
  // Repeated preview-to-account linking stays one row.
  await real.claim({ previewToken: r.previewToken, user: { id: 'u-real' } })
  assert.equal((await real.listForUser({ id: 'u-real' })).length, 1)
})

// ── P8.2 intent onboarding ───────────────────────────────────────────────────

test('P8.2: display name and research permission round-trip, research is a separate nullable choice with its own timestamp, and nothing is required beyond audience/intention/mode', async () => {
  process.env.PRISM_CAMPUS_ENABLED = 'true'
  process.env.PRISM_APP_SHELL_V3 = 'true'
  const repos = createMemoryCampusRepos({ clock: () => NOW })
  const campus = createCampusContext({ repos, clock: () => NOW, audit: () => {} })
  const requireUser = (req, _res, next) => { const id = req.get('x-test-user'); if (!id) return next(new ApiError('UNAUTHENTICATED', 'Sign in.')); req.user = { id, email: `${id}@test.local` }; next() }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'x-test-user': 'u-intent', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  try {
    const initial = await call('GET', '/me/preferences')
    assert.equal(initial.body.data.researchPermission, null)
    assert.equal(initial.body.data.support.responseModes.find((m) => m.code === 'SPEECH').status, 'NOT_YET_AVAILABLE')
    assert.deepEqual(initial.body.data.support.notRequired, ['CV', 'grades', 'employer', 'photograph', 'college'])
    // Intent alone, no research choice bundled.
    const intent = await call('PUT', '/me/preferences', { reducedMotion: false, largerText: false, segment: 'STUDENT', intention: 'PRACTISE', responseMode: 'TEXT' })
    assert.equal(intent.status, 200)
    assert.equal(intent.body.data.researchPermission, null)
    assert.equal(intent.body.data.researchPermissionAt, null)
    // Display name optional; bounded.
    assert.equal((await call('PUT', '/me/preferences', { reducedMotion: false, largerText: false, displayName: 'x'.repeat(41) })).status, 422)
    const named = await call('PUT', '/me/preferences', { reducedMotion: false, largerText: false, displayName: 'Sam' })
    assert.equal(named.body.data.displayName, 'Sam')
    assert.equal(named.body.data.segment, 'STUDENT', 'earlier intent kept')
    // Research permission is its own decision with a timestamp; revocable.
    const research = await call('PUT', '/me/preferences', { reducedMotion: false, largerText: false, researchPermission: true })
    assert.equal(research.body.data.researchPermission, true)
    assert.equal(research.body.data.researchPermissionAt, NOW.toISOString())
    const revoked = await call('PUT', '/me/preferences', { reducedMotion: false, largerText: false, researchPermission: false })
    assert.equal(revoked.body.data.researchPermission, false)
    // Unknown fields (CV, grades, employer, photo, college) are refused, not stored.
    for (const field of ['cv', 'grades', 'employer', 'photo', 'college']) {
      assert.equal((await call('PUT', '/me/preferences', { reducedMotion: false, largerText: false, [field]: 'x' })).status, 422, field)
    }
  } finally {
    server.close()
  }
})

test('P8.2: no scoring, evaluation, judging, evidence or report module imports the preferences plane (display name never reaches a scoring payload)', async () => {
  const scoringDirs = [
    join(SERVER_ROOT, 'domain', 'assessments'), join(SERVER_ROOT, 'domain', 'development'), join(SERVER_ROOT, 'domain', 'reports'),
    join(SERVER_ROOT, 'domain', 'evidence'), join(SERVER_ROOT, 'domain', 'preparation'), join(SERVER_ROOT, 'services', 'ai'),
  ]
  const files = [join(SERVER_ROOT, 'lib', 'judgePanel.js'), join(SERVER_ROOT, 'lib', 'scoring.js')]
  async function walk(dir) {
    let entries = []
    try { entries = await readdir(dir) } catch { return }
    for (const e of entries) {
      const p = join(dir, e)
      if ((await stat(p)).isDirectory()) await walk(p)
      else if (p.endsWith('.js')) files.push(p)
    }
  }
  for (const d of scoringDirs) await walk(d)
  let checked = 0
  for (const f of files) {
    let src
    try { src = await readFile(f, 'utf-8') } catch { continue }
    checked += 1
    assert.ok(!/domain\/preferences|displayName|display_name|researchPermission/.test(src), `${f.replace(SERVER_ROOT, '')} must not read display-only preferences`)
  }
  assert.ok(checked > 20, `scanned ${checked} scoring-plane files`)
})

// ── P8.7 Campus engagement record ────────────────────────────────────────────

test('P8.7: an assignment records participation (COMPULSORY/VOLUNTARY/UNKNOWN), incentive and reminders; private learner tables stay unreadable to the sponsor', async () => {
  process.env.PRISM_CAMPUS_ENABLED = 'true'
  const now = new Date('2026-10-05T09:00:00Z')
  const repos = createMemoryCampusRepos({ clock: () => now })
  const org = await repos.organizations.createOrganization({ name: 'Synthetic University', slug: 'syn-u-p8gap', organizationType: 'UNIVERSITY', status: 'ACTIVE' })
  const cohort = await repos.organizations.createCohort({ organizationId: org.id, name: 'Cohort gap' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: 'owner-gap', role: 'ORG_OWNER', status: 'ACTIVE' })
  await repos.memberships.upsertMembership({ organizationId: org.id, userId: 'student-gap', role: 'STUDENT', status: 'ACTIVE' })
  await repos.organizations.addCohortMember({ cohortId: cohort.id, userId: 'student-gap' })
  const campus = createCampusContext({ repos, clock: () => now, users: { findById: async (id) => ({ id, name: id, email: `${id}@test.local` }), findByEmail: async () => null }, scenarioSource: async () => ({ generalScenarios: [{ id: 'syn-general-a' }], bankScenarios: [] }), audit: () => {} })
  const requireUser = (req, _res, next) => { const id = req.get('x-test-user'); if (!id) return next(new ApiError('UNAUTHENTICATED', 'Sign in.')); req.user = { id, email: `${id}@test.local` }; next() }
  const app = express()
  app.use(express.json())
  app.use('/api/v1', createV1Router({ requireUser, campus }))
  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/v1`
  const call = (who, method, path, body) => fetch(`${base}${path}`, { method, headers: { 'x-test-user': who, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  try {
    const cat = await (await call('owner-gap', 'GET', `/organizations/${org.id}/assessment-catalog`)).json()
    const def = cat.data.items.find((d) => d.id !== 'draft-core-teamready-a')
    const window = { windowStart: '2026-10-05T08:00:00.000Z', windowEnd: '2026-10-20T18:00:00.000Z' }
    const compulsory = await call('owner-gap', 'POST', `/organizations/${org.id}/assignments`, { definitionId: def.id, cohortIds: [cohort.id], ...window, reminders: true, participation: 'COMPULSORY', incentive: 'Counts toward the placement-readiness programme' })
    assert.equal(compulsory.status, 201)
    const a1 = (await compulsory.json()).data
    const stored1 = await repos.assessments.getAssignment(a1.id)
    assert.deepEqual(stored1.reminderPolicy, { enabled: true, daysBeforeDue: 2, participation: 'COMPULSORY', incentive: 'Counts toward the placement-readiness programme' })
    const plain = await call('owner-gap', 'POST', `/organizations/${org.id}/assignments`, { definitionId: def.id, cohortIds: [cohort.id], ...window })
    assert.equal(plain.status, 201)
    const stored2 = await repos.assessments.getAssignment((await plain.json()).data.id)
    assert.deepEqual(stored2.reminderPolicy, { enabled: false, daysBeforeDue: null, participation: 'UNKNOWN', incentive: null }, 'not asked is UNKNOWN, never assumed voluntary')
    assert.equal((await call('owner-gap', 'POST', `/organizations/${org.id}/assignments`, { definitionId: def.id, cohortIds: [cohort.id], ...window, participation: 'FORCED' })).status, 422)
    // Sponsor cannot reach private preparation / practice / self-report / previews / grants through any campus path.
    for (const path of [`/organizations/${org.id}/students/student-gap/preparation`, `/organizations/${org.id}/students/student-gap/practice`, `/organizations/${org.id}/students/student-gap/previews`, `/organizations/${org.id}/students/student-gap/grants`, `/organizations/${org.id}/grants`, `/organizations/${org.id}/exports/preparation`]) {
      assert.equal((await call('owner-gap', 'GET', path)).status, 404, path)
    }
  } finally {
    server.close()
  }
})

// ── P8.9 event serializer ────────────────────────────────────────────────────

test('P8.9: the serializer drops transcript, preparation text, names, institution ids, JWTs and payment secrets; purchase kinds and account classes are enums only', () => {
  const jwtLike = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InUifQ.c2lnbmF0dXJl'
  const { props, dropped } = sanitizeProps({
    transcript: 'Nia, can you take the room booking', answer: 'my answer', preparationText: 'interview on Monday', notes: 'private',
    name: 'Sam', displayName: 'Sam', email: 's@x.test', institutionId: 'org-123', organizationId: 'org-123', organizationName: 'Synthetic University',
    token: jwtLike, authorization: `Bearer ${jwtLike}`, razorpay_payment_id: 'pay_x', paymentId: 'pay_x', orderId: 'order_x', amount: 49900, price: 499, card: '4111',
    sessionId: 'sess-1', purchaseKind: 'GENUINE', accountClass: 'TEST', workspaceClass: 'PERSONAL', mode: 'PRACTICE', version: 'offer-policy.v0.1', count: 1,
  })
  assert.deepEqual(props, { sessionId: 'sess-1', purchaseKind: 'GENUINE', accountClass: 'TEST', workspaceClass: 'PERSONAL', mode: 'PRACTICE', version: 'offer-policy.v0.1', count: 1 })
  for (const k of ['transcript', 'answer', 'preparationText', 'notes', 'name', 'displayName', 'email', 'institutionId', 'organizationId', 'organizationName', 'token', 'authorization', 'razorpay_payment_id', 'paymentId', 'orderId', 'amount', 'price', 'card']) assert.ok(dropped.includes(k), `${k} dropped`)
  assert.ok(!JSON.stringify(props).includes(jwtLike))
  // Free text in an enum slot is dropped too.
  assert.deepEqual(sanitizeProps({ purchaseKind: 'genuine purchase by Sam', accountClass: 'x', mode: 'formal' }).props, {})
  for (const kind of ['GENUINE', 'REFUND', 'INCENTIVE', 'COMPULSORY', 'TEST']) assert.ok(PROP_RULES.purchaseKind(kind), kind)
  // Metrics-plane validation agrees: unknown keys rejected, enums accepted, the new telemetry names fold to canonical ones.
  assert.equal(validateEvent({ event: 'purchase_completed', props: { purchaseKind: 'TEST', accountClass: 'TEST' } }).ok, true)
  assert.equal(validateEvent({ event: 'purchase_completed', props: { transcript: 'x' } }).ok, false)
  assert.equal(validateEvent({ event: 'purchase_completed', props: { token: jwtLike } }).ok, false)
  for (const k of ['purchaseKind', 'accountClass', 'workspaceClass', 'version']) assert.ok(ALLOWED_PAYLOAD_KEYS.includes(k), k)
  for (const e of ['recommendation_viewed', 'recommendation_followed', 'practice_started', 'practice_completed', 'practice_retried']) {
    assert.ok(PRODUCT_EVENTS.includes(e), e)
    assert.ok(CANONICAL_EVENTS.includes(e) || CANONICAL_EVENTS.includes(LEGACY_EVENT_ALIASES[e]), `${e} maps to a canonical event`)
  }
})
