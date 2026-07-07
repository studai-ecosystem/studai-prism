import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Play, LogOut, Loader2, RotateCcw, BadgeCheck, CreditCard } from 'lucide-react'
import PrismLogo from '../components/ui/PrismLogo.jsx'
import { isAuthenticated, getUser, getToken, clearUser } from '../lib/session.js'

// ── The app launcher ─────────────────────────────────────────────────────────
// What the desktop shell (and installed PWA) opens into: not the marketing
// site, but the exam instrument's own front door. Sign in → licence check →
// start (or resume). The licence itself is bought through the same funnel the
// website uses — the website sells, the app examines.
//
// Reached at /app. In a normal browser tab this page still works (it is just
// a state-aware start screen), but the shell and PWA land here directly.

export default function ShellHome() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(() => isAuthenticated())
  const [licence, setLicence] = useState(null) // null=loading | {…} | 'error'
  const user = getUser()

  const loadLicence = useCallback(() => {
    if (!isAuthenticated()) return
    setLicence(null)
    fetch('/api/payment/licence', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setLicence)
      .catch(() => setLicence('error'))
  }, [])

  useEffect(() => {
    loadLicence()
  }, [authed, loadLicence])

  const handleSignOut = () => {
    clearUser()
    setAuthed(false)
    setLicence(null)
  }

  const pending = licence && licence !== 'error' ? licence.pendingSessionId : null

  return (
    <div className="room-dark min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] flex flex-col">
      <header className="shrink-0 flex items-center justify-between px-6 py-4">
        <PrismLogo size={28} subtitle={null} wordmarkColor="var(--color-ink)" />
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)]">
          Assessment app
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md flex flex-col gap-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-accent-bright)]/10 mb-4">
              <ShieldCheck size={22} className="text-[var(--color-accent-bright)]" aria-hidden="true" />
            </div>
            <h1 className="font-serif text-3xl mb-2">Prism Assessment</h1>
            <p className="font-sans text-sm text-[var(--color-ink-muted)]">
              One 30-minute conversation · five dimensions · a verified result
            </p>
          </div>

          {!authed ? (
            <div className="bg-[var(--color-room-surface)] border border-[var(--color-room-line)] rounded-[var(--radius-lg)] p-6 text-center">
              <p className="font-sans text-sm text-[var(--color-ink)] mb-4">
                Sign in with your Prism account to check your licence and begin.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3.5 rounded-[var(--radius-md)] bg-[var(--color-room-ink)] font-sans font-semibold text-sm text-[var(--color-room)] hover:opacity-90 transition-opacity cursor-pointer"
              >
                Sign in
              </button>
              <p className="mt-3 font-sans text-xs text-[var(--color-ink-muted)]">
                No account? You can create one and get your licence on the website —
                this app then runs the assessment.
              </p>
            </div>
          ) : (
            <div className="bg-[var(--color-room-surface)] border border-[var(--color-room-line)] rounded-[var(--radius-lg)] p-6">
              {/* Licence status — server facts, never invented */}
              {licence === null ? (
                <div className="flex items-center gap-2 font-mono text-xs text-[var(--color-ink-muted)]" role="status">
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  Checking your licence…
                </div>
              ) : licence === 'error' ? (
                <p className="font-sans text-sm text-[var(--color-danger)]">
                  Could not reach the licence service. Check the connection and try again.
                </p>
              ) : (
                <>
                  <div className="flex items-start gap-3 pb-4 border-b border-[var(--color-room-line)]">
                    <BadgeCheck size={18} className="text-[var(--color-accent-bright)] shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-sans text-sm font-semibold text-[var(--color-ink)]">
                        {pending
                          ? 'Licence active — an assessment is waiting'
                          : licence.canPurchase
                            ? 'Ready — start when you are'
                            : 'No licence available'}
                      </p>
                      <p className="font-mono text-[11px] text-[var(--color-ink-muted)] mt-1 truncate">
                        {user?.email || licence.email}
                        {licence.completed > 0 && ` · ${licence.completed} completed`}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col gap-2.5">
                    {pending ? (
                      <button
                        onClick={() => navigate(`/briefing?session=${pending}`)}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[var(--radius-md)] bg-[var(--color-room-ink)] font-sans font-semibold text-sm text-[var(--color-room)] hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <RotateCcw size={15} aria-hidden="true" />
                        Resume your assessment
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate('/payment')}
                        disabled={!licence.canPurchase}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[var(--radius-md)] bg-[var(--color-room-ink)] font-sans font-semibold text-sm text-[var(--color-room)] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Play size={15} aria-hidden="true" />
                        Start an assessment
                      </button>
                    )}
                    {!pending && (
                      <p className="flex items-center justify-center gap-1.5 font-mono text-[11px] text-[var(--color-ink-muted)]">
                        <CreditCard size={11} aria-hidden="true" />
                        {licence.mode === 'dummy'
                          ? 'Trial period — no charge at checkout.'
                          : 'Your licence is confirmed at checkout before the room opens.'}
                      </p>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-room-line)] font-sans text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors cursor-pointer"
                    >
                      <LogOut size={13} aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="shrink-0 px-6 py-4 text-center">
        <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">
          Prism exam window · the website at prism.studai.one manages accounts, licences and reports
        </p>
      </footer>
    </div>
  )
}
