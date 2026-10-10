import express, { Router } from 'express'
import Razorpay from 'razorpay'
import crypto from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import logger from '../lib/logger.js'
import { createEntitlement, getReportsByUser, getSessionIdsByUser, getReport, getSession, redeemPayment, getPaymentRedemption } from '../lib/store.js'
import { authenticate } from '../domain/auth/requireUser.js'
import { getCommerceService, liveOfferView, PRODUCT_CODES } from '../domain/commerce/index.js'

const router = Router()

const PRICE_PAISE = 49900 // ₹499 in paise (INR — the live Razorpay account settles in INR)
const PRICE_CURRENCY = 'INR'
// P8.4: the package a verified personal payment grants. The amount above is
// the same test-hypothesis price the product config carries; nothing here is
// an approved live price.
const PURCHASE_PRODUCT = 'PERSONAL_DEVELOPMENT_SPRINT'

// Additive P8.5 grant alongside the existing entitlement. A grant failure is
// logged and never fails the already-verified payment (the entitlement is
// the access record the launcher reads; the grant is the package record).
async function grantAfterPayment({ userId, providerEventKey, purchaseRef, fundingSource, requestId }) {
  try {
    const commerce = getCommerceService()
    const result = fundingSource === 'DEV'
      ? await commerce.grantForDev({ userId, reference: providerEventKey, productCode: PURCHASE_PRODUCT })
      : await commerce.grantFromPayment({ userId, providerEventKey, purchaseRef, productCode: PURCHASE_PRODUCT })
    return result
  } catch (err) {
    logger.captureException(err, { msg: 'payment_grant_failed', requestId })
    return null
  }
}

// Dummy-payments mode (PRISM_DUMMY_PAYMENTS=true): checkout is bypassed and a
// free session entitlement is minted instead — INCLUDING in production. Used
// while the Razorpay account/keys are not live (2026-07-05: prod test keys are
// rejected by Razorpay with 401). Read lazily so tests/ops can flip it without
// a code change. Every dummy entitlement is recorded with mode='dummy' so paid
// vs free sessions stay distinguishable forever.
const isDummyPayments = () => process.env.PRISM_DUMMY_PAYMENTS === 'true'

// Skip-verification mode (PRISM_SKIP_VERIFICATION=true): the client routes
// candidates straight from payment to the briefing, bypassing identity
// verification and the phone/room proctor setup. For trial/preview periods
// only — never for certified assessments. Read lazily like the dummy flag.
const isSkipVerification = () => process.env.PRISM_SKIP_VERIFICATION === 'true'

// Charter §14 — proctoring minimization defaults: the phone second camera and
// gaze interpretation are OFF unless their governance-gated flags are set
// (documented buyer need + legal review; HA-005/HA-020). Read lazily.
const isPhoneCamEnabled = () => process.env.PRISM_PROCTOR_PHONE_CAM === 'true'
const isGazeEnabled = () => process.env.PRISM_PROCTOR_GAZE === 'true'

// Validate env
// Read lazily so test mode and operators can configure keys without a restart;
// never cached at import time (P8.5 verify/webhook tests rely on this).
const keyId = () => process.env.RAZORPAY_KEY_ID
const keySecret = () => process.env.RAZORPAY_KEY_SECRET
if (!keyId() || !keySecret()) {
  logger.warn('razorpay_keys_missing', { detail: 'RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set — payment routes will fail' })
}

// Lazy init — instantiate only when keys are present to avoid crash on startup
let razorpay = null
function getRazorpay() {
  if (!razorpay) {
    if (!keyId() || !keySecret()) {
      throw new Error('Razorpay keys not configured')
    }
    razorpay = new Razorpay({ key_id: keyId(), key_secret: keySecret() })
  }
  return razorpay
}

// The provider calls /verify depends on (Phase 1S, N2). Tests install a fake;
// production reads the order from Razorpay with the server's credentials.
let gatewayOverride = null
export function setPaymentGatewayForTests(fake) {
  gatewayOverride = fake || null
}
function gateway() {
  return gatewayOverride || { fetchOrder: (orderId) => getRazorpay().orders.fetch(orderId) }
}

