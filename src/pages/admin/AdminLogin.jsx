import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Loader2, KeyRound, Smartphone, Lock } from 'lucide-react'
import {
  adminLogin, adminMfaSetup, adminMfaSubmit, adminChangePassword, currentAdmin,
} from '../../lib/adminApi.js'

// ── /admin/login — administrator sign-in (Control Centre Phase 1) ────────────
// Steps: credentials → (first login: TOTP enrolment) → TOTP code →
// (forced password change for bootstrap/reset passwords) → console.
// No token ever touches localStorage/sessionStorage: the access token lives in
// JS memory (adminApi module) and persistence is the HttpOnly refresh cookie.

const field =
  'w-full rounded-[6px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 ' +
  'font-sans text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]'
const label = 'block font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)] mb-1.5'
const button =
  'w-full rounded-[6px] bg-[var(--color-ink)] text-[var(--color-paper)] px-4 py-2.5 font-sans text-sm ' +
  'hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [step, setStep] = useState('credentials') // credentials | mfa-setup | mfa-code | change-password
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaToken, setMfaToken] = useState(null)
  const [mfaKind, setMfaKind] = useState('verify') // verify | confirm
  const [enrolment, setEnrolment] = useState(null) // { secret, otpauthUri }
  const [code, setCode] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [changeCode, setChangeCode] = useState('')

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const submitCredentials = (e) => {
    e.preventDefault()
    run(async () => {
      const r = await adminLogin(email.trim(), password)
      setMfaToken(r.mfaToken)
      if (r.mfaSetupRequired) {
        const s = await adminMfaSetup(r.mfaToken)
        setEnrolment(s)
        setMfaKind('confirm')
        setStep('mfa-setup')
      } else {
        setMfaKind('verify')
        setStep('mfa-code')
      }
    })
  }

  const submitCode = (e) => {
    e.preventDefault()
    run(async () => {
      const admin = await adminMfaSubmit(mfaKind, mfaToken, code.trim())
      if (admin.mustChangePassword) {
        setStep('change-password')
        return
      }
      navigate('/admin', { replace: true })
    })
  }

  const submitPasswordChange = (e) => {
    e.preventDefault()
    run(async () => {
      await adminChangePassword(password, nextPassword, changeCode.trim())
      navigate('/admin', { replace: true })
    })
  }

  return (
    <div className="min-h-screen bg-[var(--color-paper)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck size={20} className="text-[var(--color-accent)]" aria-hidden="true" />
          <div>
            <h1 className="font-display text-lg text-[var(--color-ink)]">Prism administration</h1>
            <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">
              Authorised operators only. Every action is audited.
            </p>
          </div>
        </div>

        <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-5">
          {step === 'credentials' && (
            <form onSubmit={submitCredentials}>
              <label className={label} htmlFor="admin-email">Email</label>
              <input id="admin-email" type="email" required autoComplete="username"
                className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
              <div className="mt-4">
                <label className={label} htmlFor="admin-password">Password</label>
                <input id="admin-password" type="password" required autoComplete="current-password"
                  className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button type="submit" disabled={busy} className={`${button} mt-5`}>
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <KeyRound size={15} aria-hidden="true" />}
                Continue
              </button>
            </form>
          )}

          {step === 'mfa-setup' && enrolment && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Smartphone size={15} className="text-[var(--color-accent)]" aria-hidden="true" />
                <h2 className="font-sans text-sm text-[var(--color-ink)]">Set up your authenticator</h2>
              </div>
              <p className="font-sans text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
                Multi-factor authentication is mandatory. Add this account to an authenticator app
                (enter the key manually or paste the URI), then confirm with a 6-digit code.
              </p>
              <div className="mt-3 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-paper)] p-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Secret key (shown once)</p>
                <p className="font-mono text-sm break-all text-[var(--color-ink)] select-all">{enrolment.secret}</p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">otpauth URI</p>
                <p className="font-mono text-[11px] break-all text-[var(--color-ink-muted)] select-all">{enrolment.otpauthUri}</p>
              </div>
              <form onSubmit={submitCode} className="mt-4">
                <label className={label} htmlFor="mfa-code">6-digit code</label>
                <input id="mfa-code" inputMode="numeric" pattern="\d{6}" maxLength={6} required
                  className={`${field} font-mono tracking-[0.3em] text-center`}
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                <button type="submit" disabled={busy || code.length !== 6} className={`${button} mt-4`}>
                  {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                  Confirm and sign in
                </button>
              </form>
            </div>
          )}

          {step === 'mfa-code' && (
            <form onSubmit={submitCode}>
              <div className="flex items-center gap-2 mb-3">
                <Smartphone size={15} className="text-[var(--color-accent)]" aria-hidden="true" />
                <h2 className="font-sans text-sm text-[var(--color-ink)]">Two-factor code</h2>
              </div>
              <label className={label} htmlFor="mfa-code2">6-digit code from your authenticator</label>
              <input id="mfa-code2" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoFocus
                className={`${field} font-mono tracking-[0.3em] text-center`}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <button type="submit" disabled={busy || code.length !== 6} className={`${button} mt-4`}>
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                Sign in
              </button>
            </form>
          )}

          {step === 'change-password' && (
            <form onSubmit={submitPasswordChange}>
              <div className="flex items-center gap-2 mb-3">
                <Lock size={15} className="text-[var(--color-accent)]" aria-hidden="true" />
                <h2 className="font-sans text-sm text-[var(--color-ink)]">Choose your own password</h2>
              </div>
              <p className="font-sans text-[13px] leading-relaxed text-[var(--color-ink-muted)] mb-3">
                You signed in with a temporary password ({currentAdmin()?.email}). Set a new one
                (12+ characters) to continue.
              </p>
              <label className={label} htmlFor="new-password">New password</label>
              <input id="new-password" type="password" required minLength={12} autoComplete="new-password"
                className={field} value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} />
              <div className="mt-3">
                <label className={label} htmlFor="change-code">Current 6-digit code</label>
                <input id="change-code" inputMode="numeric" pattern="\d{6}" maxLength={6} required
                  className={`${field} font-mono tracking-[0.3em] text-center`}
                  value={changeCode} onChange={(e) => setChangeCode(e.target.value.replace(/\D/g, ''))} />
              </div>
              <button type="submit" disabled={busy || nextPassword.length < 12 || changeCode.length !== 6} className={`${button} mt-4`}>
                {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
                Save and enter console
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-[6px] border border-[var(--color-danger)] bg-[var(--color-danger-surface)] px-3 py-2 font-sans text-[13px] text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>

        <p className="mt-4 font-mono text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
          Sessions expire after 12 hours. Repeated failures lock the account.
          The legacy read-only cockpit remains at /admin/legacy-ops.
        </p>
      </div>
    </div>
  )
}
