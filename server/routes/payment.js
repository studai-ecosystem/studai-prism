import { Router } from 'express'
import Razorpay from 'razorpay'
import crypto from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import logger from '../lib/logger.js'
import { createEntitlement } from '../lib/store.js'

const router = Router()

const PRICE_PAISE = 1000 // $10 (in cents)

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
  res.json({
    enabled: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),
    keyId: RAZORPAY_KEY_ID || null,
    amount: PRICE_PAISE,
    currency: 'USD',
    devSessionAvailable: process.env.NODE_ENV !== 'production',
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
// Creates a free session without payment — only available outside production.
// Used to test the assessment flow locally without Razorpay keys.
router.post('/dev-session', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' })
  }
  const sessionId = uuidv4()
  await createEntitlement({ sessionId, mode: 'dev', amount: 0 })
  res.json({ sessionId })
})

export default router
