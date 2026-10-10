// PROD-READY Phase 1S (operator-directed security hotfix; audit 2026-10-10).
// One test per finding (SECURITY_REVIEW addendum N1–N15), unit-level for the
// new middleware and over the REAL app (buildApp) for the wiring.
import '../test-support/isolatedDataDir.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createServer } from 'node:http'
import express from 'express'
import jwt from 'jsonwebtoken'

process.env.JWT_SECRET = 'phase1s-test-secret'
delete process.env.PRISM_PG_STORE
delete process.env.DATABASE_URL
delete process.env.PRISM_DUMMY_PAYMENTS
delete process.env.RAZORPAY_KEY_ID
delete process.env.RAZORPAY_KEY_SECRET
delete process.env.RAZORPAY_WEBHOOK_SECRET

const { buildApp } = await import('../app.js')
const store = await import('../lib/store.js')
const userDb = await import('../lib/db.js')
const lock = await import('../lib/legacyOwnerLock.js')
const { setPaymentGatewayForTests } = await import('../routes/payment.js')
const { setCommerceServiceForTests, createGrantService } = await import('../domain/commerce/index.js')
const { createMemoryCampusRepos } = await import('../domain/campusStore/index.js')

const app = buildApp()
const server = app.listen(0)
await new Promise((r) => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
test.after(() => { setPaymentGatewayForTests(null); setCommerceServiceForTests(null); server.close() })

async function account(label) {
  const record = await userDb.createUser({ email: `${label}-${crypto.randomUUID()}@test.local`, name: `Synthetic ${label}`, passwordHash: 'x', ageDeclaration: { version: 'test', at: new Date().toISOString() } })
  const token = jwt.sign({ sub: record.id, email: record.email, tv: 0 }, process.env.JWT_SECRET)
  return { id: record.id, email: record.email, token, auth: { Authorization: `Bearer ${token}` } }
}

async function call(method, path, { headers = {}, body, raw } = {}) {
  const init = { method, headers: { ...headers } }
  if (raw !== undefined) init.body = raw
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${base}${path}`, init)
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, body: json }
}

async function devSession(user) {
  const r = await call('POST', '/api/payment/dev-session', { headers: user.auth })
  assert.equal(r.status, 200)
  return r.body.sessionId
}

// ── N1: legacy erasure by session id ────────────────────────────────────────

test('N1: DELETE /api/assessment/data/:id erases only for the signed-in owner; signed out, another account and unknown ids get the same 404', async () => {
  const owner = await account('owner')
  const other = await account('other')
  const sid = await devSession(owner)
  const denied = [
    await call('DELETE', `/api/assessment/data/${sid}`),
    await call('DELETE', `/api/assessment/data/${sid}`, { headers: other.auth }),
    await call('DELETE', `/api/assessment/data/${crypto.randomUUID()}`, { headers: owner.auth }),
    await call('DELETE', `/api/assessment/data/${sid}`, { headers: { Authorization: 'Bearer not-a-token' } }),
  ]
  for (const d of denied) assert.deepEqual([d.status, d.body], [404, { error: 'Not found', code: 'NOT_FOUND' }])
  assert.ok(await store.getEntitlement(sid), 'nothing was erased by the refused calls')
  const ok = await call('DELETE', `/api/assessment/data/${sid}`, { headers: owner.auth })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.ok, true)
  assert.equal(await store.getEntitlement(sid), null, 'the owner erased the payment record')
})

test('N1: an ownerless (anonymous development) session cannot be erased by session id', async () => {
  const sid = `anon-${crypto.randomUUID()}`
  await store.createEntitlement({ sessionId: sid, mode: 'dev', amount: 0 })
  const someone = await account('someone')
  assert.equal((await call('DELETE', `/api/assessment/data/${sid}`, { headers: someone.auth })).status, 404)
  assert.ok(await store.getEntitlement(sid))
})

test('N1: erasure guard unit — every non-owner outcome is the identical 404; a lookup failure fails closed', async () => {
  const lookup = async (id) => (id === 'sess-a' ? { exists: true, owner: 'user-a' } : id === 'boom' ? Promise.reject(new Error('store down')) : { exists: false, owner: null })
  const authenticate = async (req) => ({ user: req.get('x-user') ? { id: req.get('x-user') } : null })
  const a = express()
  a.delete('/data/:sessionId', lock.createLegacyErasureGuard({ authenticate, lookup }), (_req, res) => res.json({ reached: true }))
  const s = a.listen(0)
  await new Promise((r) => s.once('listening', r))
  const hit = async (id, who) => {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/data/${id}`, { method: 'DELETE', headers: who ? { 'x-user': who } : {} })
    return [r.status, await r.json()]
  }
  try {
    assert.deepEqual(await hit('sess-a', 'user-a'), [200, { reached: true }])
    for (const [id, who] of [['sess-a', null], ['sess-a', 'user-b'], ['nope', 'user-a']]) {
      assert.deepEqual(await hit(id, who), [404, { error: 'Not found', code: 'NOT_FOUND' }])
    }
    assert.equal((await hit('boom', 'user-a'))[0], 500)
  } finally { s.close() }
})

// ── N6: session-keyed legacy write routes bound to the owner ────────────────

