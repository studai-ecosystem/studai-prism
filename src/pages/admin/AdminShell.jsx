import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, LayoutDashboard, Users, ClipboardList, FlaskConical, Award,
  Settings2, ScrollText, LogOut, Loader2, TerminalSquare, AlertTriangle, Search,
} from 'lucide-react'
import { bootstrapAdminSession, currentAdmin, adminLogout, adminHasPermission, adminFetch } from '../../lib/adminApi.js'

// ── /admin — persistent administrative shell (Control Centre Phase 1) ────────
// Sidebar reflects the full information architecture; sections beyond Phase 1
// are visibly planned-but-disabled (honest UI: no dead buttons that pretend).
// Session resume happens via the HttpOnly refresh cookie; unauthenticated
// visitors are sent to /admin/login.

const NAV = [
  {
    group: 'Overview',
    items: [{ to: '/admin', label: 'Command Centre', icon: LayoutDashboard, end: true }],
  },
  {
    group: 'People',
    items: [
      { to: '/admin/candidates', label: 'Candidates', icon: Users, permission: 'users:read' },
      { to: '/admin/admins', label: 'Administrators', icon: Users, permission: 'admins:read' },
      { to: '/admin/raters', label: 'Raters', icon: Users, permission: 'raters:read' },
    ],
  },
  {
    group: 'Assessments',
    items: [
      { to: '/admin/sessions', label: 'Sessions', icon: ClipboardList, permission: 'sessions:read' },
      { to: '/admin/reports', label: 'Reports', icon: ClipboardList, permission: 'reports:read' },
      { to: '/admin/disputes', label: 'Disputes', icon: ClipboardList, permission: 'disputes:read' },
      { to: '/admin/consents', label: 'Consent', icon: ClipboardList, permission: 'consents:read' },
      { to: '/admin/verifications', label: 'Verification', icon: ClipboardList, permission: 'verifications:read' },
      { to: '/admin/integrity', label: 'Proctoring events', icon: ClipboardList, permission: 'integrity:read' },
    ],
  },
  {
    group: 'Commerce',
    items: [
      { to: '/admin/payments', label: 'Payments', icon: ClipboardList, permission: 'payments:read' },
      { to: '/admin/organizations', label: 'Campus organizations', icon: Users, permission: 'organizations:read' },
      { to: '/admin/invites', label: 'Group invites', icon: ClipboardList, permission: 'invites:read' },
      { to: '/admin/margin', label: 'Contribution margin', icon: ClipboardList, permission: 'margin:read' },
    ],
  },
  {
    group: 'Psychometrics',
    items: [
      { to: '/admin/psychometrics', label: 'Dashboards', icon: FlaskConical, permission: 'psychometrics:read' },
      { to: '/admin/calibrations', label: 'Calibration runs', icon: FlaskConical, permission: 'calibrations:read' },
      { to: '/admin/bank', label: 'Scenario & item bank', icon: FlaskConical, permission: 'scenarios:read' },
      { to: '/admin/prompts', label: 'Prompt registry', icon: FlaskConical, permission: 'prompts:read' },
    ],
  },
  {
    group: 'Research',
    items: [
      { to: '/admin/studies', label: 'Studies', icon: FlaskConical, permission: 'studies:read' },
      { to: '/admin/exports', label: 'Research exports', icon: FlaskConical, permission: 'exports:create' },
    ],
  },
  {
    group: 'Credentials',
    items: [{ to: '/admin/credentials', label: 'Issued credentials', icon: Award, permission: 'credentials:read' }],
  },
  {
    group: 'Team simulation',
    items: [
      { to: '/admin/teamfit', label: 'Teams & sessions', icon: Users, permission: 'teamfit:read' },
      { to: '/admin/replays', label: 'Practice replays', icon: ClipboardList, permission: 'replays:read' },
    ],
  },
  {
    group: 'Content',
    items: [
      { to: '/admin/content', label: 'Blog · Careers · Applications', icon: ScrollText, permission: 'content:read' },
    ],
  },
  {
    group: 'System',
    items: [
      { to: '/admin/flags', label: 'Feature flags', icon: Settings2, permission: 'flags:read' },
      { to: '/admin/system', label: 'Health · Models · Jobs', icon: Settings2, permission: 'system:read' },
    ],
  },
  {
    group: 'Governance',
    items: [
      { to: '/admin/audit', label: 'Audit trail', icon: ScrollText, permission: 'audit:read' },
      { to: '/admin/privacy', label: 'Privacy requests', icon: ScrollText, permission: 'privacy:read' },
      { to: '/admin/legacy-ops', label: 'Legacy cockpit', icon: TerminalSquare },
    ],
  },
]

