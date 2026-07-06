import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, RefreshCw, Activity, Flag, FileText, Search, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Users, Gauge,
} from 'lucide-react'

// ── Part F — the pilot cockpit ────────────────────────────────────────────────
// Dense, fast, utility-face forward; zero marketing polish. Every number on
// this page renders from the admin API (which renders from the database);
// nothing here is hand-written. Read-only by design: the admin plane's
// mutating endpoints (issue/revoke) stay CLI-only for now.
//
// F1  Gates dashboard (pilot data gates + projections + scenario accumulation)
// F1  Data-quality sentinels
// F10 Flag console — LAW 1's enforcement UI: every flag shows its registry
//     verdict; there is no enable button here at all, and NO-GO names the
//     missing precondition verbatim.
// F4  Rater roster summary (workbench lives at /rater)
// +   Weekly report (markdown, copy-out) and per-session incident lookup.

const TOKEN_KEY = 'prismAdminToken' // sessionStorage only — never persisted

function useAdminFetch(token) {
  return useCallback(
    async (path) => {
      const res = await fetch(path, { headers: { 'x-admin-token': token } })
      const type = res.headers.get('content-type') || ''
      const body = type.includes('markdown') || type.includes('text/plain')
        ? await res.text()
        : await res.json().catch(() => ({}))
      if (!res.ok && res.status !== 422) {
        throw new Error(typeof body === 'object' && body.error ? body.error : `Request failed (${res.status})`)
      }
      return body
    },
    [token],
  )
}

function Kicker({ children }) {
  return (
    <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--color-ink-muted)]">
      {children}
    </span>
  )
}

function GateRow({ label, current, target, projection }) {
  const reached = current >= target
  const pct = Math.min(100, Math.round((current / Math.max(1, target)) * 100))
  return (
    <div className="py-3 border-b border-[var(--color-line)] last:border-0">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="font-sans text-sm text-[var(--color-ink)]">{label}</span>
        <span className="font-mono text-sm tabular-nums text-[var(--color-ink)]">
          {current} <span className="text-[var(--color-ink-muted)]">/ {target}</span>
        </span>
      </div>
      <div className="mt-2 h-[3px] bg-[var(--color-line)] rounded-full overflow-hidden" aria-hidden="true">
        <div
          className={reached ? 'h-full bg-[var(--color-success)]' : 'h-full bg-[var(--color-accent)]'}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 font-mono text-[11px] text-[var(--color-ink-muted)]">
        {projection === 'reached'
          ? 'gate reached'
          : projection
            ? `projected ${projection}`
            : 'no current velocity — this will not clear on its own'}
      </p>
    </div>
  )
}