test('N6: consent, identity check, accommodation, human review and work-material saves are owner-bound for an owned session', async () => {
  const owner = await account('writer')
  const other = await account('intruder')
  const sid = await devSession(owner)
  const routes = [
    ['/api/assessment/consent', { sessionId: sid, scopes: ['x'] }],
    ['/api/assessment/verify-identity', { sessionId: sid, fullName: 'Synthetic Person', aadhaarLast4: '1234' }],
    ['/api/assessment/accommodation', { sessionId: sid, needs: 'Synthetic accommodation need text' }],
    ['/api/assessment/dispute', { sessionId: sid, reason: 'Synthetic review request reason' }],
    [`/api/assessment/artifacts/${sid}`, { artifactId: 'X', updates: {} }],
  ]
  for (const [path, body] of routes) {
    for (const headers of [{}, other.auth]) {
      const r = await call('POST', path, { headers, body })
      assert.deepEqual([path, r.status, r.body], [path, 404, { error: 'Not found', code: 'NOT_FOUND' }])
    }
  }
  assert.equal(await store.getVerification(sid), null, 'refused identity checks wrote nothing')
  assert.equal(await store.getAccommodation(sid), null, 'refused accommodation requests wrote nothing')
  for (const [path, body] of routes) {
    const mine = await call('POST', path, { headers: owner.auth, body })
    assert.ok(!(mine.status === 404 && mine.body?.code === 'NOT_FOUND'), `${path}: the owner passes the binding`)
  }
  assert.equal((await store.getVerification(sid))?.fullName, 'Synthetic Person', 'the identity check of the owner was recorded')
})

test('N6: an owner-bound route lets the owner record consent end to end', async () => {
  const owner = await account('consent')
  const sid = await devSession(owner)
  const scopes = ['ai_conversation', 'webcam_proctoring', 'evidence_storage', 'data_processing', 'audio_capture', 'research_use']
  const r = await call('POST', '/api/assessment/consent', { headers: owner.auth, body: { sessionId: sid, scopes, consentVersion: 'phase1s' } })
  assert.ok(r.status === 200 || (r.status === 400 && Array.isArray(r.body?.missing)), `owner reached consent validation (${r.status})`)
})

test('N6: owner binding unit — ownerless sessions keep the router\'s own checks; owned ones are owner-only', async () => {
  const lookup = async (id) => ({ owned: { exists: true, owner: 'u1' }, anon: { exists: true, owner: null } }[id] || { exists: false, owner: null })
  const authenticate = async (req) => ({ user: req.get('x-user') ? { id: req.get('x-user') } : null })
  const a = express()
  a.use(express.json())
  a.post('/w', lock.createLegacyOwnerBinding({ authenticate, lookup }), (_req, res) => res.json({ reached: true }))
  const s = a.listen(0)
  await new Promise((r) => s.once('listening', r))
  const hit = async (sessionId, who) => (await fetch(`http://127.0.0.1:${s.address().port}/w`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(who ? { 'x-user': who } : {}) }, body: JSON.stringify({ sessionId }) })).status
  try {
    assert.equal(await hit('owned', 'u1'), 200)
    assert.equal(await hit('owned', 'u2'), 404)
    assert.equal(await hit('owned', null), 404)
    assert.equal(await hit('anon', null), 200)
    assert.equal(await hit('unknown', null), 200, 'the router answers for unknown sessions as before')
  } finally { s.close() }
})

// ── N9: revoked / suspended / deleted accounts ──────────────────────────────

test('N9: a revoked token and a suspended account are refused before the legacy router; payment routes also refuse a deleted account', async () => {
  const u = await account('revoked')
  const sid = await devSession(u)
  await userDb.updateUserAccount(u.id, { bumpTokenVersion: true })
  const revoked = await call('POST', '/api/assessment/dispute', { headers: u.auth, body: { sessionId: sid, reason: 'Synthetic review request reason' } })
  assert.deepEqual([revoked.status, revoked.body.code], [401, 'SESSION_REVOKED'])
  assert.equal((await call('POST', '/api/payment/dev-session', { headers: u.auth })).status, 401)
  assert.equal((await call('GET', '/api/payment/licence', { headers: u.auth })).status, 401)

  const s = await account('suspended')
  await userDb.updateUserAccount(s.id, { accountState: 'suspended' })
  assert.deepEqual((await call('GET', '/api/assessment/history', { headers: s.auth })).body?.code, 'ACCOUNT_SUSPENDED')
  assert.equal((await call('POST', '/api/payment/dev-session', { headers: s.auth })).status, 403)

  const ghost = { Authorization: `Bearer ${jwt.sign({ sub: 'no-such-account', email: 'ghost@test.local', tv: 0 }, process.env.JWT_SECRET)}` }
  assert.equal((await call('POST', '/api/payment/dev-session', { headers: ghost })).status, 401, 'no session is minted for an account that does not exist')
  // Requests without a token are untouched by the gate.
  assert.notEqual((await call('GET', '/api/assessment/languages')).status, 401)
})

// ── N7: issued-report view ──────────────────────────────────────────────────

