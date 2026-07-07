import { Router } from 'express'
import Razorpay from 'razorpay'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import logger from '../lib/logger.js'
import { createEntitlement, getReportsByUser, getSessionIdsByUser, getReport, getSession } from '../lib/store.js'
import { getJwtSecret } from '../lib/security.js'

const router = Router()

const PRICE_PAISE = 1000 // $10 (in cents)

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

// Validate env
const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env
if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  logger.warn('razorpay_keys_missing', { detail: 'RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set — payment routes will fail' })
}

// Lazy init — instantiate only when keys are present to avoid crash on startup
let razorpay = null
function getRazorpay() {
  if (!razorpay) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay keys not configured')
    }
    razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
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
  res.json({
    enabled: Boolean(!dummy && RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),
    keyId: dummy ? null : RAZORPAY_KEY_ID || null,
    amount: PRICE_PAISE,
    currency: 'USD',
    devSessionAvailable: dummy || process.env.NODE_ENV !== 'production',
    dummyMode: dummy,
    skipVerification: isSkipVerification(),
  })
})

// ── POST /api/payment/create-order ───────────────────────────────────────────
router.post('/create-order', async (req, res) => {
  try {
    const order = await getRazorpay().orders.create({
      amount: PRICE_PAISE, // always use server-side amount
      currency: 'USD',
      receipt: `prism_${uuidv4()}`,
      notes: { product: 'Prism AI Assessment' },
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
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' })
  }

  const body = `${razorpay_order_id}|${razorpay_payment_id}`
  const expectedSig = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET || '')
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
    })
  } catch (err) {
    logger.captureException(err, { msg: 'payment_verify_entitlement_failed', requestId: req.requestId })
    return res.status(500).json({ error: 'Failed to register payment' })
  }

  res.json({ success: true, sessionId })
})

// ── POST /api/payment/dev-session ─────────────────────────────────────────────
// Creates a free session without payment. Available outside production, OR in
// production when PRISM_DUMMY_PAYMENTS=true (checkout bypass while the
// payment gateway is not live). Dummy sessions are marked mode='dummy'.
router.post('/dev-session', async (req, res) => {
  const dummy = isDummyPayments()
  if (process.env.NODE_ENV === 'production' && !dummy) {
    return res.status(403).json({ error: 'Not available in production' })
  }
  const sessionId = uuidv4()
  const mode = dummy && process.env.NODE_ENV === 'production' ? 'dummy' : 'dev'
  await createEntitlement({ sessionId, mode, amount: 0 })
  logger.info('payment_session_minted', { sessionId, mode, requestId: req.requestId })
  res.json({ sessionId })
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
        Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) ||
        process.env.NODE_ENV !== 'production',
      mode: isDummyPayments() ? 'dummy' : 'paid',
    })
  } catch (err) {
    logger.captureException(err, { msg: 'payment_licence_failed', requestId: req.requestId })
    res.status(500).json({ error: 'Could not check the licence.' })
  }
})

export default router
