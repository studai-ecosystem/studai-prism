import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Clock, Layers, BadgeCheck, Lock, Loader2 } from 'lucide-react'
import { getUser, getToken } from '../lib/session.js'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { SCORE_VALIDITY_MONTHS } from '../../server/lib/sharedConstants.js'

const INCLUDES = [
  { icon: Clock, text: '30-minute live AI scenario assessment with its evidence-backed report' },
  { icon: Layers, text: 'Four development missions of your choice, two attempts each' },
  { icon: BadgeCheck, text: 'One fresh practice challenge; a shareable report you control' },
]

// Paise → rupee string from the SERVER amount; never a constant in this file.
const formatInr = (paise) => (typeof paise === 'number' && Number.isFinite(paise) ? `\u20B9${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : null)

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
function openRazorpayCheckout({ cfg, order, user, token }) {
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: cfg.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: 'Prism Assessment',
      description: '30-minute Prism Assessment',
      prefill: { name: user?.name || '', email: user?.email || '' },
      theme: { color: 'var(--prism-signal)' },
      handler: async (response) => {
        try {
          const verifyRes = await fetch('/api/payment/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
  const [dummyMode, setDummyMode] = useState(false)
  // P8.6: amount, tax treatment, allowance, window and policy come from the
  // server config; null = not loaded yet (shown as pending, never guessed).
  const [offer, setOffer] = useState(null)
  const [configState, setConfigState] = useState('loading') // loading | ready | error
  const [coupon, setCoupon] = useState('')
  const [couponBusy, setCouponBusy] = useState(false)
  const [couponError, setCouponError] = useState(null)

  // A valid coupon/invite code claims a free seat minted by an administrator
  // and skips checkout entirely — same funnel from there on.
  const handleApplyCoupon = async () => {
    const code = coupon.trim()
    if (!code || couponBusy) return
    setCouponBusy(true)
    setCouponError(null)
    try {
      const res = await fetch('/api/payment/invite/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ token: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'This code is not valid.')
      const cfg = await fetch('/api/payment/config').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      navigate(cfg.skipVerification ? `/briefing?session=${data.sessionId}` : `/verify-identity?session=${data.sessionId}`)
    } catch (err) {
      setCouponError(err.message)
      setCouponBusy(false)
    }
  }

  // Surface test/dummy mode so nobody thinks a real charge happens (the server
  // decides the mode — the client only displays it).
  useEffect(() => {
    let cancelled = false
    fetch('/api/payment/config')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('config'))))
      .then((cfg) => {
        if (cancelled) return
        setDummyMode(Boolean(cfg.dummyMode))
        setOffer(cfg.offer || { amount: cfg.amount, currency: cfg.currency, purchasable: true, taxTreatment: null, windowDays: null, included: null, limits: [], policy: null })
        setConfigState('ready')
      })
      .catch(() => { if (!cancelled) setConfigState('error') })
    return () => { cancelled = true }
  }, [])

  const amountLabel = formatInr(offer?.amount)
  const purchasable = Boolean(offer?.purchasable)
  const inc = offer?.included || null

  const handlePay = async () => {
    if (loading || !purchasable) return
    setLoading(true)
    setError(null)
    try {
      const token = getToken()
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}
      // Ask the server which checkout flow is available (publishable key only).
      const cfgRes = await fetch('/api/payment/config')
      const cfg = cfgRes.ok ? await cfgRes.json() : {}
      // Trial mode (PRISM_SKIP_VERIFICATION): skip identity verification and
      // proctor setup — straight to the briefing (consent still applies there).
      const nextStep = (sessionId) =>
        cfg.skipVerification ? `/briefing?session=${sessionId}` : `/verify-identity?session=${sessionId}`

      if (cfg.enabled && cfg.keyId) {
        // ── Live Razorpay checkout ──────────────────────────────────────────
        await loadRazorpayScript()
        const orderRes = await fetch('/api/payment/create-order', { method: 'POST', headers: authHeaders })
        if (!orderRes.ok) {
          const data = await orderRes.json().catch(() => ({}))
          throw new Error(data.error || 'Could not start checkout. Please try again.')
        }
        const order = await orderRes.json()
        const sessionId = await openRazorpayCheckout({ cfg, order, user, token })
        navigate(nextStep(sessionId))
        return
      }

      // ── Dev fallback (non-production only) ───────────────────────────────
      if (!cfg.devSessionAvailable) {
        throw new Error('Payments are not configured yet. Please contact support.')
      }
      const res = await fetch('/api/payment/dev-session', { method: 'POST', headers: authHeaders })
      if (!res.ok) throw new Error('Could not start your session. Please try again.')
      const { sessionId } = await res.json()
      // Continue into the next step (which carries the sessionId through to
      // the briefing and the assessment itself).
      navigate(nextStep(sessionId))
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-prism-surface text-[var(--prism-ink)] flex flex-col">
      <header className="shrink-0 flex items-center px-6 h-16 border-b border-[var(--prism-border)]">
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
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--prism-signal)]/10 mb-4">
              <ShieldCheck size={22} className="text-[var(--prism-signal)]" />
            </div>
            <h1 className="font-serif text-3xl text-[var(--prism-ink)] mb-1">Confirm your assessment</h1>
            {user?.name && (
              <p className="font-sans text-sm text-[var(--prism-ink-muted)]">Signed in as {user.name}</p>
            )}
          </div>

          {/* Summary card */}
          <div className="rounded-2xl border border-[var(--prism-border)] bg-[var(--prism-canvas)] overflow-hidden" data-testid="checkout-summary">
            <div className="px-6 py-5 border-b border-[var(--prism-border)] flex items-center justify-between gap-4">
              <div>
                <p className="font-sans font-semibold text-sm text-[var(--prism-ink)]">{offer?.title || 'Personal development sprint'}</p>
                <p className="font-sans text-xs text-[var(--prism-ink-muted)] mt-0.5">
                  One-time · {offer?.windowDays ? `${offer.windowDays}-day activity window · ` : ''}Report valid {SCORE_VALIDITY_MONTHS} months
                </p>
              </div>
              <p className="font-serif text-2xl text-[var(--prism-ink)] tabular-nums" data-testid="checkout-amount">
                {configState === 'loading' ? 'Loading…' : amountLabel || 'Not available'}
              </p>
            </div>

            <ul className="px-6 py-5 flex flex-col gap-3">
              {INCLUDES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3 items-start">
                  <Icon size={16} className="text-[var(--prism-signal)] shrink-0 mt-0.5" />
                  <span className="font-sans text-sm text-[var(--prism-ink)]">{text}</span>
                </li>
              ))}
            </ul>

            <dl className="px-6 pb-5 grid grid-cols-1 gap-2 font-sans text-xs text-[var(--prism-ink-muted)]" data-testid="checkout-terms">
              <div className="flex justify-between gap-4">
                <dt>Allowance</dt>
                <dd className="text-right text-[var(--prism-ink)]">
                  {inc ? `Formal assessment ×${inc.formalAssessments} · missions ×${inc.missionsSelectable} (${inc.attemptsPerMission} attempts each) · fresh challenge ×${inc.freshChallenges}` : 'Pending'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Activity window</dt>
                <dd className="text-right text-[var(--prism-ink)]">{offer?.windowDays ? `${offer.windowDays} days; your report stays readable afterwards` : 'Pending'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Tax treatment</dt>
                <dd className="text-right text-[var(--prism-ink)]" data-testid="checkout-tax">{configState !== 'ready' ? 'Pending' : offer?.taxTreatment || 'Tax treatment to be confirmed'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Recovery / review</dt>
                <dd className="text-right text-[var(--prism-ink)]">{offer?.policy ? `${offer.policy.recovery}; ${offer.policy.review}. Policy ${String(offer.policy.status || '').toLowerCase()}, pending approval.` : 'Pending'}</dd>
              </div>
              {(offer?.limits || []).map((l) => (
                <div key={l} className="flex gap-2"><dt className="sr-only">Limit</dt><dd>· {l}</dd></div>
              ))}
            </dl>

            <div className="px-6 py-4 border-t border-[var(--prism-border)] flex items-center justify-between bg-prism-surface">
              <span className="font-sans text-sm font-semibold text-[var(--prism-ink)]">Total</span>
              <span className="font-sans text-sm font-semibold text-[var(--prism-ink)] tabular-nums">{configState === 'loading' ? '…' : amountLabel || 'Not available'}</span>
            </div>
          </div>

          {configState === 'error' && (
            <p className="font-sans text-sm text-[var(--status-blocked-ink)] text-center mt-4" role="alert">
              The offer could not be loaded, so checkout is paused. Please reload the page or try again later.
            </p>
          )}
          {configState === 'ready' && !purchasable && (
            <p className="font-sans text-sm text-[var(--prism-ink-muted)] text-center mt-4" role="status" data-testid="checkout-unavailable">
              This package is not available for purchase yet.
            </p>
          )}
          {error && (
            <p className="font-sans text-sm text-[var(--status-blocked-ink)] text-center mt-4">{error}</p>
          )}

          <motion.button
            onClick={handlePay}
            disabled={loading || configState !== 'ready' || !purchasable}
            className="mt-6 w-full py-4 rounded-xl bg-[var(--prism-ink)] font-sans font-semibold text-sm text-[var(--prism-canvas)] tracking-wide hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            whileHover={loading ? {} : { scale: 1.01 }}
            whileTap={loading ? {} : { scale: 0.98 }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
            {loading ? 'Starting…' : dummyMode ? 'Continue (free preview)' : amountLabel ? `Pay ${amountLabel} & Continue` : 'Checkout unavailable'}
          </motion.button>

          {dummyMode ? (
            <p className="text-center font-sans text-xs text-[var(--prism-ink-muted)] mt-4">
              Payments are in test mode — you will not be charged. You’ll proceed straight to the assessment briefing.
            </p>
          ) : (
            <p className="text-center font-sans text-xs text-[var(--prism-ink-muted)] mt-4">
              Secure payment via Razorpay. You’ll proceed to the assessment briefing.
            </p>
          )}

          {/* Coupon / invite code */}
          <div className="mt-6 rounded-xl border border-[var(--prism-border)] bg-[var(--prism-canvas)] p-4">
            <p className="font-sans text-xs font-semibold text-[var(--prism-ink-muted)] uppercase tracking-wide">Have a coupon or invite code?</p>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyCoupon() } }}
                placeholder="e.g. msw"
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--prism-border)] bg-prism-surface font-sans text-sm text-[var(--prism-ink)] focus:outline-none focus:border-[var(--prism-signal)]"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={couponBusy || !coupon.trim()}
                className="px-4 py-2 rounded-lg font-sans font-semibold text-sm text-[var(--prism-ink)] border border-[var(--prism-border)] bg-prism-surface cursor-pointer hover:bg-[var(--prism-canvas)] transition disabled:opacity-50 flex items-center gap-2"
              >
                {couponBusy && <Loader2 size={14} className="animate-spin" />}
                Apply
              </button>
            </div>
            {couponError && (
              <p className="font-sans text-xs text-[var(--status-blocked-ink)] mt-2">{couponError}</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