test('N7: the issued legacy report (with account id, email and the issued V2 views) is served to its signed-in owner only', async () => {
  const owner = await account('report')
  const sid = await devSession(owner)
  await store.saveReport(sid, {
    userId: owner.id, userEmail: owner.email, candidateId: 'cand-1', scores: { overall: 50 },
    issuedViews: { studentV2: { candidate: { name: 'Synthetic Name' }, quotes: ['verbatim'] } }, feedback: { summary: 'Synthetic summary' },
  })
  const other = await account('viewer')
  for (const headers of [{}, other.auth]) {
    const r = await call('GET', `/api/assessment/report/${sid}`, { headers })
    assert.deepEqual([r.status, r.body], [404, { error: 'Report not found', code: 'NOT_FOUND' }])
  }
  const mine = await call('GET', `/api/assessment/report/${sid}`, { headers: owner.auth })
  assert.equal(mine.status, 200)
  assert.equal(mine.body.userEmail, owner.email)
})

// ── N8: /transcribe ─────────────────────────────────────────────────────────

function audioForm(sessionId, type = 'audio/webm') {
  const form = new FormData()
  form.append('audio', new Blob([Buffer.from('synthetic-audio')], { type }), 'answer.webm')
  if (sessionId) form.append('sessionId', sessionId)
  return form
}

test('N8: transcription needs an existing session (its owner when owned) and audio; the router still answers after the app parsed the upload', async () => {
  const owner = await account('voice')
  const other = await account('voice-other')
  const sid = await devSession(owner)
  const post = async (form, headers = {}) => {
    const r = await fetch(`${base}/api/assessment/transcribe`, { method: 'POST', headers, body: form })
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  assert.equal((await post(audioForm(sid, 'image/png'), owner.auth)).status, 415)
  assert.equal((await post(audioForm(null), owner.auth)).status, 404)
  assert.equal((await post(audioForm(crypto.randomUUID()), owner.auth)).status, 404)
  assert.equal((await post(audioForm(sid))).status, 404)
  assert.equal((await post(audioForm(sid), other.auth)).status, 404)
  // The owner reaches the frozen router: STT is not configured in tests → its own 503.
  const mine = await post(audioForm(sid), owner.auth)
  assert.deepEqual([mine.status, mine.body?.fallback], [503, 'webspeech'])
  assert.equal(lock.isAudioUpload({ mimetype: 'audio/ogg; codecs=opus' }), true)
  assert.equal(lock.isAudioUpload({ mimetype: 'video/webm' }), false)
})

// ── N2/N3: payment verification ─────────────────────────────────────────────

const KEY_SECRET = 'rzp_test_secret_phase1s'
const sign = (orderId, paymentId, secret = KEY_SECRET) => crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')

function paymentWorld(orders) {
  const repos = createMemoryCampusRepos({ clock: () => new Date('2026-10-10T10:00:00Z') })
  const commerce = createGrantService({ repos, clock: () => new Date('2026-10-10T10:00:00Z') })
  setCommerceServiceForTests(commerce)
  const fetched = []
  setPaymentGatewayForTests({
    fetchOrder: async (id) => {
      fetched.push(id)
      if (!orders[id]) throw Object.assign(new Error('not found'), { statusCode: 400 })
      return orders[id]
    },
  })
  return { commerce, fetched }
}
const paidOrder = (id, userId, extra = {}) => ({ id, amount: 49900, currency: 'INR', status: 'paid', notes: { userId, productCode: 'PERSONAL_DEVELOPMENT_SPRINT' }, ...extra })

async function withKeys(fn, keys = { RAZORPAY_KEY_ID: 'rzp_test_id', RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: 'whsec_phase1s' }) {
  const saved = {}
  for (const [k, v] of Object.entries(keys)) { saved[k] = process.env[k]; process.env[k] = v }
  try { return await fn() } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  }
}

const verify = (user, orderId, paymentId, signature = sign(orderId, paymentId)) =>
  call('POST', '/api/payment/verify', { headers: user.auth, body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } })

test('N2: a verified payment is redeemed once — retries return the same session and grant; replays never mint a second entitlement', () => withKeys(async () => {
  const buyer = await account('buyer')
  const { commerce, fetched } = paymentWorld({ order_once: paidOrder('order_once', buyer.id) })
  const first = await verify(buyer, 'order_once', 'pay_once')
  assert.equal(first.status, 200)
  assert.ok(first.body.sessionId && first.body.grantId)
  const again = await verify(buyer, 'order_once', 'pay_once')
  assert.equal(again.status, 200)
  assert.equal(again.body.sessionId, first.body.sessionId)
  assert.equal(again.body.grantId, first.body.grantId)
  assert.equal(again.body.alreadyRedeemed, true)
  assert.deepEqual(fetched, ['order_once'], 'the retry is answered from the ledger')
  const mine = (await store.listEntitlementsByUser(buyer.id)).filter((e) => e.paymentId === 'pay_once')
  assert.equal(mine.length, 1, 'exactly one paid entitlement')
  assert.equal((await commerce.listForUser(buyer.id)).length, 1)
}))

