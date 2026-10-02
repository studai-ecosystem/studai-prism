import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { login, register, isAuthenticated } from '../lib/session.js'
import { AGE_DECLARATION_TEXT } from '../../server/lib/sharedConstants.js'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { Button, Input, Select, Checkbox, Callout, InlineNotice } from '../components/ui/index.js'
import { fetchOrgInvite } from '../api/campus.js'
import { ROLE_LABELS } from '../lib/copy/privacy.js'

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', 'Graduated', 'Working Professional'].map((y) => ({ value: y, label: y }))

// Only same-origin in-app paths are honoured (no open redirect).
function safeNext(search) {
  const raw = new URLSearchParams(search).get('next')
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}

// A campus invitation arrives here as /login?next=/app/campus-invite/<token>.
// The token is only ever used to ask the server who is inviting; it is never
// shown, logged or sent anywhere else.
function campusInviteToken(next) {
  const m = /^\/app\/campus-invite\/([^/?#]+)/.exec(next || '')
  return m ? decodeURIComponent(m[1]) : null
}

function InviteContext({ token }) {
  const [state, setState] = useState({ status: 'loading', invite: null })
  useEffect(() => {
    let live = true
    fetchOrgInvite(token)
      .then((invite) => { if (live) setState({ status: 'ready', invite }) })
      .catch(() => { if (live) setState({ status: 'unavailable', invite: null }) })
    return () => { live = false }
  }, [token])

  if (state.status !== 'ready') return null
  const { invite } = state
  const closed = invite.expired || invite.status !== 'PENDING'
  return (
    <Callout tone={closed ? 'partial' : 'info'} title={`${invite.organizationName} has invited you to Prism`} className="mb-6">
      {closed
        ? 'This invitation is no longer open. Ask your institution to send a new one.'
        : (
          <>
            You are invited as {ROLE_LABELS[invite.role] || invite.role}.
            {invite.emailHint ? ` Use the email address this was sent to (${invite.emailHint}).` : ' Use the email address this was sent to.'}
            {' '}The invitation joins your own Prism account, so if you already have one, sign in instead of creating another.
          </>
        )}
    </Callout>
  )
}

export default function Auth() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const isRegister = pathname !== '/login'
  const next = safeNext(search)
  const inviteToken = campusInviteToken(next)

  const [form, setForm] = useState({ name: '', email: '', college: '', year: '', password: '' })
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Reset error when switching tabs
  useEffect(() => setError(null), [pathname])

  // Already signed in? Continue instead of asking again. An in-flight
  // assessment invite wins over the paid flow: the candidate came to claim a seat.
  useEffect(() => {
    if (isAuthenticated()) {
      const invite = sessionStorage.getItem('prismInviteToken')
      navigate(invite ? `/invite/${invite}` : next || '/app', { replace: true })
    }
  }, [navigate, next])

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    setError(null)

    if (!form.email.trim() || !form.password.trim()) {
      setError('Email and password are required.')
      return
    }
    if (isRegister && (!form.name.trim() || !form.college.trim() || !form.year)) {
      setError('Please fill in all fields to register.')
      return
    }
    // Pilot rule: adult candidates only, confirmed explicitly. No date of birth is collected.
    if (isRegister && !ageConfirmed) {
      setError('Please confirm that you are 18 or older. Prism is currently available to adult candidates only.')
      return
    }

    setSubmitting(true)
    const action = isRegister
      ? register({
          name: form.name || form.email.split('@')[0],
          email: form.email,
          college: form.college,
          year: form.year,
          password: form.password,
          ageConfirmed,
        })
      : login({ email: form.email, password: form.password })

    action
      .then(() => {
        // An in-flight assessment invite returns the candidate to their seat;
        // otherwise continue to where they were going; a new account goes to checkout, a returning one to the app.
        const invite = sessionStorage.getItem('prismInviteToken')
        navigate(invite ? `/invite/${invite}` : next || (isRegister ? '/payment' : '/app'))
      })
      .catch((err) => setError(err.message || 'Something went wrong. Please try again.'))
      .finally(() => setSubmitting(false))
  }

  // The tabs keep ?next so switching never drops an invitation.
  const tab = (active) => `flex-1 rounded-[var(--prism-radius-md)] py-2 text-center text-sm font-semibold transition-colors ${
    active ? 'bg-prism-surface text-prism-ink shadow-sm' : 'text-prism-ink-muted hover:text-prism-ink'
  }`

  return (
    <div className="prism-app flex min-h-screen flex-col bg-prism-canvas text-prism-ink">
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <Link to="/" aria-label="Prism home"><PrismLogo variant="full" width={240} /></Link>
          </div>

          <div className="rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-surface p-6 shadow-sm md:p-8">
            {inviteToken && <InviteContext token={inviteToken} />}

            <h1 className="mb-1 text-2xl font-bold tracking-tight">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
            <p className="mb-6 text-sm text-prism-ink-muted">
              {isRegister ? 'Start your Prism assessment' : 'Sign in to continue'}
            </p>

            <div className="mb-6 flex rounded-[var(--prism-radius-lg)] border border-prism-border bg-prism-subtle p-1">
              <Link to={{ pathname: '/login', search }} aria-current={!isRegister ? 'page' : undefined} className={tab(!isRegister)}>Login</Link>
              <Link to={{ pathname: '/register', search }} aria-current={isRegister ? 'page' : undefined} className={tab(isRegister)}>Register</Link>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {isRegister && (
                <Input label="Full Name" value={form.name} onChange={update('name')} placeholder="Aditi Sharma" autoComplete="name" required />
              )}
              <Input label="Email" type="email" value={form.email} onChange={update('email')} placeholder="you@college.edu" autoComplete="email" required />
              {isRegister && (
                <>
                  <Input label="College" value={form.college} onChange={update('college')} placeholder="IIT Madras" autoComplete="organization" required />
                  <Select label="Year of Study" value={form.year} onChange={update('year')} options={YEARS} placeholder="Select year" required />
                </>
              )}
              <Input
                label="Password"
                type="password"
                value={form.password}
                onChange={update('password')}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
              />

              {isRegister && (
                <Checkbox
                  label={`${AGE_DECLARATION_TEXT} Prism is currently available to candidates aged 18 or older.`}
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                />
              )}

              {error && <div role="alert"><InlineNotice tone="blocked">{error}</InlineNotice></div>}

              <Button type="submit" size="lg" block loading={submitting} loadingLabel="Please wait...">
                {isRegister ? 'Create account' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-prism-ink-muted">
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <Link to={{ pathname: isRegister ? '/login' : '/register', search }} className="font-semibold text-brand-green-ink underline underline-offset-4">
                {isRegister ? 'Login' : 'Register'}
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-prism-ink-subtle">
            Your assessment conversation is processed for scoring only and is not shared with employers or
            third parties without your consent. <Link to="/privacy" className="underline underline-offset-4">Privacy</Link>
            {' '}&middot;{' '}<Link to="/terms" className="underline underline-offset-4">Terms</Link>
          </p>
        </div>
      </main>
    </div>
  )
}