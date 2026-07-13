import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { adminFetch } from '../../lib/adminApi.js'
import { PageHeader, ErrorNotice, Toolbar, Pill, when } from './ui.jsx'

// ── /admin/psychometrics — scientific dashboards (Phase 3, read-only) ────────

function Gate({ label, gate }) {
  const pct = Math.min(100, Math.round((gate.current / Math.max(1, gate.target)) * 100))
  const reached = gate.current >= gate.target
  return (
    <div className="py-3 border-b border-[var(--color-line)] last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-sm text-[var(--color-ink)]">{label}</span>
        <span className="font-mono text-sm tabular-nums text-[var(--color-ink)]">
          {gate.current} <span className="text-[var(--color-ink-muted)]">/ {gate.target}</span>
        </span>
      </div>
      <div className="mt-2 h-[3px] bg-[var(--color-line)] rounded-full overflow-hidden" aria-hidden="true">
        <div className={reached ? 'h-full bg-[var(--color-success)]' : 'h-full bg-[var(--color-accent)]'} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function AdminPsychometrics() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      setData(await adminFetch('/api/admin/psychometrics'))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (!data && !error) {
    return (
      <div className="p-8 flex items-center gap-2 font-sans text-sm text-[var(--color-ink-muted)]">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading psychometrics…
      </div>
    )
  }

  const drift = data?.judgeDrift

  return (
    <div className="p-6 max-w-5xl">
      <PageHeader title="Psychometrics" subtitle="Read-only. Every number renders from the calibration registry and telemetry — nothing is hand-written." />
      <ErrorNotice error={error} />
      <Toolbar onRefresh={load} busy={busy} />

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Data gates</h2>
              <Gate label="Real assessment sessions" gate={data.gates.realSessions} />
              <Gate label="Double-rated sessions" gate={data.gates.doubleRatedSessions} />
              <Gate label="Test–retest pairs" gate={data.gates.testRetestPairs} />
              <Gate label="Qualified raters" gate={data.gates.qualifiedRaters} />
            </section>

            <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Reliability (G-study)</h2>
              {data.reliability ? (
                <dl className="font-sans text-sm text-[var(--color-ink)] space-y-1">
                  <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">G coefficient</dt><dd className="tabular-nums font-mono">{data.reliability.gCoefficient ?? '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">Person variance</dt><dd className="tabular-nums font-mono">{data.reliability.variance.person ?? '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">Scenario variance</dt><dd className="tabular-nums font-mono">{data.reliability.variance.scenario ?? '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">Residual</dt><dd className="tabular-nums font-mono">{data.reliability.variance.residual ?? '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">N persons</dt><dd className="tabular-nums font-mono">{data.reliability.nPersons ?? '—'}</dd></div>
                </dl>
              ) : (
                <p className="font-sans text-sm text-[var(--color-ink-muted)]">No reliability run yet — honest pending.</p>
              )}
              <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mt-4 mb-1">Judge model drift</h2>
              <p className={`font-sans text-sm ${drift?.status === 'anchored' ? 'text-[var(--color-ink)]' : 'text-[var(--color-danger)]'}`}>
                {drift ? (drift.status === 'anchored' ? `anchored (${drift.anchoredDeployment || 'n/a'})` : `${drift.status} — live ${drift.liveDeployment || '?'}`) : '—'}
              </p>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-3 mt-4">
            <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Item calibration</h2>
              <p className="font-display text-2xl text-[var(--color-ink)] tabular-nums">{data.itemCalibration.n}</p>
              <p className="font-mono text-[11px] text-[var(--color-ink-muted)]">calibrated items · {data.itemCalibration.misfit} misfit</p>
            </section>
            <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">DIF flags</h2>
              <p className="font-display text-2xl text-[var(--color-ink)] tabular-nums">{data.dif.nFlags}</p>
              <p className="font-mono text-[10px] text-[var(--color-ink-muted)] leading-relaxed">{data.dif.note}</p>
            </section>
            <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-1">Conformal / Channel B</h2>
              <p className="font-sans text-sm text-[var(--color-ink)]">
                {data.conformal ? `coverage set n=${data.conformal.n_pairs ?? '?'}` : 'conformal: pending'}
              </p>
              <p className="font-sans text-sm text-[var(--color-ink)]">
                {data.channelB ? `Channel B trained (${Object.keys(data.channelB).length} dims)` : 'Channel B: pending'}
              </p>
            </section>
          </div>

          <section className="mt-4 mb-10 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Latest run per type</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {Object.entries(data.runs).map(([type, run]) => (
                <div key={type} className="flex items-center gap-2 font-sans text-[13px]">
                  <span className="font-mono text-[12px] w-32 text-[var(--color-ink)]">{type}</span>
                  {run ? (
                    <>
                      <Pill tone={run.applied ? 'ok' : run.rejected ? 'danger' : run.frozen ? 'info' : 'muted'}>
                        {run.applied ? 'applied' : run.rejected ? 'rejected' : run.frozen ? 'frozen' : 'draft'}
                      </Pill>
                      <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">{when(run.createdAt)}</span>
                    </>
                  ) : (
                    <Pill tone="muted">no run</Pill>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[10px] text-[var(--color-ink-muted)]">
              Lifecycle actions (freeze / apply / reject) live under Psychometrics → Calibration runs.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