test('N2: concurrent verifies of one payment end with one session', () => withKeys(async () => {
  const buyer = await account('race')
  paymentWorld({ order_race: paidOrder('order_race', buyer.id) })
  const results = await Promise.all([1, 2, 3, 4].map(() => verify(buyer, 'order_race', 'pay_race')))
  assert.ok(results.every((r) => r.status === 200))
  assert.equal(new Set(results.map((r) => r.body.sessionId)).size, 1)
  assert.equal((await store.listEntitlementsByUser(buyer.id)).length, 1)
}))

test('N2: another account cannot redeem a payment — neither a fresh one (order belongs to someone else) nor one already redeemed', () => withKeys(async () => {
  const buyer = await account('payer')
  const thief = await account('thief')
  paymentWorld({ order_theirs: paidOrder('order_theirs', buyer.id), order_redeemed: paidOrder('order_redeemed', buyer.id) })
  const stolen = await verify(thief, 'order_theirs', 'pay_theirs')
  assert.deepEqual([stolen.status, stolen.body.code], [403, 'PAYMENT_NOT_YOURS'])
  assert.equal((await store.listEntitlementsByUser(thief.id)).length, 0)
  assert.equal((await verify(buyer, 'order_redeemed', 'pay_redeemed')).status, 200)
  const replay = await verify(thief, 'order_redeemed', 'pay_redeemed')
  assert.deepEqual([replay.status, replay.body.code], [403, 'PAYMENT_NOT_YOURS'])
  assert.equal((await store.listEntitlementsByUser(thief.id)).length, 0)
}))

test('N2: the order must be paid (captured), for this product at the server price', () => withKeys(async () => {
  const buyer = await account('capture')
  paymentWorld({
    order_auth: paidOrder('order_auth', buyer.id, { status: 'attempted' }),
    order_cheap: paidOrder('order_cheap', buyer.id, { amount: 100 }),
    order_other: paidOrder('order_other', buyer.id, { notes: { userId: buyer.id, productCode: 'PROFESSIONAL_PREPARATION_PACK' } }),
  })
  const pending = await verify(buyer, 'order_auth', 'pay_auth')
  assert.deepEqual([pending.status, pending.body.code, pending.body.retryable], [409, 'PAYMENT_NOT_CAPTURED', true])
  assert.equal((await verify(buyer, 'order_cheap', 'pay_cheap')).body.code, 'ORDER_MISMATCH')
  assert.equal((await verify(buyer, 'order_other', 'pay_other')).body.code, 'ORDER_MISMATCH')
  const unknown = await verify(buyer, 'order_missing', 'pay_missing')
  assert.deepEqual([unknown.status, unknown.body.code], [503, 'PAYMENT_PROVIDER_UNAVAILABLE'])
  assert.equal((await store.listEntitlementsByUser(buyer.id)).length, 0)
}))

test('N2: after the session is erased the payment stays redeemed (detached) and cannot mint a new session', () => withKeys(async () => {
  const buyer = await account('erased')
  paymentWorld({ order_erase: paidOrder('order_erase', buyer.id) })
  const first = await verify(buyer, 'order_erase', 'pay_erase')
  assert.equal((await call('DELETE', `/api/assessment/data/${first.body.sessionId}`, { headers: buyer.auth })).status, 200)
  const redemption = await store.getPaymentRedemption('pay_erase')
  assert.deepEqual([redemption.sessionId, redemption.userId], [null, null], 'detached from the person and the session')
  const replay = await verify(buyer, 'order_erase', 'pay_erase')
  assert.deepEqual([replay.status, replay.body.code], [409, 'PAYMENT_ALREADY_REDEEMED'])
}))

test('N3: /verify never checks a signature against an empty key — 503 when the key secret is missing', () => withKeys(async () => {
  const buyer = await account('nokey')
  paymentWorld({ order_nokey: paidOrder('order_nokey', buyer.id) })
  const forgedWithEmptyKey = sign('order_nokey', 'pay_nokey', '')
  const r = await verify(buyer, 'order_nokey', 'pay_nokey', forgedWithEmptyKey)
  assert.deepEqual([r.status, r.body.code], [503, 'PAYMENTS_NOT_CONFIGURED'])
  assert.equal((await store.listEntitlementsByUser(buyer.id)).length, 0)
  assert.equal((await call('POST', '/api/payment/create-order', { headers: buyer.auth })).status, 409, 'the offer gate still answers first')
}, { RAZORPAY_KEY_ID: 'rzp_test_id' }))

test('N3: malformed payment fields are refused before any lookup', () => withKeys(async () => {
  const buyer = await account('malformed')
  const { fetched } = paymentWorld({})
  for (const body of [
    { razorpay_order_id: 'order x', razorpay_payment_id: 'pay_1', razorpay_signature: 'a'.repeat(64) },
    { razorpay_order_id: 'order_1', razorpay_payment_id: { $ne: 1 }, razorpay_signature: 'a'.repeat(64) },
    { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'zz' },
  ]) {
    assert.equal((await call('POST', '/api/payment/verify', { headers: buyer.auth, body })).status, 400)
  }
  assert.deepEqual(fetched, [])
}))

