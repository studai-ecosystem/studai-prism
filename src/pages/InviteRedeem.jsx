import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Ticket } from 'lucide-react'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { Button, LinkButton, InlineNotice } from '../components/ui/index.js'
import { getToken, isAuthenticated } from '../lib/session.js'

// /invite/:token: group assessment invite redemption. A candidate opens the
// link an administrator shared (college cohorts). Signed in: one seat is
// claimed (idempotent, revisiting returns the same session) and they continue
// into the assessment funnel. Not signed in: the token is parked in
// sessionStorage, they register or log in, and Auth returns them here.
// The same account is used throughout, so an invite never creates a second identity.

export default function InviteRedeem() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const authed = isAuthenticated()

  useEffect(() => {
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
      // Same funnel as a purchase: the server decides whether identity verification applies.
      const cfg = await fetch('/api/payment/config').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      navigate(cfg.skipVerification ? `/briefing?session=${data.sessionId}` : `/verify-identity?session=${data.sessionId}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }, [token, navigate])

  return (
    <div className="prism-app flex min-h-screen flex-col items-center justify-center bg-prism-canvas px-4 py-10 text-prism-ink">
      <main id="main" className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><PrismLogo variant="full" width={240} /></div>
        <div className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-6 text-center shadow-sm md:p-8">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-green-soft">
            <Ticket size={22} aria-hidden="true" className="text-brand-green-ink" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Assessment invitation</h1>
          <p className="mt-2 text-sm leading-relaxed text-prism-ink-muted">
            You have been invited to take a Prism assessment: a 30-minute working conversation, scored with
            evidence you can verify.
          </p>
          <p className="mt-2 text-xs text-prism-ink-subtle">Prism is currently available to candidates aged 18 or older.</p>

          {error && <div role="alert" className="mt-4 text-left"><InlineNotice tone="blocked">{error}</InlineNotice></div>}

          {authed ? (
            <Button className="mt-6" size="lg" block onClick={redeem} loading={busy} loadingLabel="Claiming your seat...">
              Claim my seat
            </Button>
          ) : (
            <div className="mt-6 flex flex-col gap-2">
              <LinkButton to="/register" variant="primary" size="lg" block>Create an account to continue</LinkButton>
              <LinkButton to="/login" variant="secondary" size="lg" block>I already have an account</LinkButton>
              <p className="mt-1 text-xs text-prism-ink-subtle">If you already have a Prism account, sign in rather than creating a second one.</p>
            </div>
          )}

          <p className="mt-6 text-xs text-prism-ink-subtle">One seat per person. Your results belong to you.</p>
        </div>
      </main>
    </div>
  )
}