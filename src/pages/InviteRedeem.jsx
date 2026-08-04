import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2, Ticket } from 'lucide-react'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { getToken, isAuthenticated } from '../lib/session.js'

// ── /invite/:token — group assessment invite redemption ──────────────────────
// A candidate opens the link an administrator shared (college cohorts). If
// they are signed in, one seat is claimed (idempotent — revisiting returns the
// same session) and they continue into the assessment funnel. If not, we park
// the token in sessionStorage, send them to register/login, and Auth.jsx
// returns them here.

export default function InviteRedeem() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const authed = isAuthenticated()

  useEffect(() => {
    // Remember the invite across the register/login round-trip.
    if (token) sessionStorage.setItem('prismInviteToken', token)
  }, [token])

  const redeem = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/payment/invite/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not redeem this invite.')
      sessionStorage.removeItem('prismInviteToken')
      // Same funnel as a purchase: the server decides whether identity
      // verification applies.
      const cfg = await fetch('/api/payment/config').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      navigate(cfg.skipVerification ? `/briefing?session=${data.sessionId}` : `/verify-identity?session=${data.sessionId}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }, [token, navigate])

  return (
    <div className="min-h-screen bg-[var(--color-paper)] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8 text-center">
        <div className="flex justify-center"><PrismLogo size={40} /></div>
        <Ticket size={32} className="mx-auto mt-6 text-[var(--color-accent)]" />
        <h1 className="mt-4 text-2xl font-bold text-[var(--color-ink)]">Assessment invitation</h1>
        <p className="mt-2 text-[15px] text-[var(--color-ink-muted)] leading-relaxed">
          You have been invited to take a Prism assessment — a 30-minute working
          conversation, scored with evidence you can verify.
        </p>
        <p className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
          Prism is currently available to candidates aged 18 or older.
        </p>

        {error && (
          <p className="mt-4 text-[14px] text-[var(--color-danger)]">{error}</p>
        )}

        {authed ? (
          <button
            onClick={redeem}
            disabled={busy}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg font-bold text-[var(--color-ink)] bg-[var(--color-accent)] cursor-pointer hover:brightness-105 transition disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Claim my seat
          </button>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            <Link
              to="/register"
              className="w-full px-5 py-3 rounded-lg font-bold text-[var(--color-ink)] bg-[var(--color-accent)] no-underline hover:brightness-105 transition"
            >
              Create an account to continue
            </Link>
            <Link
              to="/login"
              className="w-full px-5 py-3 rounded-lg font-semibold text-[var(--color-ink)] border border-[var(--color-line)] no-underline hover:bg-[var(--color-paper)] transition"
            >
              I already have an account
            </Link>
          </div>
        )}

        <p className="mt-6 text-[12px] text-[var(--color-ink-muted)]">
          One seat per person. Your results belong to you.
        </p>
      </div>
    </div>
  )
}