test('N2: webhook grants only captured money, never a second grant for a payment redeemed via /verify, and attributes order.paid by the order notes', () => withKeys(async () => {
  const buyer = await account('hook')
  const { commerce } = paymentWorld({ order_hook: paidOrder('order_hook', buyer.id) })
  const send = (event) => {
    const raw = JSON.stringify(event)
    return call('POST', '/api/payment/webhook', { raw, headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': crypto.createHmac('sha256', 'whsec_phase1s').update(raw).digest('hex') } })
  }
  const authorizedOnly = await send({ event: 'payment.authorized', payload: { payment: { entity: { id: 'pay_held', order_id: 'order_held', status: 'authorized', notes: { userId: buyer.id } } } } })
  assert.equal(authorizedOnly.body.ignored, 'payment.authorized')
  assert.equal((await commerce.listForUser(buyer.id)).length, 0, 'an authorisation hold grants nothing')

  const verified = await verify(buyer, 'order_hook', 'pay_hook')
  assert.equal(verified.status, 200)
  const captured = await send({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_hook', order_id: 'order_hook', status: 'captured', notes: {} } } } })
  assert.equal(captured.status, 200)
  const paid = await send({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_hook', order_id: 'order_hook', status: 'captured' } }, order: { entity: { id: 'order_hook', notes: { userId: buyer.id } } } } })
  assert.equal(paid.body.duplicate, true, 'the order.paid event finds the grant /verify created')
  assert.equal((await commerce.listForUser(buyer.id)).length, 1)
  assert.equal((await store.listEntitlementsByUser(buyer.id)).length, 1, 'the webhook never mints a session entitlement')
}))

test('N3: production refuses to start with a purchasable paid offer but missing Razorpay secrets; payments-off production and development are unaffected', async () => {
  const { assertPaymentConfiguration } = await import('../lib/security.js')
  const prod = { NODE_ENV: 'production' }
  assert.throws(() => assertPaymentConfiguration({ paidOfferEnabled: true, env: prod }), /RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET/)
  assert.throws(() => assertPaymentConfiguration({ paidOfferEnabled: true, env: { ...prod, RAZORPAY_KEY_ID: 'a', RAZORPAY_KEY_SECRET: 'b' } }), /RAZORPAY_WEBHOOK_SECRET is not set/)
  assert.doesNotThrow(() => assertPaymentConfiguration({ paidOfferEnabled: true, env: { ...prod, RAZORPAY_KEY_ID: 'a', RAZORPAY_KEY_SECRET: 'b', RAZORPAY_WEBHOOK_SECRET: 'c' } }))
  assert.doesNotThrow(() => assertPaymentConfiguration({ paidOfferEnabled: false, env: prod }))
  assert.doesNotThrow(() => assertPaymentConfiguration({ paidOfferEnabled: true, env: { NODE_ENV: 'test' } }))
  const { anyPaidOfferPurchasable } = await import('../domain/commerce/index.js')
  assert.equal(anyPaidOfferPurchasable(), false, 'today no offer is purchasable (price, content and terms unapproved)')
})

// ── N4: device pairing + proctor socket ─────────────────────────────────────

test('N4: pairing codes are issued only to the signed-in session owner; network-info is development-only', async () => {
  const owner = await account('pair')
  const other = await account('pair-other')
  const sid = await devSession(owner)
  assert.equal((await call('POST', '/api/device/pair', { body: { sessionId: sid } })).status, 404)
  assert.equal((await call('POST', '/api/device/pair', { headers: other.auth, body: { sessionId: sid } })).status, 404)
  assert.equal((await call('POST', '/api/device/pair', { headers: owner.auth, body: { sessionId: crypto.randomUUID() } })).status, 404)
  const ok = await call('POST', '/api/device/pair', { headers: owner.auth, body: { sessionId: sid } })
  assert.equal(ok.status, 200)
  assert.match(ok.body.pairCode, /^[A-Z2-9]{6}$/)
  assert.equal((await call('GET', '/api/device/network-info')).status, 200)
  const saved = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    assert.equal((await call('GET', '/api/device/network-info')).status, 404)
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = saved
  }
})

test('N4: proctor handshake — unknown/expired codes refused without a row; desktop needs the owner; the phone needs only a valid code', async () => {
  const { createProctorHandshakeGuard, isAllowedProctorOrigin, proctorOriginPolicy, createConnectionRateLimiter, handshakeIp } = await import('../lib/proctorSocket.js')
  const now = Date.parse('2026-10-10T10:00:00Z')
  const links = {
    ABCDEF: { pairCode: 'ABCDEF', sessionId: 'sess-owned', createdAt: new Date(now - 60 * 1000).toISOString() },
    XLDXLD: { pairCode: 'XLDXLD', sessionId: 'sess-owned', createdAt: new Date(now - 4 * 3600 * 1000).toISOString() },
    ANBNYM: { pairCode: 'ANBNYM', sessionId: 'sess-anon', createdAt: new Date(now).toISOString() },
  }
  const reads = []
  const guard = (production) => createProctorHandshakeGuard({
    getDeviceLink: async (code) => { reads.push(code); return links[code] || null },
    lookup: async (sid) => ({ 'sess-owned': { exists: true, owner: 'u1' }, 'sess-anon': { exists: true, owner: null } }[sid] || { exists: false, owner: null }),
    authenticate: async (req) => ({ user: req.headers.authorization === 'Bearer t-u1' ? { id: 'u1' } : req.headers.authorization === 'Bearer t-u2' ? { id: 'u2' } : null }),
    production: () => production,
    now: () => now,
  })
  const hs = (pairCode, role, token) => ({ query: { pairCode, role }, auth: token ? { token } : {} })
  const g = guard(true)
  await assert.rejects(g(hs('ZZZZZZ', 'phone')), /Unknown or expired/)
  await assert.rejects(g(hs('XLDXLD', 'phone')), /Unknown or expired/)
  await assert.rejects(g(hs('abc', 'phone')), /Missing pairCode/)
  await assert.rejects(g(hs('ABCDEF', 'admin')), /Missing pairCode/)
  assert.deepEqual(await g(hs('ABCDEF', 'phone')), { pairCode: 'ABCDEF', role: 'phone', sessionId: 'sess-owned' })
  await assert.rejects(g(hs('ABCDEF', 'desktop')), /Not authorized/)
  await assert.rejects(g(hs('ABCDEF', 'desktop', 't-u2')), /Not authorized/)
  assert.equal((await g(hs('ABCDEF', 'desktop', 't-u1'))).role, 'desktop')
  await assert.rejects(g(hs('ANBNYM', 'desktop', 't-u1')), /Not authorized/, 'production: an ownerless session has no desktop')
  assert.equal((await guard(false)(hs('ANBNYM', 'desktop', 't-u1'))).role, 'desktop', 'development: a signed-in desktop may pair an anonymous dev session')
  assert.ok(!reads.includes('abc'), 'malformed codes never reach the store')

  const prodOrigins = proctorOriginPolicy({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example' })
  assert.equal(isAllowedProctorOrigin({ origin: 'https://evil.example', host: 'prism.studai.one' }, prodOrigins), false)
  assert.equal(isAllowedProctorOrigin({ origin: 'https://prism.studai.one', host: 'prism.studai.one' }, prodOrigins), true, 'same origin')
  assert.equal(isAllowedProctorOrigin({ origin: 'https://app.example', host: 'prism.studai.one' }, prodOrigins), true, 'allow-listed')
  assert.equal(proctorOriginPolicy({ NODE_ENV: 'development' }), null, 'development reflects any origin (LAN phones)')

  const allow = createConnectionRateLimiter({ limit: 2, windowMs: 1000, now: () => now })
  assert.deepEqual([allow('1.2.3.4'), allow('1.2.3.4'), allow('1.2.3.4'), allow('5.6.7.8')], [true, true, false, true])
  assert.equal(handshakeIp({ headers: { 'x-forwarded-for': '9.9.9.9, 1.2.3.4:5555' }, address: '10.0.0.1' }), '1.2.3.4')
})

test('N4: the real proctor socket refuses an unknown pairing code without creating a device-link row and admits the issued one', async (t) => {
  let ioClient
  try { ({ io: ioClient } = await import('socket.io-client')) } catch { t.skip('socket.io-client not installed'); return }
  const { attachProctorSocket } = await import('../lib/proctorSocket.js')
  const owner = await account('sock')
  const sid = await devSession(owner)
  const pair = await call('POST', '/api/device/pair', { headers: owner.auth, body: { sessionId: sid } })
  const httpServer = createServer()
  const io = await attachProctorSocket(httpServer)
  await new Promise((r) => httpServer.listen(0, r))
  const url = `http://127.0.0.1:${httpServer.address().port}`
  const connect = (query, auth = {}) => new Promise((resolve) => {
    const c = ioClient(url, { path: '/proctor-socket', transports: ['websocket'], query, auth, reconnection: false })
    c.on('connect', () => { c.close(); resolve('connected') })
    c.on('connect_error', (err) => { c.close(); resolve(err.message) })
  })
  try {
    assert.match(await connect({ pairCode: 'QWERTY', role: 'phone' }), /Unknown or expired/)
    assert.equal(await store.getDeviceLink('QWERTY'), null, 'no row for an unknown code')
    assert.match(await connect({ pairCode: pair.body.pairCode, role: 'desktop' }), /Not authorized/)
    assert.equal(await connect({ pairCode: pair.body.pairCode, role: 'desktop' }, { token: owner.token }), 'connected')
    assert.equal(await connect({ pairCode: pair.body.pairCode, role: 'phone' }), 'connected')
  } finally {
    io.close()
    await new Promise((r) => httpServer.close(r))
  }
})

// ── N5: ecosystem hand-over ─────────────────────────────────────────────────

test('N5: the hand-over requires sign-in, hands over the real account, signs the server-to-server call and never uses a placeholder', async () => {
  const seen = []
  const hire = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') })
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ code: 'hire_code_1', redirect_url: `http://127.0.0.1:${hire.address().port}/ecosystem/handover?code=hire_code_1` }))
    })
  })
  await new Promise((r) => hire.listen(0, r))
  const saved = { HIRE_BASE_URL: process.env.HIRE_BASE_URL, ECOSYSTEM_SECRET: process.env.ECOSYSTEM_SECRET }
  process.env.HIRE_BASE_URL = `http://127.0.0.1:${hire.address().port}`
  process.env.ECOSYSTEM_SECRET = 'eco-secret-phase1s'
  try {
    assert.equal((await call('POST', '/api/ecosystem/handover-token', { body: { destination: 'hire' } })).status, 401)
    const u = await account('handover')
    assert.equal((await call('POST', '/api/ecosystem/handover-token', { headers: u.auth, body: { destination: 'elsewhere' } })).status, 400)
    const r = await call('POST', '/api/ecosystem/handover-token', { headers: u.auth, body: { destination: 'hire', targetJobRef: 'job_1' } })
    assert.equal(r.status, 200)
    assert.equal(r.body.code, 'hire_code_1')
    assert.equal(seen.length, 1)
    assert.equal(seen[0].body.email, u.email)
    assert.equal(seen[0].body.ecosystem_person_id, u.id)
    assert.notEqual(seen[0].body.email, 'candidate@studai.one')
    const [h, p, s] = seen[0].auth.replace('Bearer ', '').split('.')
    assert.equal(crypto.createHmac('sha256', 'eco-secret-phase1s').update(`${h}.${p}`).digest('base64url'), s, 'signed with ECOSYSTEM_SECRET')
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))
    assert.deepEqual([claims.sub, claims.aud, claims.exp - claims.iat], [u.id, 'studai-hire', 60])
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    await new Promise((r) => hire.close(r))
  }
})