function VerdictPill({ verdict }) {
  const map = {
    GO: { cls: 'text-[var(--color-success)] border-[var(--color-success)]', Icon: CheckCircle2 },
    'NO-GO': { cls: 'text-[var(--color-danger)] border-[var(--color-danger)]', Icon: XCircle },
    ESCALATE: { cls: 'text-[var(--color-reliability-moderate)] border-[var(--color-reliability-moderate)]', Icon: AlertTriangle },
  }
  const m = map[verdict] || map.ESCALATE
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-full)] border font-mono text-[11px] ${m.cls}`}>
      <m.Icon size={11} aria-hidden="true" />
      {verdict}
    </span>
  )
}

function Card({ title, icon: Icon, children, action }) {
  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="flex items-center gap-2 font-sans text-sm font-semibold text-[var(--color-ink)]">
          {Icon && <Icon size={15} className="text-[var(--color-ink-muted)]" aria-hidden="true" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '')
  const [unlocked, setUnlocked] = useState(false)
  const [unlockError, setUnlockError] = useState('')
  const [input, setInput] = useState('')

  const [dashboard, setDashboard] = useState(null)
  const [sentinels, setSentinels] = useState(null)
  const [flags, setFlags] = useState(null)
  const [weekly, setWeekly] = useState('')
  const [incidentId, setIncidentId] = useState('')
  const [incident, setIncident] = useState(null)
  const [incidentError, setIncidentError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const adminFetch = useAdminFetch(token)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [d, s, f, w] = await Promise.all([
        adminFetch('/api/pilot/dashboard'),
        adminFetch('/api/pilot/sentinels'),
        adminFetch('/api/pilot/flip-check'),
        adminFetch('/api/pilot/report/weekly'),
      ])
      setDashboard(d)
      setSentinels(s)
      setFlags(f)
      setWeekly(typeof w === 'string' ? w : '')
    } catch (err) {
      setLoadError(err.message || 'Could not load the panel.')
    } finally {
      setLoading(false)
    }
  }, [adminFetch])

  // Re-validate a remembered token on mount.
  useEffect(() => {
    if (!token) return
    fetch('/api/pilot/dashboard', { headers: { 'x-admin-token': token } })
      .then((r) => {
        if (r.ok) setUnlocked(true)
        else sessionStorage.removeItem(TOKEN_KEY)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (unlocked) loadAll()
  }, [unlocked, loadAll])

  const handleUnlock = async (e) => {
    e.preventDefault()
    setUnlockError('')
    const candidate = input.trim()
    if (!candidate) return
    const res = await fetch('/api/pilot/dashboard', { headers: { 'x-admin-token': candidate } }).catch(() => null)
    if (res?.ok) {
      sessionStorage.setItem(TOKEN_KEY, candidate)
      setToken(candidate)
      setUnlocked(true)
    } else if (res?.status === 503) {
      setUnlockError('The admin plane is disabled on this deployment (ADMIN_TOKEN or database not configured).')
    } else {
      setUnlockError('That token was not accepted.')
    }
  }

  const lookupIncident = async (e) => {
    e.preventDefault()
    setIncident(null)
    setIncidentError('')
    if (!incidentId.trim()) return
    try {
      setIncident(await adminFetch(`/api/pilot/incident/${encodeURIComponent(incidentId.trim())}`))
    } catch (err) {
      setIncidentError(err.message || 'Lookup failed.')
    }
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[var(--color-paper)] flex items-center justify-center px-6">
        <form onSubmit={handleUnlock} className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-md)] p-6">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={16} className="text-[var(--color-ink-muted)]" aria-hidden="true" />
            <h1 className="font-sans text-sm font-semibold text-[var(--color-ink)]">Pilot instrument panel</h1>
          </div>
          <p className="font-sans text-xs text-[var(--color-ink-muted)] mb-4">
            Operator access. The token is checked against the server and kept for this tab only.
          </p>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Admin token"
            autoComplete="off"
            className="w-full px-3.5 py-2.5 rounded-[var(--radius-sm)] bg-[var(--color-paper)] border border-[var(--color-line)] font-mono text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            aria-label="Admin token"
          />
          {unlockError && <p className="mt-2 font-sans text-xs text-[var(--color-danger)]">{unlockError}</p>}
          <button
            type="submit"
            className="mt-4 w-full py-2.5 rounded-[var(--radius-sm)] bg-[var(--color-ink)] font-sans text-sm font-semibold text-[var(--color-paper)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            Unlock
          </button>
        </form>
      </div>
    )
  }

  const d = dashboard

  return (
    <div className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      <header className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-line)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-lg text-[var(--color-ink)]">Prism ops</h1>
            <Kicker>pilot cockpit · read-only</Kicker>
          </div>
          <div className="flex items-center gap-3">
            {d && <Kicker>as of {new Date(d.generatedAt).toLocaleTimeString()}</Kicker>}
            <button
              onClick={loadAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-line)] font-mono text-[11px] text-[var(--color-ink)] hover:border-[var(--color-accent)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid gap-4 md:grid-cols-2">
        {loadError && (
          <div className="md:col-span-2 p-4 rounded-[var(--radius-md)] bg-[var(--color-danger-surface)] border border-[var(--color-danger)]/40 font-sans text-sm text-[var(--color-danger)]">
            {loadError}
          </div>
        )}

        {/* F1 — data gates */}
        <Card title="Pilot data gates" icon={Gauge}>
          {!d ? (
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">Loading…</p>
          ) : (
            <>
              <GateRow label="Real completed sessions (IRT gate)" current={d.sessions.totalReal} target={d.sessions.target} projection={d.sessions.projectedGateDate} />
              <GateRow label="Double-rated sessions (S2 gate)" current={d.doubleRating.doubleRated} target={d.doubleRating.target} projection={d.doubleRating.projectedGateDate} />
              <GateRow label="Test–retest pairs (S3 gate)" current={d.testRetest.pairs} target={d.testRetest.target} projection={d.testRetest.projectedGateDate} />
              <GateRow label="Qualified raters" current={d.raters.qualified} target={d.raters.target} projection={d.raters.qualified >= d.raters.target ? 'reached' : null} />
              <p className="mt-3 font-mono text-[11px] text-[var(--color-ink-muted)]">
                synthetic sessions excluded from every gate ({d.sessions.totalSynthetic} on record) · S1 arms {JSON.stringify(d.steeringAb.armBalance)}
                {d.steeringAb.balanced ? ' (balanced)' : ' (IMBALANCED)'}
              </p>
            </>
          )}
        </Card>

        {/* F1 — sentinels */}
        <Card title="Data-quality sentinels" icon={Activity}>
          {!sentinels ? (
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">Loading…</p>
          ) : sentinels.ok ? (
            <div className="flex items-center gap-2 font-sans text-sm text-[var(--color-success)]">
              <CheckCircle2 size={15} aria-hidden="true" />
              All {sentinels.checks?.length ?? 7} checks clean.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {(sentinels.alerts || []).map((a) => (
                <li key={a.check} className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-warn-surface)] border border-[var(--color-reliability-moderate)]/40">
                  <p className="font-mono text-xs text-[var(--color-reliability-moderate)] uppercase tracking-[0.08em]">{a.check}</p>
                  <p className="mt-1 font-sans text-xs text-[var(--color-ink)]">
                    {a.issues.length} issue(s) — first: {a.issues[0]?.problem}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {sentinels && (
            <p className="mt-3 font-mono text-[11px] text-[var(--color-ink-muted)]">
              Sentinels flag and audit; they never delete or change data.
            </p>
          )}
        </Card>

        {/* F10 — flag console (the map as law) */}
        <Card title="Flag console — the study→flag→claim map as law" icon={Flag}>
          {!flags ? (
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">Loading…</p>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-[var(--color-line)]">
                {Object.entries(flags.flags || {}).map(([flag, r]) => (
                  <li key={flag} className="py-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono text-xs text-[var(--color-ink)]">{flag}</span>
                      <VerdictPill verdict={r.verdict} />
                    </div>
                    <p className="mt-1 font-sans text-xs text-[var(--color-ink-muted)] leading-relaxed">{r.reason}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[11px] text-[var(--color-ink-muted)]">
                There is no enable button on this page by design: a GO blesses a human flip
                (app-settings change, audited); a NO-GO names the missing precondition.
              </p>
            </>
          )}
        </Card>

        {/* F4 — rater roster summary */}
        <Card
          title="Raters"
          icon={Users}
          action={<a href="/rater" className="font-mono text-[11px] text-[var(--color-accent)] underline underline-offset-4">open workbench →</a>}
        >
          {!d ? (
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">Loading…</p>
          ) : d.raters.roster.length === 0 ? (
            <p className="font-sans text-sm text-[var(--color-ink-muted)]">
              No raters on the roster yet. Rater recruitment is the pilot's standing bottleneck —
              the workbench and training refs are live and waiting.
            </p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
                  <th className="py-1.5 font-normal">handle</th>
                  <th className="py-1.5 font-normal">status</th>
                  <th className="py-1.5 font-normal text-right">training κ</th>
                </tr>
              </thead>
              <tbody>
                {d.raters.roster.map((r) => (
                  <tr key={r.handle} className="border-t border-[var(--color-line)] font-sans text-sm">
                    <td className="py-2 font-mono text-xs">{r.handle}</td>
                    <td className="py-2">{r.status}</td>
                    <td className="py-2 text-right font-mono text-xs tabular-nums">
                      {r.trainingKappa === null ? '—' : r.trainingKappa.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d && (
            <p className="mt-3 font-mono text-[11px] text-[var(--color-ink-muted)]">
              qualification threshold κ ≥ {d.raters.irrThreshold}
            </p>
          )}
        </Card>

        {/* Incident lookup */}
        <Card title="Incident evidence file" icon={Search}>
          <form onSubmit={lookupIncident} className="flex gap-2">
            <input
              value={incidentId}
              onChange={(e) => setIncidentId(e.target.value)}
              placeholder="session id"
              className="flex-1 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-paper)] border border-[var(--color-line)] font-mono text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              aria-label="Session id"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-[var(--radius-sm)] bg-[var(--color-ink)] font-mono text-[11px] text-[var(--color-paper)] hover:opacity-90 transition-opacity cursor-pointer"
            >
              Assemble
            </button>
          </form>
          {incidentError && <p className="mt-2 font-sans text-xs text-[var(--color-danger)]">{incidentError}</p>}
          {incident && (
            <div className="mt-3">
              <p className="font-sans text-xs text-[var(--color-ink-muted)] mb-2">{incident.note}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[11px]">
                <dt className="text-[var(--color-ink-muted)]">integrity events</dt>
                <dd className="tabular-nums">{incident.integrityEvents?.length ?? 0}</dd>
                <dt className="text-[var(--color-ink-muted)]">scored turns</dt>
                <dd className="tabular-nums">{incident.turns?.length ?? 0}</dd>
                <dt className="text-[var(--color-ink-muted)]">judge votes</dt>
                <dd className="tabular-nums">{incident.judgeVotes?.length ?? 0}</dd>
                <dt className="text-[var(--color-ink-muted)]">overall</dt>
                <dd className="tabular-nums">{incident.report?.overall ?? '—'}</dd>
                <dt className="text-[var(--color-ink-muted)]">credential</dt>
                <dd>{incident.credential ? `${incident.credential.status}` : 'none'}</dd>
                <dt className="text-[var(--color-ink-muted)]">synthetic</dt>
                <dd>{String(incident.timeline?.is_synthetic ?? '—')}</dd>
              </dl>
              <details className="mt-2">
                <summary className="font-mono text-[11px] text-[var(--color-accent)] cursor-pointer">full JSON</summary>
                <pre className="mt-2 p-3 rounded-[var(--radius-sm)] bg-[var(--color-paper)] border border-[var(--color-line)] font-mono text-[10px] leading-relaxed overflow-x-auto max-h-72 overflow-y-auto">
                  {JSON.stringify(incident, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </Card>

        {/* Weekly report */}
        <Card
          title="Weekly report"
          icon={FileText}
          action={
            weekly && (
              <button
                onClick={(e) => {
                  navigator.clipboard.writeText(weekly)
                  const el = e.currentTarget
                  el.textContent = 'Copied'
                  setTimeout(() => { el.textContent = 'Copy markdown' }, 1500)
                }}
                className="font-mono text-[11px] text-[var(--color-accent)] underline underline-offset-4 cursor-pointer"
              >
                Copy markdown
              </button>
            )
          }
        >
          {!weekly ? (
            <p className="font-mono text-xs text-[var(--color-ink-muted)]">Loading…</p>
          ) : (
            <pre className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-paper)] border border-[var(--color-line)] font-mono text-[11px] leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
              {weekly}
            </pre>
          )}
        </Card>
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">
          Model drift: {d?.modelDrift?.status ?? '…'} ({d?.modelDrift?.liveDeployment ?? '…'}) ·
          every score-affecting decision writes an audit row · this panel changes nothing.
        </p>
      </footer>
    </div>
  )
}
