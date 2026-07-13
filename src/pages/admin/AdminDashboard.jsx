import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Loader2, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { adminFetch } from '../../lib/adminApi.js'

// ── Command Centre (Phase 1) ─────────────────────────────────────────────────
// Metrics available today: telemetry DB + admin plane. Store-backed counters
// (reports, disputes, payments) join in Phase 2 with the entity explorers —
// the cards say so instead of faking zeros.

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">{label}</p>
      <p className="mt-1 font-display text-2xl text-[var(--color-ink)] tabular-nums">
        {value == null ? '—' : value}
      </p>
      {hint && <p className="mt-0.5 font-mono text-[10px] text-[var(--color-ink-muted)]">{hint}</p>}
    </div>
  )
}

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const [d, a] = await Promise.all([
        adminFetch('/api/admin/dashboard'),
        adminFetch('/api/admin/dashboard/alerts'),
      ])
      setData(d)
      setAlerts(a)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (!data && !error) {
    return (
      <div className="p-8 flex items-center gap-2 font-sans text-sm text-[var(--color-ink-muted)]">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading command centre…
      </div>
    )
  }

  const m = data?.metrics
  const sentinelAlerts = alerts?.sentinels || []
  const drift = alerts?.modelDrift

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-xl text-[var(--color-ink)]">Command Centre</h1>
          <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">
            Every number renders from the database. Nothing is hand-written.
          </p>
        </div>
        <button
          type="button" onClick={load} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--color-line)] px-3 py-1.5 font-sans text-[13px] text-[var(--color-ink)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-[6px] border border-[var(--color-danger)] bg-[var(--color-danger-surface)] px-3 py-2 font-sans text-[13px] text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {m && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Registered users" value={m.totalUsers} />
            <Metric label="Real assessments" value={m.assessments?.real} hint={`${m.assessments?.synthetic ?? 0} synthetic excluded`} />
            <Metric label="Completed, last 7 days" value={m.assessments?.last7Days} />
            <Metric label="Active credentials" value={m.credentials?.active} hint={`${m.credentials?.revoked ?? 0} revoked`} />
            <Metric label="Active studies" value={m.studiesActive} />
            <Metric label="Qualified raters" value={m.ratersQualified} />
            <Metric label="Double-rated sessions" value={m.doubleRatedSessions} />
            <Metric label="Active administrators" value={m.adminsActive} />
          </div>
          <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)]">
            Reports, disputes and payment counters arrive with the Phase 2 entity explorers.
          </p>
        </>
      )}

      {/* ── Pending actions ────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="font-display text-base text-[var(--color-ink)] mb-2">Pending actions</h2>
        <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 font-sans text-sm text-[var(--color-ink)]">
          <p className="tabular-nums">
            {data?.pending?.approvals ?? 0} approval request{(data?.pending?.approvals ?? 0) === 1 ? '' : 's'} awaiting a second administrator
          </p>
          {(data?.pending?.breakGlassIncidents ?? 0) > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-[var(--color-danger)]">
              <ShieldAlert size={14} aria-hidden="true" />
              {data.pending.breakGlassIncidents} open break-glass incident{data.pending.breakGlassIncidents === 1 ? '' : 's'} — review required
            </p>
          )}
        </div>
      </section>

      {/* ── Alerts ─────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="font-display text-base text-[var(--color-ink)] mb-2">Current alerts</h2>
        <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] divide-y divide-[var(--color-line)]">
          <div className="p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Data-quality sentinels</p>
            {sentinelAlerts.length === 0 ? (
              <p className="flex items-center gap-1.5 font-sans text-sm text-[var(--color-success)]">
                <CheckCircle2 size={14} aria-hidden="true" /> All checks clean
              </p>
            ) : (
              sentinelAlerts.map((a) => (
                <p key={a.check} className="flex items-center gap-1.5 font-sans text-sm text-[var(--color-danger)]">
                  <AlertTriangle size={14} aria-hidden="true" /> {a.check}: {a.issues?.length ?? 0} issue{(a.issues?.length ?? 0) === 1 ? '' : 's'}
                </p>
              ))
            )}
          </div>
          <div className="p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Judge model drift</p>
            <p className={`font-sans text-sm ${drift && drift.status !== 'anchored' ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink)]'}`}>
              {drift
                ? drift.status === 'anchored'
                  ? `anchored (${drift.anchoredDeployment || 'n/a'})`
                  : `${drift.status} — live ${drift.liveDeployment || '?'}, anchored ${drift.anchoredDeployment || '?'}`
                : '—'}
            </p>
          </div>
          <div className="p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Admin-plane security (24h)</p>
            <p className="font-sans text-sm text-[var(--color-ink)] tabular-nums">
              {alerts?.security?.failedAdminLogins24h ?? 0} failed sign-in attempts · {alerts?.security?.lockedAdminAccounts ?? 0} locked accounts
            </p>
          </div>
        </div>
      </section>

      {/* ── Recent admin activity ──────────────────────────────────────── */}
      <section className="mt-8 mb-10">
        <h2 className="font-display text-base text-[var(--color-ink)] mb-2">Recent administrator activity</h2>
        <div className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] overflow-hidden">
          {(data?.recentAdminActivity || []).length === 0 ? (
            <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">No admin activity recorded yet.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--color-line)]">
                  <th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">When</th>
                  <th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Administrator</th>
                  <th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Action</th>
                  <th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Entity</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAdminActivity.map((e, i) => (
                  <tr key={i} className="border-b border-[var(--color-line)] last:border-0">
                    <td className="px-4 py-2 font-mono text-[11px] text-[var(--color-ink-muted)] whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-sans text-[13px] text-[var(--color-ink)]">{e.admin_email || 'system'}</td>
                    <td className="px-4 py-2 font-mono text-[12px] text-[var(--color-ink)]">{e.action}</td>
                    <td className="px-4 py-2 font-mono text-[11px] text-[var(--color-ink-muted)]">
                      {e.entity_type ? `${e.entity_type} ${String(e.entity_id || '').slice(0, 8)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
