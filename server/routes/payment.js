import { Router } from 'express'
import Razorpay from 'razorpay'
import crypto from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

// Validate env
const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env
if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.warn('[payment] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set — payment routes will fail')
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

// ── POST /api/payment/create-order ───────────────────────────────────────────
router.post('/create-order', async (req, res) => {
  try {
    const order = await getRazorpay().orders.create({
      amount: 49900, // ₹499 in paise — always use server-side amount
      currency: 'INR',
      receipt: `prism_${uuidv4()}`,
      notes: { product: 'Prism AI Assessment' },
    })
    res.json({ id: order.id, amount: order.amount, currency: order.currency })
  } catch (err) {
    console.error('[payment/create-order]', err)
    res.status(500).json({ error: 'Failed to create payment order' })
  }
})

// ── POST /api/payment/verify ─────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' })
  }

  const body = `${razorpay_order_id}|${razorpay_payment_id}`
  const expectedSig = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET || '')
    .update(body)
    .digest('hex')

  if (!crypto.timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(razorpay_signature, 'hex'))) {
    return res.status(400).json({ error: 'Invalid payment signature' })
  }

  // Payment verified — create a session token for the assessment
  const sessionId = uuidv4()
  // In production: persist sessionId → DB with paymentId + expiry

  res.json({ success: true, sessionId })
})

// ── POST /api/payment/dev-session ─────────────────────────────────────────────
// Creates a free session without payment — only available outside production.
// Used to test the assessment flow locally without Razorpay keys.
router.post('/dev-session', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' })
  }
  const sessionId = uuidv4()
  res.json({ sessionId })
})

export default router
