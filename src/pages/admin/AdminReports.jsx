import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { adminFetch, adminHasPermission } from '../../lib/adminApi.js'
import {
  useAdminList, PageHeader, ErrorNotice, Notice, Toolbar, SearchBox, DataTable, Pager,
  Pill, btn, field, when, mono, actWithReason,
} from './ui.jsx'

// ── Review requests (P5.7) — a learner asked for a human review ─────────────
// OPEN cases only: ids, category and the learner's stated reason. Deciding
// records an append-only decision; CORRECT publishes a NEW report version
// without the named evidence units. Nothing here edits a version.
const DECISIONS = ['UPHOLD', 'CORRECT', 'REJECT']
const CATEGORY = { TRANSCRIPTION: 'transcription', ATTRIBUTION: 'attribution', SCENARIO_FACT: 'scenario fact', INTERPRETATION: 'interpretation', OTHER: 'other' }

function DecideForm({ item, onDone }) {
  const [decision, setDecision] = useState('UPHOLD')
  const [reason, setReason] = useState('')
  const [withhold, setWithhold] = useState(item.momentId || '')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (reason.trim().length < 10) { setError('A specific reason (>= 10 characters) is required.'); return }
    const ids = withhold.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
    if (decision === 'CORRECT' && !ids.length) { setError('A correction names at least one evidence unit id to withhold.'); return }
    setBusy(true)
    try {
      const out = await adminFetch(`/api/admin/report-reviews/${item.id}/decide`, {
        method: 'POST',
        body: { decision, reason: reason.trim(), ...(decision === 'CORRECT' ? { correction: { withholdEvidenceIds: ids, ...(note.trim() ? { note: note.trim() } : {}) } } : {}) },
      })
      onDone(out)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 rounded-[6px] border border-prism-border bg-prism-subtle p-3 text-[13px]" aria-label={`Decide review ${item.id.slice(0, 8)}`} data-testid="review-decide-form">
      <label className="grid gap-1">
        <span className="font-medium">Decision</span>
        <select className={field} value={decision} onChange={(e) => setDecision(e.target.value)}>
          {DECISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="font-medium">Reason (recorded with the decision)</span>
        <textarea className={field} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={10} maxLength={2000} />
      </label>
      {decision === 'CORRECT' && (
        <>
          <label className="grid gap-1">
            <span className="font-medium">Evidence unit ids to withhold (comma separated)</span>
            <input className={field} value={withhold} onChange={(e) => setWithhold(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="font-medium">Correction note (optional)</span>
            <input className={field} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </label>
          <p className="text-prism-ink-muted">Publishes a new report version built without these units. The original version is kept unchanged.</p>
        </>
      )}
      {error && <p role="alert" className="text-prism-blocked">{error}</p>}
      <div><button type="submit" className={btn} disabled={busy}>{busy ? 'Recording…' : 'Record decision'}</button></div>
    </form>
  )
}

export function ReviewRequestsPanel() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(null)
  const canReview = adminHasPermission('reports:review')
  const load = useCallback(async () => {
    setError('')
    try { setItems((await adminFetch('/api/admin/report-reviews')).items || []) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { if (canReview) load() }, [canReview, load])
  if (!canReview) return null
  return (
    <section className="mt-8" aria-labelledby="review-requests-title" data-testid="review-requests">
      <h2 id="review-requests-title" className="font-display text-[15px] font-semibold text-prism-ink">Review requests</h2>
      <p className="mb-2 text-[12px] text-prism-ink-muted">Open learner requests for a human review of a published report version. A correction is a new version; nothing is rewritten.</p>
      <ErrorNotice error={error} />
      {notice && <Notice>{notice}</Notice>}
      <DataTable
        busy={items === null}
        rowKey={(r) => r.id}
        onRowClick={(r) => setOpen((o) => (o === r.id ? null : r.id))}
        columns={[
          { key: 'sessionId', label: 'Session', render: (r) => `${mono(r.sessionId, 13)}…`, className: 'font-mono text-[12px]' },
          { key: 'version', label: 'Version', className: 'font-mono text-[12px]' },
          { key: 'category', label: 'Category', render: (r) => CATEGORY[r.category] || r.category },
          { key: 'momentId', label: 'Moment', render: (r) => r.momentId || '—', className: 'font-mono text-[11px]' },
          { key: 'reason', label: 'Learner reason', render: (r) => <span className="line-clamp-2">{r.reason}</span> },
          { key: 'createdAt', label: 'Opened', render: (r) => when(r.createdAt), className: 'whitespace-nowrap font-mono text-[11px]' },
        ]}
        rows={items || []}
        empty="No open review requests."
      />
      {open && items?.some((r) => r.id === open) && (
        <DecideForm
          item={items.find((r) => r.id === open)}
          onDone={(out) => {
            setOpen(null)
            setNotice(out.publishedVersion ? `Decision recorded. Corrected report published as version ${out.publishedVersion.version} (replacing ${out.publishedVersion.priorVersion}).` : `Decision recorded: ${out.decision.decision}.`)
            load()
          }}
        />
      )}
    </section>
  )
}

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
          { key: 'reliability', label: 'Panel consistency' },
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
      <ReviewRequestsPanel />
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
      <div className="p-8 flex items-center gap-2 font-sans text-sm text-[var(--prism-ink-muted)]">
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
        // Empty inputs stay null — an Insufficient-evidence dimension can never
        // be given a number by a correction (the server enforces this too).
        body: { scores: Object.fromEntries(Object.entries(draftScores).map(([k, v]) => [k, v === '' || v == null ? null : Number(v)])), reason: reason.trim() },
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
        <section className="rounded-[10px] border border-[var(--prism-border)] bg-[var(--prism-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--prism-ink-muted)] mb-2">Dimension scores</h2>
          <dl className="mt-2 font-sans text-[13px] text-[var(--prism-ink)] space-y-0.5">
            {Object.entries(report.scores || {}).filter(([k]) => k !== 'overall').map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt className="text-[var(--prism-ink-muted)]">{k}</dt><dd className="tabular-nums">{v ?? 'insufficient evidence'}</dd></div>
            ))}
          </dl>
          <p className="mt-2 font-mono text-[11px] text-[var(--prism-ink-muted)]">
            panel consistency {report.reliability?.level || report.reliability?.label || '—'} · composite: internal (research plane only)
          </p>
          {report.correction && (
            <p className="mt-1 font-mono text-[11px] text-[var(--status-partial-ink)]">
              corrected {when(report.correction.correctedAt)}. “{report.correction.reason}”
            </p>
          )}
        </section>

        <section className="rounded-[10px] border border-[var(--prism-border)] bg-[var(--prism-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--prism-ink-muted)] mb-2">Delivery & lifecycle</h2>
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
          {!mailEnabled && <p className="mt-2 font-mono text-[10px] text-[var(--prism-ink-muted)]">Resend disabled: SMTP is not configured.</p>}
          <p className="mt-2 font-mono text-[10px] text-[var(--prism-ink-muted)] leading-relaxed">
            Supersession requires an approval row (action “supersede_report”, this session id) decided by a
            DIFFERENT administrator, raised under People → Administrators → Approvals. The internal composite is
            recomputed server-side from the published weights — it cannot be set directly and is not shown here.
          </p>
        </section>
      </div>

      {correcting && canSupersede && (
        <section className="mt-4 rounded-[10px] border border-[var(--status-partial-ink)] bg-[var(--prism-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--status-partial-ink)] mb-2">
            Reviewed score correction (dual-approved, versioned, decision-trailed)
          </h2>
          <div className="grid gap-2 md:grid-cols-3">
            {Object.entries(draftScores).map(([k, v]) => (
              <label key={k} className="font-mono text-[11px] uppercase text-[var(--prism-ink-muted)]">
                {k}
                <input type="number" min="0" max="100" className={`${field} w-full mt-1 tabular-nums`}
                  value={v ?? ''} onChange={(e) => setDraftScores({ ...draftScores, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <label className="block mt-3 font-mono text-[11px] uppercase text-[var(--prism-ink-muted)]">
            Reason (10+ characters, recorded everywhere)
            <input className={`${field} w-full mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" className={btn} onClick={submitCorrection}>Submit correction</button>
            <p className="font-mono text-[10px] text-[var(--prism-ink-muted)]">
              The composite is NOT an input — the server recomputes it internally from the canonical weights.
              Dimensions issued as “Insufficient evidence” must stay empty — a correction can never invent a score.
            </p>
          </div>
        </section>
      )}

      <section className="mt-4 mb-10 rounded-[10px] border border-[var(--prism-border)] bg-[var(--prism-surface)]">
        <h2 className="p-4 pb-0 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--prism-ink-muted)]">Version history</h2>
        {versions.length === 0 ? (
          <p className="p-4 font-sans text-sm text-[var(--prism-ink-muted)]">Single version — never corrected.</p>
        ) : (
          versions.map((v) => (
            <div key={v.version_id} className="p-4 border-b border-[var(--prism-border)] last:border-0 flex items-center gap-3 flex-wrap font-sans text-[13px]">
              <Pill tone={v.kind === 'correction' ? 'warn' : 'muted'}>v{v.version} · {v.kind}</Pill>
              <span className="text-[var(--prism-ink)]">“{v.reason}”</span>
              <span className="font-mono text-[11px] text-[var(--prism-ink-muted)]">{v.created_by || 'system'} · {when(v.created_at)}</span>
            </div>
          ))
        )}
      </section>
    </div>
  )
}

export default AdminReports
