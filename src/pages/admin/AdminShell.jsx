import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, LayoutDashboard, Users, ClipboardList, FlaskConical, Award,
  Settings2, ScrollText, LogOut, Loader2, TerminalSquare, AlertTriangle,
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
      { to: '/admin/admins', label: 'Administrators', icon: Users, permission: 'admins:read' },
      { label: 'Candidates', icon: Users, planned: 'Phase 2' },
      { label: 'Raters', icon: Users, planned: 'Phase 3' },
    ],
  },
  {
    group: 'Assessments',
    items: [
      { label: 'Sessions', icon: ClipboardList, planned: 'Phase 2' },
      { label: 'Reports', icon: ClipboardList, planned: 'Phase 2' },
      { label: 'Disputes', icon: ClipboardList, planned: 'Phase 2' },
    ],
  },
  {
    group: 'Psychometrics',
    items: [
      { label: 'Calibration runs', icon: FlaskConical, planned: 'Phase 3' },
      { label: 'Scenario & item bank', icon: FlaskConical, planned: 'Phase 3' },
      { label: 'Prompt registry', icon: FlaskConical, planned: 'Phase 3' },
    ],
  },
  {
    group: 'Credentials',
    items: [{ label: 'Issued credentials', icon: Award, planned: 'Phase 4' }],
  },
  {
    group: 'System',
    items: [
      { label: 'Feature flags', icon: Settings2, planned: 'Phase 5' },
      { label: 'Jobs & health', icon: Settings2, planned: 'Phase 5' },
    ],
  },
  {
    group: 'Governance',
    items: [
      { label: 'Audit logs', icon: ScrollText, planned: 'Phase 6' },
      { label: 'Privacy requests', icon: ScrollText, planned: 'Phase 6' },
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
      <div className="min-h-screen bg-[var(--color-paper)] flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[var(--color-ink-muted)]" aria-label="Loading" />
      </div>
    )
  }

  if (state === 'dark') {
    return (
      <div className="min-h-screen bg-[var(--color-paper)] flex items-center justify-center px-4">
        <div className="max-w-md rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-[var(--color-reliability-moderate)]" aria-hidden="true" />
            <h1 className="font-display text-lg text-[var(--color-ink)]">Admin console not enabled</h1>
          </div>
          <p className="font-sans text-sm leading-relaxed text-[var(--color-ink-muted)]">
            This deployment does not have <span className="font-mono text-[12px]">PRISM_ADMIN_CONSOLE=true</span> set.
            The read-only pilot cockpit remains available at{' '}
            <a href="/admin/legacy-ops" className="text-[var(--color-accent)] underline">/admin/legacy-ops</a>.
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
    <div className="min-h-screen bg-[var(--color-paper)] flex">
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-[var(--color-line)] bg-[var(--color-surface)] flex flex-col">
        <div className="px-4 py-4 border-b border-[var(--color-line)]">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-[var(--color-accent)]" aria-hidden="true" />
            <span className="font-display text-[15px] text-[var(--color-ink)]">Prism Control Centre</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] border ${
                environment === 'production'
                  ? 'text-[var(--color-danger)] border-[var(--color-danger)]'
                  : 'text-[var(--color-ink-muted)] border-[var(--color-line)]'
              }`}
            >
              {environment || 'unknown'}
            </span>
            {admin?.isBreakGlass && (
              <span className="inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] border text-[var(--color-danger)] border-[var(--color-danger)]">
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
                <p className="px-2 mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
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
                            ? 'bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-line)]'
                            : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                        }`
                      }
                    >
                      <item.icon size={14} aria-hidden="true" />
                      {item.label}
                    </NavLink>
                  ) : (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 font-sans text-[13px] text-[var(--color-ink-muted)] opacity-60 cursor-not-allowed"
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

        <div className="border-t border-[var(--color-line)] px-4 py-3">
          <p className="font-sans text-[13px] text-[var(--color-ink)] truncate">{admin?.name || admin?.email}</p>
          <p className="font-mono text-[10px] text-[var(--color-ink-muted)] truncate">
            {(admin?.roles || []).join(' · ') || 'no roles'}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 inline-flex items-center gap-1.5 font-sans text-[12px] text-[var(--color-ink-muted)] hover:text-[var(--color-danger)]"
          >
            <LogOut size={13} aria-hidden="true" /> Secure sign out
          </button>
        </div>
      </aside>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