test('N5: production without HIRE_BASE_URL / HIRE_API_URL refuses the hand-over (503) and shows no example roles', async () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, HIRE_BASE_URL: process.env.HIRE_BASE_URL, HIRE_API_URL: process.env.HIRE_API_URL, CAREER_BASE_URL: process.env.CAREER_BASE_URL }
  const u = await account('handover-prod')
  process.env.NODE_ENV = 'production'
  delete process.env.HIRE_BASE_URL
  delete process.env.HIRE_API_URL
  delete process.env.CAREER_BASE_URL
  try {
    const r = await call('POST', '/api/ecosystem/handover-token', { headers: u.auth, body: { destination: 'hire' } })
    assert.deepEqual([r.status, r.body.code], [503, 'NOT_CONFIGURED'])
    assert.equal((await call('POST', '/api/ecosystem/handover-token', { headers: u.auth, body: { destination: 'career' } })).status, 503)
    const jobs = await call('GET', '/api/ecosystem/aligned-jobs')
    assert.deepEqual([jobs.status, jobs.body.jobs, jobs.body.source], [200, [], 'not_configured'])
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
  }
})

// ── N12: readiness ──────────────────────────────────────────────────────────

test('N12: /api/health stays liveness-only; /api/ready checks the database with a timeout and reports draining', async () => {
  assert.deepEqual((await call('GET', '/api/health')).body, { status: 'ok' })
  assert.deepEqual((await call('GET', '/api/ready')).body, { status: 'ready', checks: { database: 'not_configured' } })
  const { createReadinessHandler } = await import('../lib/readiness.js')
  const run = async (opts) => {
    const out = {}
    const res = { setHeader() {}, status(c) { out.status = c; return res }, json(b) { out.body = b; out.status ??= 200; return res } }
    await createReadinessHandler({ isDbConfigured: () => true, timeoutMs: 50, ...opts })({}, res)
    return out
  }
  assert.deepEqual(await run({ query: async () => ({ rows: [{}] }) }), { status: 200, body: { status: 'ready', checks: { database: 'ok' } } })
  assert.deepEqual(await run({ query: () => new Promise(() => {}) }), { status: 503, body: { status: 'not_ready', checks: { database: 'timeout' } } })
  assert.deepEqual(await run({ query: async () => { throw new Error('ECONNREFUSED secret detail') } }), { status: 503, body: { status: 'not_ready', checks: { database: 'unavailable' } } })
  assert.equal((await run({ draining: () => true })).status, 503)
})