const paymentsConfigured = () => Boolean(keyId() && keySecret())
const notConfigured = (res) => res.status(503).json({ error: 'Payments are temporarily unavailable. Please try again later or contact support.', code: 'PAYMENTS_NOT_CONFIGURED' })

// Provider ids are short opaque tokens (order_..., pay_...); the signature is
// a hex HMAC-SHA256. Anything else is refused before any crypto or lookup.
const PROVIDER_ID = /^[A-Za-z0-9_]{1,64}$/
const SIGNATURE = /^[a-f0-9]{64}$/i

// Signed-in, current account (token version and account state checked; a
// revoked token, a suspended or a deleted account is refused — N9).
async function signedIn(req, res, message) {
  const { user, reason } = await authenticate(req)
  if (user) return user
  if (reason === 'suspended') res.status(403).json({ error: 'This account is suspended.', code: 'ACCOUNT_SUSPENDED' })
  else res.status(401).json({ error: message })
  return null
}

// ── GET /api/payment/config ──────────────────────────────────────────────────
// Public, non-secret config the checkout page needs to decide which flow to use.
// Exposes ONLY the publishable key id (never the secret) and whether live
// Razorpay checkout is available. When disabled, the client falls back to the
// dev-session flow (non-production only).
router.get('/config', (_req, res) => {
  const dummy = isDummyPayments()
  const offer = liveOfferView(PURCHASE_PRODUCT)
  res.json({
    enabled: Boolean(!dummy && keyId() && keySecret()),
    keyId: dummy ? null : keyId() || null,
    amount: PRICE_PAISE,
    currency: PRICE_CURRENCY,
    devSessionAvailable: dummy || process.env.NODE_ENV !== 'production',
    dummyMode: dummy,
    skipVerification: isSkipVerification(),
    // Charter §14: minimized proctoring defaults — the client reads these to
    // decide whether the phone-camera step exists and whether gaze warnings
    // are shown. Both default OFF.
    proctoring: { phoneCam: isPhoneCamEnabled(), gaze: isGazeEnabled() },
    // P8.6: the offer the checkout displays — configured amount, finance
    // tax treatment (null = to be confirmed), allowance, window, limits and
    // the PROPOSED recovery/review policy. No tax rate lives in the client.
    offer,
    offers: PRODUCT_CODES.map((code) => liveOfferView(code)),
  })
})

// ── POST /api/payment/create-order ───────────────────────────────────────────
router.post('/create-order', async (req, res) => {
  const authUser = await signedIn(req, res, 'Sign in before starting checkout.')
  if (!authUser) return
  // P8.6: no order for a bundle whose reviewed content or price approval is
  // missing — the blockers are the same ones the checkout page shows.
  const offer = liveOfferView(PURCHASE_PRODUCT)
  if (!offer.purchasable) {
    return res.status(409).json({ error: 'This package is not available for purchase yet.', code: 'OFFER_NOT_PURCHASABLE', blockers: offer.availability?.blockers || [] })
  }
  if (!paymentsConfigured()) return notConfigured(res)
  try {
    const order = await getRazorpay().orders.create({
      amount: PRICE_PAISE, // always use server-side amount
      currency: PRICE_CURRENCY,
      receipt: `prism_${uuidv4()}`,
      // The user id in notes lets the webhook attribute a captured payment
      // without trusting the client; no email or name is placed here.
      notes: { product: 'Prism AI Assessment', productCode: PURCHASE_PRODUCT, userId: authUser.id },
    })
    res.json({ id: order.id, amount: order.amount, currency: order.currency })
  } catch (err) {
    logger.captureException(err, {
      msg: 'payment_create_order_failed',
      requestId: req.requestId,
      rzpStatus: err?.statusCode,
      rzpCode: err?.error?.code,
      rzpDescription: err?.error?.description,
    })
    // Razorpay 401 = OUR credentials are wrong — an ops problem, not the
    // candidate's. Return 503 with an honest message instead of a generic 500.
    if (err?.statusCode === 401) {
      return res.status(503).json({
        error: 'Payments are temporarily unavailable (gateway configuration). Please try again later or contact support.',
      })
    }
    res.status(500).json({ error: 'Failed to create payment order' })
  }
})

