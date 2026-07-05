import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Clock, Layers, BadgeCheck, Lock, Loader2 } from 'lucide-react'
import { getUser } from '../lib/session.js'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { SCORE_VALIDITY_MONTHS } from '../../server/lib/sharedConstants.js'

const INCLUDES = [
  { icon: Clock, text: '30-minute live AI scenario assessment' },
  { icon: Layers, text: 'Scored across 5 workplace skill dimensions' },
  { icon: BadgeCheck, text: 'Certified, verified & shareable Prism Score' },
]

// Inject the Razorpay Checkout script once; resolves when window.Razorpay exists.
function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const existing = document.getElementById('razorpay-checkout-js')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Could not load the payment gateway.')))
      return
    }
    const s = document.createElement('script')
    s.id = 'razorpay-checkout-js'
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the payment gateway.'))
    document.body.appendChild(s)
  })
}

// Open the Razorpay modal and, on success, verify server-side. Resolves with the
// minted sessionId. The amount is always enforced server-side.
function openRazorpayCheckout({ cfg, order, user }) {
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: cfg.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: 'Prism Assessment',
      description: '30-minute Prism Assessment',
      prefill: { name: user?.name || '', email: user?.email || '' },
      theme: { color: '#C9A84C' },
      handler: async (response) => {
        try {
          const verifyRes = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
          })
          if (!verifyRes.ok) throw new Error('Payment could not be verified. If you were charged, contact support.')
          const { sessionId } = await verifyRes.json()
          resolve(sessionId)
        } catch (err) {
          reject(err)
        }
      },
      modal: { ondismiss: () => reject(new Error('Payment was cancelled.')) },
    })
    rzp.on('payment.failed', () => reject(new Error('Payment failed. Please try again.')))
    rzp.open()
  })
}

export default function Payment() {
  const navigate = useNavigate()
  const user = getUser()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handlePay = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      // Ask the server which checkout flow is available (publishable key only).
      const cfgRes = await fetch('/api/payment/config')
      const cfg = cfgRes.ok ? await cfgRes.json() : {}

      if (cfg.enabled && cfg.keyId) {
        // ── Live Razorpay checkout ──────────────────────────────────────────
        await loadRazorpayScript()
        const orderRes = await fetch('/api/payment/create-order', { method: 'POST' })
        if (!orderRes.ok) {
          const data = await orderRes.json().catch(() => ({}))
          throw new Error(data.error || 'Could not start checkout. Please try again.')
        }
        const order = await orderRes.json()
        const sessionId = await openRazorpayCheckout({ cfg, order, user })
        navigate(`/verify-identity?session=${sessionId}`)
        return
      }

      // ── Dev fallback (non-production only) ───────────────────────────────
      if (!cfg.devSessionAvailable) {
        throw new Error('Payments are not configured yet. Please contact support.')
      }
      const res = await fetch('/api/payment/dev-session', { method: 'POST' })
      if (!res.ok) throw new Error('Could not start your session. Please try again.')
      const { sessionId } = await res.json()
      // Continue into identity verification + proctoring (which carry the
      // sessionId through to the briefing and the assessment itself).
      navigate(`/verify-identity?session=${sessionId}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#1A1A2E] flex flex-col">
      <header className="shrink-0 flex items-center px-6 h-16 border-b border-[#E0E0E8]">
        <Link to="/" aria-label="Prism home">
          <PrismLogo size={32} />
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-lg"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#C9A84C]/10 mb-4">
              <ShieldCheck size={22} className="text-[#C9A84C]" />
            </div>
            <h1 className="font-serif text-3xl text-[#1A1A2E] mb-1">Confirm your assessment</h1>
            {user?.name && (
              <p className="font-sans text-sm text-[#64687A]">Signed in as {user.name}</p>
            )}
          </div>

          {/* Summary card */}
          <div className="rounded-2xl border border-[#E8E8F0] bg-[#F5F5FA] overflow-hidden">
            <div className="px-6 py-5 border-b border-[#E8E8F0] flex items-center justify-between">
              <div>
                <p className="font-sans font-semibold text-sm text-[#1A1A2E]">30-minute Prism Assessment</p>
                <p className="font-sans text-xs text-[#64687A] mt-0.5">One-time · Score valid {SCORE_VALIDITY_MONTHS} months</p>
              </div>
              <p className="font-serif text-2xl text-[#1A1A2E]">$10</p>
            </div>

            <ul className="px-6 py-5 flex flex-col gap-3">
              {INCLUDES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3 items-start">
                  <Icon size={16} className="text-[#C9A84C] shrink-0 mt-0.5" />
                  <span className="font-sans text-sm text-[#3A3A4A]">{text}</span>
                </li>
              ))}
            </ul>

            <div className="px-6 py-4 border-t border-[#E8E8F0] flex items-center justify-between bg-white">
              <span className="font-sans text-sm font-semibold text-[#1A1A2E]">Total</span>
              <span className="font-sans text-sm font-semibold text-[#1A1A2E]">$10</span>
            </div>
          </div>

          {error && (
            <p className="font-sans text-sm text-[#E05252] text-center mt-4">{error}</p>
          )}

          <motion.button
            onClick={handlePay}
            disabled={loading}
            className="mt-6 w-full py-4 rounded-xl bg-[#1A1A2E] font-sans font-semibold text-sm text-[#C9A84C] tracking-wide hover:bg-[#252A3A] transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            whileHover={loading ? {} : { scale: 1.01 }}
            whileTap={loading ? {} : { scale: 0.98 }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
            {loading ? 'Starting…' : 'Pay $10 & Continue'}
          </motion.button>

          <p className="text-center font-sans text-xs text-[#A0A4B0] mt-4">
            Secure payment via Razorpay · Coming soon. You’ll proceed to the assessment briefing.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