// ── N10/N11: async errors, process handlers, graceful shutdown ──────────────

test('N10: an async route handler that rejects gets the generic 500 instead of hanging', async () => {
  const a = express()
  a.get('/boom', async () => { throw new Error('synthetic failure') })
  a.get('/late', async (_req, res) => { res.json({ ok: true }); throw new Error('after response') })
  a.use((err, _req, res, _next) => res.status(500).json({ error: 'Internal server error' }))
  const s = a.listen(0)
  await new Promise((r) => s.once('listening', r))
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/boom`, { signal: AbortSignal.timeout(3000) })
    assert.equal(r.status, 500)
    const late = await fetch(`http://127.0.0.1:${s.address().port}/late`, { signal: AbortSignal.timeout(3000) })
    assert.deepEqual([late.status, await late.json()], [200, { ok: true }], 'a response already sent is kept intact')
  } finally { s.close() }
})

test('N10: process handlers log an unhandled rejection and exit 1 on an uncaught exception', async () => {
  const { installProcessHandlers } = await import('../lib/gracefulShutdown.js')
  const { EventEmitter } = await import('node:events')
  const proc = new EventEmitter()
  const logged = []
  const exits = []
  installProcessHandlers({ logger: { captureException: (err, ctx) => logged.push([err.message, ctx.msg]) }, exit: (c) => exits.push(c), proc })
  proc.emit('unhandledRejection', new Error('r1'))
  assert.deepEqual(exits, [], 'keeps serving')
  proc.emit('uncaughtException', new Error('x1'))
  assert.deepEqual(exits, [1])
  assert.deepEqual(logged, [['r1', 'unhandled_rejection'], ['x1', 'uncaught_exception']])
})