// ── POST /api/payment/verify ─────────────────────────────────────────────────
// Phase 1S (audit 2026-10-10, N2/N3): the checkout's signed result is
// redeemed AT MOST ONCE per provider payment id. The first verify records the
// redemption and the paid entitlement together (store redeemPayment; PG table
// v1_payment_redemptions, migration 0055); a repeat by the same account
// returns the SAME sessionId and grant, so client retries are safe; anyone
// else is refused. The order is read back from the provider before the first
// redemption: it must have been created by /create-order for THIS account
// (order notes), for this product at the server price, and be paid
// (captured). The offer's purchasability is enforced where money is taken —
// /create-order refuses an unpurchasable offer, and /verify only redeems
// orders /create-order made — so a payment the provider already captured is
// never refused service because the offer closed afterwards.
router.post('/verify', async (req, res) => {
  const authUser = await signedIn(req, res, 'Sign in before verifying payment.')
  if (!authUser) return
  // Never verify with an empty or missing key: an HMAC under '' is forgeable.
  if (!keySecret()) return notConfigured(res)
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {}

  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ error: 'Missing payment fields' })
  }
  if (![orderId, paymentId].every((v) => typeof v === 'string' && PROVIDER_ID.test(v)) || typeof signature !== 'string' || !SIGNATURE.test(signature)) {
    return res.status(400).json({ error: 'Invalid payment signature' })
  }

  const expected = crypto.createHmac('sha256', keySecret()).update(`${orderId}|${paymentId}`).digest()
  const provided = Buffer.from(signature, 'hex')
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(400).json({ error: 'Invalid payment signature' })
  }

  const respond = async (redemption) => {
    // P8.5: the package grant, idempotent on the provider payment id — the
    // webhook for the same payment returns this same grant.
    const granted = await grantAfterPayment({ userId: authUser.id, providerEventKey: `razorpay:payment:${paymentId}`, purchaseRef: orderId, fundingSource: 'PAID', requestId: req.requestId })
    return res.json({ success: true, sessionId: redemption.sessionId, grantId: granted?.grant?.id || null, ...(redemption.created ? {} : { alreadyRedeemed: true }) })
  }
  const refuseRedeemed = (redemption) => {
    if (redemption.userId && redemption.userId === String(authUser.id) && redemption.sessionId) return null
    if (redemption.orderId && redemption.orderId !== orderId) return res.status(409).json({ error: 'This payment does not belong to this order.', code: 'ORDER_MISMATCH' })
    if (!redemption.userId || !redemption.sessionId) {
      return res.status(409).json({ error: 'This payment has already been used, and the assessment it paid for was deleted. Contact support if this is unexpected.', code: 'PAYMENT_ALREADY_REDEEMED' })
    }
    return res.status(403).json({ error: 'This payment belongs to a different account.', code: 'PAYMENT_NOT_YOURS' })
  }

  try {
    // A retry after a lost response: answered from the ledger, no provider call.
    const prior = await getPaymentRedemption(paymentId)
    if (prior) return refuseRedeemed(prior) || await respond({ ...prior, created: false })

    let order
    try {
      order = await gateway().fetchOrder(orderId)
    } catch (err) {
      logger.captureException(err, { msg: 'payment_verify_order_fetch_failed', requestId: req.requestId, rzpStatus: err?.statusCode })
      return res.status(503).json({ error: 'We could not confirm your payment with the payment provider yet. Please try again in a moment; you will not be charged twice.', code: 'PAYMENT_PROVIDER_UNAVAILABLE', retryable: true })
    }
    if (!order || order.id !== orderId || String(order.notes?.userId || '') !== String(authUser.id)) {
      logger.warn('payment_verify_order_not_owned', { requestId: req.requestId })
      return res.status(403).json({ error: 'This payment belongs to a different account.', code: 'PAYMENT_NOT_YOURS' })
    }
    if (order.notes?.productCode !== PURCHASE_PRODUCT || Number(order.amount) !== PRICE_PAISE || order.currency !== PRICE_CURRENCY) {
      logger.warn('payment_verify_order_mismatch', { requestId: req.requestId })
      return res.status(409).json({ error: 'This payment is not for this package.', code: 'ORDER_MISMATCH' })
    }
    if (order.status !== 'paid') {
      // Authorised but not yet captured (or not paid at all). Captured
      // payments are granted; the client retries shortly.
      return res.status(409).json({ error: 'Your payment is still being confirmed. Please wait a moment.', code: 'PAYMENT_NOT_CAPTURED', retryable: true })
    }

    const redemption = await redeemPayment({
      paymentId,
      orderId,
      sessionId: uuidv4(),
      amount: PRICE_PAISE,
      userId: authUser.id,
      userEmail: authUser.email,
    })
    if (!redemption.created) {
      const refused = refuseRedeemed(redemption)
      if (refused) return refused
    }
    if (redemption.created) logger.info('payment_redeemed', { requestId: req.requestId })
    return await respond(redemption)
  } catch (err) {
    logger.captureException(err, { msg: 'payment_verify_entitlement_failed', requestId: req.requestId })
    return res.status(500).json({ error: 'Failed to register payment' })
  }
})