export default function AdminShell() {
  const navigate = useNavigate()
  const [state, setState] = useState('loading') // loading | ready | dark
  const [environment, setEnvironment] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const admin = await bootstrapAdminSession().catch(() => null)
      if (cancelled) return
      if (!admin) {
        // Distinguish "console dark" (flag off → refresh 404s) from "not signed in".
        const probe = await fetch('/api/admin/auth/refresh', { method: 'POST' }).catch(() => null)
        if (probe && probe.status === 404) setState('dark')
        else navigate('/admin/login', { replace: true })
        return
      }
      if (admin.mustChangePassword) {
        navigate('/admin/login', { replace: true })
        return
      }
      const me = await adminFetch('/api/admin/auth/me').catch(() => null)
      setEnvironment(me?.environment || null)
      setState('ready')
    })()
    return () => { cancelled = true }
  }, [navigate])

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-prism-canvas flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-prism-ink-muted" aria-label="Loading" />
      </div>
    )
  }

  if (state === 'dark') {
    return (
      <div className="min-h-screen bg-prism-canvas flex items-center justify-center px-4">
        <div className="max-w-md rounded-[10px] border border-prism-border bg-prism-surface p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-prism-partial" aria-hidden="true" />
            <h1 className="font-display text-lg text-prism-ink">Admin console not enabled</h1>
          </div>
          <p className="font-sans text-sm leading-relaxed text-prism-ink-muted">
            This deployment does not have <span className="font-mono text-[12px]">PRISM_ADMIN_CONSOLE=true</span> set.
            The read-only pilot cockpit remains available at{' '}
            <a href="/admin/legacy-ops" className="text-brand-green-ink underline">/admin/legacy-ops</a>.
          </p>
        </div>
      </div>
    )
  }

  const admin = currentAdmin()

  const signOut = async () => {
    await adminLogout().catch(() => {})
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-prism-canvas flex">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-prism-border bg-prism-surface flex flex-col">
        <div className="px-4 py-4 border-b border-prism-border">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-brand-green-ink" aria-hidden="true" />
            <span className="font-display text-[15px] text-prism-ink">Prism Control Centre</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] border ${
                environment === 'production'
                  ? 'text-prism-blocked border-prism-blocked'
                  : 'text-prism-ink-muted border-prism-border'
              }`}
            >
              {environment || 'unknown'}
            </span>
            {admin?.isBreakGlass && (
              <span className="inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] border text-prism-blocked border-prism-blocked">
                break-glass
              </span>
            )}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Administration">
          {NAV.map(({ group, items }) => {
            const visible = items.filter((it) => !it.permission || adminHasPermission(it.permission))
            if (!visible.length) return null
            return (
              <div key={group} className="mb-4">
                <p className="px-2 mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-prism-ink-muted">
                  {group}
                </p>
                {visible.map((item) =>
                  item.to ? (
                    <NavLink
                      key={item.label}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-[6px] px-2 py-1.5 font-sans text-[13px] ${
                          isActive
                            ? 'bg-prism-canvas text-prism-ink border border-prism-border'
                            : 'text-prism-ink-muted hover:text-prism-ink'
                        }`
                      }
                    >
                      <item.icon size={14} aria-hidden="true" />
                      {item.label}
                    </NavLink>
                  ) : (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 font-sans text-[13px] text-prism-ink-muted opacity-60 cursor-not-allowed"
                      title={`Planned — ${item.planned}`}
                    >
                      <span className="flex items-center gap-2">
                        <item.icon size={14} aria-hidden="true" />
                        {item.label}
                      </span>
                      <span className="font-mono text-[9px] uppercase">{item.planned}</span>
                    </div>
                  ),
                )}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-prism-border px-4 py-3">
          <p className="font-sans text-[13px] text-prism-ink truncate">{admin?.name || admin?.email}</p>
          <p className="font-mono text-[10px] text-prism-ink-muted truncate">
            {(admin?.roles || []).join(' · ') || 'no roles'}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 inline-flex items-center gap-1.5 font-sans text-[12px] text-prism-ink-muted hover:text-prism-blocked"
          >
            <LogOut size={13} aria-hidden="true" /> Secure sign out
          </button>
        </div>
      </aside>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <GlobalSearch />
        <Outlet />
      </main>
    </div>
  )
}

