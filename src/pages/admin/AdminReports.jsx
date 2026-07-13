import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import {
  useAdminList, PageHeader, ErrorNotice, Notice, Toolbar, SearchBox, DataTable, Pager,
  Pill, btn, field, when, mono, actWithReason,
} from './ui.jsx'

// ── /admin/reports — report administration (Phase 2) ─────────────────────────

export function AdminReports() {
  const navigate = useNavigate()
  const { data, error, busy, params, setFilter, setPage, reload } = useAdminList('/api/admin/reports')

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Reports"
        subtitle="Every issued version is retained forever. Corrections are dual-approved supersessions — no report is ever silently overwritten."
      />
      <ErrorNotice error={error} />
      <Toolbar onRefresh={reload} busy={busy}>
        <SearchBox value={params.q} onChange={(q) => setFilter({ q })} placeholder="Session id…" />
      </Toolbar>
      <DataTable
        busy={busy}
        rowKey={(r) => r.sessionId}
        onRowClick={(r) => navigate(`/admin/reports/${r.sessionId}`)}
        columns={[
          { key: 'sessionId', label: 'Session', render: (r) => `${mono(r.sessionId, 13)}…`, className: 'font-mono text-[12px]' },
          { key: 'overall', label: 'Overall', className: 'tabular-nums font-display' },
          { key: 'reliability', label: 'Reliability' },
          { key: 'scenario', label: 'Scenario' },
          { key: 'language', label: 'Lang', className: 'font-mono text-[11px]' },
          {
            key: 'flags', label: 'State',
            render: (r) => (
              <span className="flex gap-1">{r.flaggedForReview && <Pill tone="warn">flagged</Pill>}</span>
            ),
          },
          { key: 'issuedAt', label: 'Issued', render: (r) => when(r.issuedAt), className: 'whitespace-nowrap font-mono text-[11px]' },
        ]}
        rows={data?.rows}
        empty="No reports."
      />
      <Pager data={data} onPage={setPage} />
    </div>
  )
}

// ── /admin/reports/:sessionId — report record page ───────────────────────────