// ── POST /api/payment/webhook ────────────────────────────────────────────────
// Razorpay server-to-server callback. The raw body is verified against
// RAZORPAY_WEBHOOK_SECRET (HMAC-SHA256, x-razorpay-signature). Grants are
// idempotent on the payment id, so a repeated or reordered delivery answers
// 200 and never duplicates a grant. Without a configured secret the route is
// closed (503) except in dummy-payments mode, where a reviewed fixture body
// is accepted for tests — never a live transaction.
router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}))
  if (secret) {
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('hex'), 'hex')
    let provided
    try { provided = Buffer.from(String(req.headers['x-razorpay-signature'] || ''), 'hex') } catch { provided = Buffer.alloc(0) }
    if (!provided.length || expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
      return res.status(400).json({ error: 'Invalid webhook signature' })
    }
  } else if (!isDummyPayments()) {
    return res.status(503).json({ error: 'Webhook not configured' })
  }
  let event
  try { event = JSON.parse(raw.toString('utf8')) } catch { return res.status(400).json({ error: 'Invalid webhook body' }) }
  const payment = event?.payload?.payment?.entity
  if (!payment?.id) return res.status(200).json({ received: true, ignored: 'no payment entity' })
  // Phase 1S (N2): only money that was actually captured grants anything.
  // `payment.authorized` is an authorisation hold that Razorpay refunds if it
  // is never captured; it is acknowledged and ignored. The grant is keyed on
  // the provider payment id, the same key /verify uses, so a payment redeemed
  // through /verify and reported here (or the reverse, in any order, any
  // number of times) ends with exactly one grant. The webhook never mints a
  // legacy session entitlement; only /verify (single-use per payment) does.
  if (!['payment.captured', 'order.paid'].includes(event.event)) {
    return res.status(200).json({ received: true, ignored: event.event || 'unknown event' })
  }
  if (event.event === 'payment.captured' && payment.status && payment.status !== 'captured') {
    return res.status(200).json({ received: true, ignored: 'payment not captured' })
  }
  // Order notes carry the account id set by /create-order; a payment entity
  // carries them only when the checkout passed notes too.
  const userId = payment.notes?.userId || event?.payload?.order?.entity?.notes?.userId
  if (!userId || typeof userId !== 'string' || userId.length > 80) return res.status(200).json({ received: true, ignored: 'no user attribution' })
  const granted = await grantAfterPayment({ userId, providerEventKey: `razorpay:payment:${payment.id}`, purchaseRef: payment.order_id || null, fundingSource: 'PAID', requestId: req.requestId })
  // Payment ids and event ids never reach the log line; only outcome flags do.
  logger.info('payment_webhook_processed', { created: Boolean(granted?.created), duplicate: Boolean(granted && !granted.created), requestId: req.requestId })
  res.status(200).json({ received: true, duplicate: Boolean(granted && !granted.created) })
})