// ── Global search — one query across every entity the role may see ──────────
function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setResults(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const search = async (e) => {
    e.preventDefault()
    if (q.trim().length < 3) { setError('Type at least 3 characters.'); return }
    setBusy(true)
    setError('')
    try {
      const r = await adminFetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`)
      setResults(r.results)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const go = (path) => { setResults(null); setQ(''); navigate(path) }

  return (
    <div className="border-b border-prism-border bg-prism-surface px-6 py-2 relative" ref={boxRef}>
      <form onSubmit={search} className="flex items-center gap-2 max-w-xl">
        <Search size={14} className="text-prism-ink-muted" aria-hidden="true" />
        <input
          aria-label="Global search"
          placeholder="Search candidates, sessions, payments, credentials, disputes…"
          className="flex-1 bg-transparent font-sans text-[13px] text-prism-ink outline-none placeholder:text-prism-ink-muted"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {busy && <Loader2 size={13} className="animate-spin text-prism-ink-muted" aria-hidden="true" />}
      </form>
      {error && <p className="mt-1 font-mono text-[10px] text-prism-blocked">{error}</p>}
      {results && (
        <div className="absolute left-6 right-6 top-full z-20 mt-1 max-w-xl rounded-[10px] border border-prism-border bg-prism-surface shadow-lg p-2 max-h-96 overflow-y-auto">
          {Object.entries(results).every(([, v]) => !v?.length) && (
            <p className="p-2 font-sans text-[13px] text-prism-ink-muted">No results you have permission to see.</p>
          )}
          {(results.users || []).map((u) => (
            <button key={u.id} type="button" onClick={() => go(`/admin/candidates/${u.id}`)}
              className="w-full text-left p-2 rounded-[6px] hover:bg-prism-canvas font-sans text-[13px] text-prism-ink">
              <span className="font-mono text-[10px] uppercase text-prism-ink-muted mr-2">candidate</span>
              {u.name || u.email} <span className="font-mono text-[11px] text-prism-ink-muted">{u.email}</span>
            </button>
          ))}
          {(results.sessions || []).map((s) => (
            <button key={s.sessionId} type="button" onClick={() => go(`/admin/sessions/${s.sessionId}`)}
              className="w-full text-left p-2 rounded-[6px] hover:bg-prism-canvas font-sans text-[13px] text-prism-ink">
              <span className="font-mono text-[10px] uppercase text-prism-ink-muted mr-2">session</span>
              <span className="font-mono text-[12px]">{s.sessionId.slice(0, 18)}…</span> {s.scenarioId || ''}
            </button>
          ))}
          {(results.payments || []).map((p) => (
            <button key={p.sessionId} type="button" onClick={() => go('/admin/payments')}
              className="w-full text-left p-2 rounded-[6px] hover:bg-prism-canvas font-sans text-[13px] text-prism-ink">
              <span className="font-mono text-[10px] uppercase text-prism-ink-muted mr-2">payment</span>
              <span className="font-mono text-[12px]">{p.paymentId || p.sessionId}</span> · {p.mode}
            </button>
          ))}
          {(results.disputes || []).map((d) => (
            <button key={d.sessionId} type="button" onClick={() => go(`/admin/disputes/${d.sessionId}`)}
              className="w-full text-left p-2 rounded-[6px] hover:bg-prism-canvas font-sans text-[13px] text-prism-ink">
              <span className="font-mono text-[10px] uppercase text-prism-ink-muted mr-2">dispute</span>
              <span className="font-mono text-[12px]">{d.sessionId.slice(0, 18)}…</span> · {d.status}
            </button>
          ))}
          {(results.credentials || []).map((c) => (
            <div key={c.credential_id} className="p-2 font-sans text-[13px] text-prism-ink">
              <span className="font-mono text-[10px] uppercase text-prism-ink-muted mr-2">credential</span>
              <span className="font-mono text-[12px]">{String(c.credential_id).slice(0, 18)}…</span> · {c.status}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