test('N11: graceful shutdown finishes in-flight requests, drains, closes resources once and exits 0; a stuck request is cut at the deadline', async () => {
  const { createGracefulShutdown } = await import('../lib/gracefulShutdown.js')
  const logger = { info() {}, warn() {}, error() {} }
  // In-flight request completes.
  const a = express()
  a.get('/slow', (_req, res) => setTimeout(() => res.json({ done: true }), 300))
  const s = a.listen(0)
  await new Promise((r) => s.once('listening', r))
  const order = []
  const exits = []
  let drained = false
  const shutdown = createGracefulShutdown({ server: s, onDrain: () => { drained = true }, cleanups: [async () => order.push('worker'), async () => order.push('pool')], logger, exit: (c) => exits.push(c), timeoutMs: 5000 })
  const inflight = fetch(`http://127.0.0.1:${s.address().port}/slow`).then((r) => r.json())
  await new Promise((r) => setTimeout(r, 50))
  const done = shutdown('SIGTERM')
  assert.equal(shutdown('SIGTERM'), done, 'idempotent')
  assert.deepEqual(await inflight, { done: true })
  await done
  assert.equal(drained, true)
  assert.deepEqual(order, ['worker', 'pool'])
  assert.deepEqual(exits, [0])
  // Stuck request is cut at the deadline.
  const b = express()
  b.get('/stuck', () => {})
  const s2 = b.listen(0)
  await new Promise((r) => s2.once('listening', r))
  const exits2 = []
  const stuck = fetch(`http://127.0.0.1:${s2.address().port}/stuck`).catch(() => 'cut')
  await new Promise((r) => setTimeout(r, 50))
  const started = Date.now()
  await createGracefulShutdown({ server: s2, logger, exit: (c) => exits2.push(c), timeoutMs: 200 })('SIGTERM')
  assert.ok(Date.now() - started < 3000)
  assert.equal(await stuck, 'cut')
  assert.deepEqual(exits2, [0])
})

// ── N13: database TLS ───────────────────────────────────────────────────────

test('N13: PostgreSQL TLS verifies when a CA bundle is supplied or verify-* is requested; plain require keeps the old unverified mode (warned)', async () => {
  const { sslOptions } = await import('../db/pool.js')
  const readCa = (p) => `CA(${p})`
  assert.equal(sslOptions({}, readCa).ssl, undefined)
  assert.deepEqual(sslOptions({ PGSSLMODE: 'require' }, readCa), { ssl: { rejectUnauthorized: false }, verified: false, mode: 'require' })
  assert.deepEqual(sslOptions({ DATABASE_URL: 'postgres://h/db?sslmode=require' }, readCa).ssl, { rejectUnauthorized: false })
  const full = sslOptions({ PGSSLMODE: 'verify-full', PGSSLROOTCERT: '/etc/rds.pem' }, readCa)
  assert.deepEqual([full.verified, full.ssl.rejectUnauthorized, full.ssl.ca, full.ssl.checkServerIdentity], [true, true, 'CA(/etc/rds.pem)', undefined])
  const req = sslOptions({ PGSSLMODE: 'require', PGSSLROOTCERT: '/etc/rds.pem' }, readCa)
  assert.deepEqual([req.verified, req.ssl.rejectUnauthorized, typeof req.ssl.checkServerIdentity], [true, true, 'function'])
  const publicCa = sslOptions({ PGSSLMODE: 'verify-full' }, readCa)
  assert.deepEqual([publicCa.verified, publicCa.ssl.rejectUnauthorized, publicCa.ssl.ca], [true, true, undefined])
})

// ── N15: login timing ───────────────────────────────────────────────────────

test('N15: login for an unknown email does the same bcrypt work as a wrong password', async () => {
  const bcrypt = (await import('bcryptjs')).default
  const email = `timing-${crypto.randomUUID()}@test.local`
  await userDb.createUser({ email, name: 'Timing', passwordHash: await bcrypt.hash('right-password-1', 10) })
  const login = async (e, p) => {
    const t = process.hrtime.bigint()
    const r = await call('POST', '/api/auth/login', { body: { email: e, password: p } })
    return { status: r.status, body: r.body, ms: Number(process.hrtime.bigint() - t) / 1e6 }
  }
  await login(`warm-${crypto.randomUUID()}@test.local`, 'x') // computes the dummy hash once
  const unknown = await login(`nobody-${crypto.randomUUID()}@test.local`, 'wrong-password')
  const wrong = await login(email, 'wrong-password')
  assert.deepEqual([unknown.status, unknown.body], [401, { error: 'Invalid email or password.' }])
  assert.deepEqual([wrong.status, wrong.body], [401, { error: 'Invalid email or password.' }])
  assert.ok(unknown.ms > wrong.ms / 4, `unknown email (${unknown.ms.toFixed(1)} ms) runs a bcrypt compare like a wrong password (${wrong.ms.toFixed(1)} ms)`)
})
