import express, { Router } from 'express'
import Razorpay from 'razorpay'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import logger from '../lib/logger.js'
import { createEntitlement, getReportsByUser, getSessionIdsByUser, getReport, getSession } from '../lib/store.js'
import { getJwtSecret } from '../lib/security.js'
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
  const authUser = getAuthUser(req)
  if (!authUser) return res.status(401).json({ error: 'Sign in before starting checkout.' })
  // P8.6: no order for a bundle whose reviewed content or price approval is
  // missing — the blockers are the same ones the checkout page shows.
  const offer = liveOfferView(PURCHASE_PRODUCT)
  if (!offer.purchasable) {
    return res.status(409).json({ error: 'This package is not available for purchase yet.', code: 'OFFER_NOT_PURCHASABLE', blockers: offer.availability?.blockers || [] })
  }
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
router.post('/verify', async (req, res) => {
  const authUser = getAuthUser(req)
  if (!authUser) return res.status(401).json({ error: 'Sign in before verifying payment.' })
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' })
  }

  const body = `${razorpay_order_id}|${razorpay_payment_id}`
  const expectedSig = crypto
    .createHmac('sha256', keySecret() || '')
    .update(body)
    .digest('hex')

  // Length-guard before timingSafeEqual (it throws on mismatched buffer sizes).
  const expected = Buffer.from(expectedSig, 'hex')
  let provided
  try {
    provided = Buffer.from(razorpay_signature, 'hex')
  } catch {
    return res.status(400).json({ error: 'Invalid payment signature' })
  }
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(400).json({ error: 'Invalid payment signature' })
  }

  // Payment verified — mint a session token and a durable entitlement that
  // authorises starting exactly one assessment.
  const sessionId = uuidv4()
  try {
    await createEntitlement({
      sessionId,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: PRICE_PAISE,
      mode: 'paid',
      userId: authUser.id,
      userEmail: authUser.email,
    })
  } catch (err) {
    logger.captureException(err, { msg: 'payment_verify_entitlement_failed', requestId: req.requestId })
    return res.status(500).json({ error: 'Failed to register payment' })
  }
  // P8.5: the package grant, idempotent on the provider payment id — the
  // webhook for the same payment returns this same grant.
  const granted = await grantAfterPayment({ userId: authUser.id, providerEventKey: `razorpay:payment:${razorpay_payment_id}`, purchaseRef: razorpay_order_id, fundingSource: 'PAID', requestId: req.requestId })

  res.json({ success: true, sessionId, grantId: granted?.grant?.id || null })
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
  if (!['payment.captured', 'payment.authorized', 'order.paid'].includes(event.event)) {
    return res.status(200).json({ received: true, ignored: event.event || 'unknown event' })
  }
  const userId = payment.notes?.userId
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
  const authUser = getAuthUser(req)
  if (!authUser) return res.status(401).json({ error: 'Sign in before creating an assessment session.' })
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
  const authUser = getAuthUser(req)
  if (!authUser) return res.status(401).json({ error: 'Sign in to use an invite link.' })
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
function getAuthUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try {
    const payload = jwt.verify(token, getJwtSecret())
    return { id: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

router.get('/licence', async (req, res) => {
  const authUser = getAuthUser(req)
  if (!authUser) return res.status(401).json({ error: 'Not authenticated.' })
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