export function AdminReportDetail() {
  const { sessionId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const [draftScores, setDraftScores] = useState({})
  const [reason, setReason] = useState('')

  const canResend = adminHasPermission('reports:resend')
  const canHold = adminHasPermission('reports:hold')
  const canSupersede = adminHasPermission('reports:supersede')

  const load = useCallback(async () => {
    setError('')
    try {
      const d = await adminFetch(`/api/admin/reports/${sessionId}`)
      setData(d)
      const dims = Object.fromEntries(
        Object.entries(d.report.scores || {}).filter(([k]) => k !== 'overall'),
      )
      setDraftScores(dims)
    } catch (err) {
      setError(err.message)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  if (!data && !error) {
    return (
      <div className="p-8 flex items-center gap-2 font-sans text-sm text-[var(--color-ink-muted)]">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading report…
      </div>
    )
  }
  if (error && !data) return <div className="p-6"><ErrorNotice error={error} /></div>

  const { report, versions, delivery, mailEnabled } = data

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (okMsg) setNotice(okMsg)
      await load()
    } catch (err) { setError(err.message) }
  }

  const submitCorrection = () =>
    run(async () => {
      if (!reason || reason.trim().length < 10) throw new Error('A specific reason (>= 10 characters) is required.')
      return adminFetch(`/api/admin/reports/${sessionId}/supersede`, {
        method: 'POST',
        body: { scores: Object.fromEntries(Object.entries(draftScores).map(([k, v]) => [k, Number(v)])), reason: reason.trim() },
      })
    }, 'Report superseded — new version recorded.').then(() => setCorrecting(false))

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader title={`Report ${sessionId.slice(0, 13)}…`} subtitle={`issued ${when(report.issuedAt)}`}>
        {delivery.deliveryHold && <Pill tone="warn">delivery hold</Pill>}
        {report.correction && <Pill tone="warn">corrected v{report.correction.version}</Pill>}
        {report.flaggedForReview && <Pill tone="warn">flagged for review</Pill>}
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Scores</h2>
          <p className="font-display text-3xl text-[var(--color-ink)] tabular-nums">{report.scores?.overall ?? '—'}</p>
          <dl className="mt-2 font-sans text-[13px] text-[var(--color-ink)] space-y-0.5">
            {Object.entries(report.scores || {}).filter(([k]) => k !== 'overall').map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt className="text-[var(--color-ink-muted)]">{k}</dt><dd className="tabular-nums">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-muted)]">
            reliability {report.reliability?.level || '—'} · percentile {report.percentile ?? 'n/a'}
          </p>
          {report.correction && (
            <p className="mt-1 font-mono text-[11px] text-[var(--color-reliability-moderate)]">
              corrected {when(report.correction.correctedAt)} — was {report.correction.previousOverall}. “{report.correction.reason}”
            </p>
          )}
        </section>

        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Delivery & lifecycle</h2>
          <div className="flex flex-wrap gap-2">
            {canResend && (
              <button type="button" className={btn} disabled={!mailEnabled || delivery.deliveryHold}
                title={!mailEnabled ? 'Email is not configured on this deployment' : delivery.deliveryHold ? 'Release the delivery hold first' : ''}
                onClick={() => run(() => actWithReason(`/api/admin/reports/${sessionId}/resend`, {}, 'Reason for resend (audited):'), 'Report link emailed to the account address on record.')}>
                Resend to account email
              </button>
            )}
            {canHold && !delivery.deliveryHold && (
              <button type="button" className={btn}
                onClick={() => run(() => actWithReason(`/api/admin/reports/${sessionId}/hold`, {}, 'Reason for delivery hold (audited):'), 'Delivery hold placed.')}>
                Hold delivery
              </button>
            )}
            {canHold && delivery.deliveryHold && (
              <button type="button" className={btn}
                onClick={() => run(() => actWithReason(`/api/admin/reports/${sessionId}/release`, {}, 'Reason for release (audited):'), 'Delivery hold released.')}>
                Release hold
              </button>
            )}
            {canSupersede && (
              <button type="button" className={btn} onClick={() => setCorrecting((v) => !v)}>
                {correcting ? 'Cancel correction' : 'Reviewed score correction…'}
              </button>
            )}
          </div>
          {!mailEnabled && <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)]">Resend disabled: SMTP is not configured.</p>}
          <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)] leading-relaxed">
            Supersession requires an approval row (action “supersede_report”, this session id) decided by a
            DIFFERENT administrator, raised under People → Administrators → Approvals. The overall score is
            recomputed server-side from the published weights — it cannot be set directly.
          </p>
        </section>
      </div>

      {correcting && canSupersede && (
        <section className="mt-4 rounded-[10px] border border-[var(--color-reliability-moderate)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-reliability-moderate)] mb-2">
            Reviewed score correction (dual-approved, versioned, decision-trailed)
          </h2>
          <div className="grid gap-2 md:grid-cols-3">
            {Object.entries(draftScores).map(([k, v]) => (
              <label key={k} className="font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
                {k}
                <input type="number" min="0" max="100" className={`${field} w-full mt-1 tabular-nums`}
                  value={v} onChange={(e) => setDraftScores({ ...draftScores, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <label className="block mt-3 font-mono text-[11px] uppercase text-[var(--color-ink-muted)]">
            Reason (10+ characters, recorded everywhere)
            <input className={`${field} w-full mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" className={btn} onClick={submitCorrection}>Submit correction</button>
            <p className="font-mono text-[10px] text-[var(--color-ink-muted)]">
              Overall is NOT an input — the server recomputes it from the canonical weights.
            </p>
          </div>
        </section>
      )}

      <section className="mt-4 mb-10 rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)]">
        <h2 className="p-4 pb-0 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Version history</h2>
        {versions.length === 0 ? (
          <p className="p-4 font-sans text-sm text-[var(--color-ink-muted)]">Single version — never corrected.</p>
        ) : (
          versions.map((v) => (
            <div key={v.version_id} className="p-4 border-b border-[var(--color-line)] last:border-0 flex items-center gap-3 flex-wrap font-sans text-[13px]">
              <Pill tone={v.kind === 'correction' ? 'warn' : 'muted'}>v{v.version} · {v.kind}</Pill>
              <span className="text-[var(--color-ink)]">“{v.reason}”</span>
              <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">{v.created_by || 'system'} · {when(v.created_at)}</span>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

export default AdminReports