// ── POST /api/payment/dev-session ─────────────────────────────────────────────
// Creates a free session without payment. Available outside production, OR in
// production when PRISM_DUMMY_PAYMENTS=true (checkout bypass while the
// payment gateway is not live). Dummy sessions are marked mode='dummy'.
router.post('/dev-session', async (req, res) => {
  const authUser = await signedIn(req, res, 'Sign in before creating an assessment session.')
  if (!authUser) return
  const dummy = isDummyPayments()
  if (process.env.NODE_ENV === 'production' && !dummy) {
    return res.status(403).json({ error: 'Not available in production' })
  }
  const sessionId = uuidv4()
  const mode = dummy && process.env.NODE_ENV === 'production' ? 'dummy' : 'dev'
  await createEntitlement({ sessionId, mode, amount: 0, userId: authUser.id, userEmail: authUser.email })
  // P8.5: a DEV-funded package grant keyed on the minted session (idempotent).
  const granted = await grantAfterPayment({ userId: authUser.id, providerEventKey: sessionId, purchaseRef: null, fundingSource: 'DEV', requestId: req.requestId })
  logger.info('payment_session_minted', { sessionId, mode, requestId: req.requestId })
  res.json({ sessionId, grantId: granted?.grant?.id || null })
})

// ── POST /api/payment/invite/redeem ──────────────────────────────────────────
// A signed-in candidate redeems a group assessment invite link (minted by an
// administrator). Idempotent per candidate per invite — revisiting the link
// returns the SAME session. Mode 'invite' entitlements are REAL candidates
// (college cohorts), so their sessions are not synthetic-flagged.
router.post('/invite/redeem', async (req, res) => {
  const authUser = await signedIn(req, res, 'Sign in to use an invite link.')
  if (!authUser) return
  const { token } = req.body || {}
  if (!token || typeof token !== 'string' || token.length > 128) {
    return res.status(400).json({ error: 'Invalid invite link.' })
  }
  try {
    const { redeemInvite, isInvitesAvailable } = await import('../lib/invites.js')
    if (!isInvitesAvailable()) {
      return res.status(503).json({ error: 'Invites are not available right now.' })
    }
    const result = await redeemInvite(token, { userId: authUser.id, userEmail: authUser.email })
    logger.info('payment_invite_redeemed', {
      sessionId: result.sessionId,
      alreadyRedeemed: result.alreadyRedeemed,
      requestId: req.requestId,
    })
    res.json({ sessionId: result.sessionId, alreadyRedeemed: result.alreadyRedeemed })
  } catch (err) {
    const codes = {
      INVITE_NOT_FOUND: 404,
      INVITE_REVOKED: 410,
      INVITE_EXPIRED: 410,
      INVITE_NOT_STARTED: 409,
      INVITE_EXHAUSTED: 409,
    }
    if (codes[err.code]) return res.status(codes[err.code]).json({ error: err.message, code: err.code })
    logger.captureException(err, { msg: 'payment_invite_redeem_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Could not redeem this invite. Please try again.' })
  }
})

// ── GET /api/payment/licence ───────────────────────────────────────────────────
// The app launcher's licence check: is this signed-in candidate resuming an
// in-progress assessment, starting fresh, or in need of a purchase? Honest
// facts only — everything comes from the store, nothing is invented:
//   · pendingSessionId = a session they started but never completed (resume)
//   · completed        = number of finished assessments (their history)
//   · canPurchase      = whether checkout can mint a new session right now
router.get('/licence', async (req, res) => {
  const authUser = await signedIn(req, res, 'Not authenticated.')
  if (!authUser) return
  try {
    const [reports, sessionIds] = await Promise.all([
      getReportsByUser(authUser.id),
      getSessionIdsByUser(authUser.id),
    ])
    const reported = new Set((reports || []).map((r) => r.sessionId).filter(Boolean))
    // A pending licence = a session of theirs with no report yet (minted at
    // payment, not yet scored) — the launcher offers to resume it.
    let pendingSessionId = null
    for (const sid of sessionIds || []) {
      if (reported.has(sid)) continue
      const report = await getReport(sid)
      if (report) continue
      const session = await getSession(sid)
      if (session) {
        pendingSessionId = sid
        break
      }
    }
    res.json({
      email: authUser.email,
      completed: (reports || []).length,
      pendingSessionId,
      canPurchase:
        isDummyPayments() ||
        Boolean(keyId() && keySecret()) ||
        process.env.NODE_ENV !== 'production',
      mode: isDummyPayments() ? 'dummy' : 'paid',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'payment_licence_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Could not check the licence.' })
  }
})

export default router
