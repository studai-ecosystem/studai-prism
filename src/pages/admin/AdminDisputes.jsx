import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { adminFetch, adminHasPermission, currentAdmin } from '../../lib/adminApi.js'
import {
  useAdminList, PageHeader, ErrorNotice, Notice, Toolbar, DataTable, Pager,
  Pill, btn, field, when, mono,
} from './ui.jsx'

// ── /admin/disputes — dispute workspace (Phase 2, §10 state machine) ─────────

const STATE_TONE = {
  open: 'info', assigned: 'info', evidence_gathering: 'warn', human_review: 'warn',
  awaiting_candidate: 'muted', decision_proposed: 'warn', resolved: 'ok',
  rejected: 'danger', reopened: 'info',
}

export function AdminDisputes() {
  const navigate = useNavigate()
  const { data, error, busy, params, setFilter, setPage, reload } = useAdminList('/api/admin/disputes')

  return (
    <div className="p-6 max-w-6xl">
      <PageHeader
        title="Disputes"
        subtitle="The candidate's statement is never edited. Score consequences run through the report supersession workflow, not here."
      />
      <ErrorNotice error={error} />
      <Toolbar onRefresh={reload} busy={busy}>
        <select aria-label="Workflow state" className={field} value={params.state || ''}
          onChange={(e) => setFilter({ state: e.target.value || undefined })}>
          <option value="">All states</option>
          {(data?.states || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Toolbar>
      <DataTable
        busy={busy}
        rowKey={(d) => d.sessionId}
        onRowClick={(d) => navigate(`/admin/disputes/${d.sessionId}`)}
        columns={[
          { key: 'sessionId', label: 'Session', render: (d) => `${mono(d.sessionId, 13)}…`, className: 'font-mono text-[12px]' },
          { key: 'reason', label: 'Statement', render: (d) => <span className="line-clamp-2">{d.reason}</span> },
          {
            key: 'state', label: 'Workflow',
            render: (d) => <Pill tone={STATE_TONE[d.workflow?.state] || 'muted'}>{d.workflow?.state || 'open'}</Pill>,
          },
          { key: 'assigned', label: 'Assignee', render: (d) => d.workflow?.assignedEmail || '—', className: 'font-mono text-[11px]' },
          { key: 'at', label: 'Opened', render: (d) => when(d.at), className: 'whitespace-nowrap font-mono text-[11px]' },
        ]}
        rows={data?.rows}
        empty="No disputes."
      />
      <Pager data={data} onPage={setPage} />
    </div>
  )
}

// ── /admin/disputes/:sessionId ────────────────────────────────────────────────

export function AdminDisputeDetail() {
  const { sessionId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const canManage = adminHasPermission('disputes:manage')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await adminFetch(`/api/admin/disputes/${sessionId}`))
    } catch (err) {
      setError(err.message)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  if (!data && !error) {
    return (
      <div className="p-8 flex items-center gap-2 font-sans text-sm text-[var(--color-ink-muted)]">
        <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading dispute…
      </div>
    )
  }
  if (error && !data) return <div className="p-6"><ErrorNotice error={error} /></div>

  const { dispute, workflow, allowedTransitions, related, notes, audit } = data

  const run = async (fn, okMsg) => {
    setError(''); setNotice('')
    try {
      const r = await fn()
      if (r === null) return
      if (okMsg) setNotice(okMsg)
      await load()
    } catch (err) { setError(err.message) }
  }

  const transition = (state) =>
    run(async () => {
      const reason = window.prompt(`Reason for moving to '${state}' (audited):`)
      if (!reason) return null
      let decision
      if (state === 'resolved' || state === 'rejected') {
        decision = window.prompt('Written decision (10+ characters, shown in the record):')
        if (!decision) return null
      }
      return adminFetch(`/api/admin/disputes/${sessionId}/transition`, {
        method: 'POST', body: { state, reason, ...(decision ? { decision } : {}) },
      })
    }, `Moved to ${state}.`)

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader title={`Dispute ${sessionId.slice(0, 13)}…`} subtitle={`opened ${when(dispute.at)}`}>
        <Pill tone={STATE_TONE[workflow.state] || 'muted'}>{workflow.state}</Pill>
      </PageHeader>
      <ErrorNotice error={error} />
      <Notice>{notice}</Notice>

      <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Candidate statement (read-only)</h2>
        <p className="font-sans text-sm text-[var(--color-ink)] whitespace-pre-wrap">{dispute.reason}</p>
        <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-muted)]">contact: {dispute.contact || '—'}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Related evidence</h2>
          <ul className="font-sans text-[13px] text-[var(--color-ink)] space-y-1">
            <li><Link className="text-[var(--color-accent)] underline" to={`/admin/sessions/${sessionId}`}>Session file →</Link></li>
            <li>
              {related.report
                ? <Link className="text-[var(--color-accent)] underline" to={`/admin/reports/${sessionId}`}>
                    Report — overall {related.report.overall}{related.report.correction ? ` (corrected v${related.report.correction.version})` : ''} →
                  </Link>
                : 'No report issued.'}
            </li>
            <li>{related.integrityEventCount} integrity event{related.integrityEventCount === 1 ? '' : 's'}</li>
          </ul>
          <p className="mt-3 font-mono text-[10px] text-[var(--color-ink-muted)] leading-relaxed">
            Upholding a score dispute = raise a “supersede_report” approval, have a second administrator
            approve it, then apply the correction on the report page. This page never touches scores.
          </p>
        </section>

        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Workflow</h2>
          <p className="font-sans text-[13px] text-[var(--color-ink)]">
            Assignee: {workflow.assignedEmail || 'unassigned'}
            {workflow.decision && <><br />Decision: “{workflow.decision}” — {workflow.decidedBy}, {when(workflow.decidedAt)}</>}
          </p>
          {canManage && (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btn}
                  onClick={() => run(async () => {
                    const me = currentAdmin()
                    return adminFetch(`/api/admin/disputes/${sessionId}/assign`, {
                      method: 'POST', body: { adminId: me.id, reason: 'self-assigned' },
                    })
                  }, 'Assigned to you.')}>
                  Assign to me
                </button>
                {allowedTransitions.map((s) => (
                  <button key={s} type="button" className={btn} onClick={() => transition(s)}>→ {s}</button>
                ))}
              </div>
              <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-muted)]">
                Only legal §10 transitions are offered; the server enforces the machine regardless.
              </p>
            </>
          )}
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mt-4 mb-10">
        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">Notes</h2>
          {notes.length === 0 ? <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">No notes.</p> :
            notes.map((n) => (
              <p key={n.note_id} className="font-sans text-[13px] text-[var(--color-ink)] py-1.5 border-b border-[var(--color-line)] last:border-0">
                {n.body} <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">— {n.author}, {when(n.created_at)}</span>
              </p>
            ))}
          <button type="button" className={`${btn} mt-2`}
            onClick={() => run(async () => {
              const body = window.prompt('Note (internal):')
              if (!body) return null
              return adminFetch(`/api/admin/disputes/${sessionId}/notes`, { method: 'POST', body: { body } })
            }, 'Note added.')}>
            Add note
          </button>
        </section>

        <section className="rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)] mb-2">History</h2>
          {audit.length === 0 ? <p className="font-sans text-[13px] text-[var(--color-ink-muted)]">No events.</p> :
            audit.map((a, i) => (
              <p key={i} className="font-sans text-[13px] text-[var(--color-ink)] py-1 border-b border-[var(--color-line)] last:border-0">
                <span className="font-mono text-[12px]">{a.action}</span>
                <span className="text-[var(--color-ink-muted)]"> — {a.admin_email}{a.reason ? `, “${a.reason}”` : ''}, {when(a.created_at)}</span>
              </p>
            ))}
        </section>
      </div>
    </div>
  )
}

export default AdminDisputes
